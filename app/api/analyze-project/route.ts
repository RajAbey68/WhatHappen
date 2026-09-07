import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import {
  requireProjectAccess,
  hasAnyProjectCredential,
  missingCredentialResponse,
} from '@/lib/api-auth'
import { decryptText } from '@/lib/crypto'
import { SwarmManager } from '@/lib/swarm/SwarmManager'
import { AgentConfig } from '@/lib/types/agent'

async function safeDecryptField(field: string, passphrase?: string): Promise<string> {
  if (!passphrase || !field) return field
  try {
    const enc = JSON.parse(field)
    if (enc && typeof enc === 'object' && enc.ciphertext && enc.salt && enc.iv) {
      return await decryptText(enc.ciphertext, passphrase, enc.salt, enc.iv)
    }
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      return field
    }
    throw new Error(`Decryption failed: ${err?.message || 'Invalid passphrase or tampered ciphertext'}`)
  }
  return field
}

export async function POST(request: NextRequest) {
  // RAJ-780: reject credential-less callers BEFORE parsing the body, so an
  // anonymous request cannot make us parse a large payload first.
  if (!hasAnyProjectCredential(request)) return missingCredentialResponse()

  try {
    const body = await request.json()
    const { projectId, analysisType = 'comprehensive' } = body
    const passphrase = body.passphrase || process.env.PROJECT_PASSPHRASE

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // RAJ-780: reads and decrypts every message in the project. Was unauthenticated
    // while using the service-role client, so RLS offered no protection here.
    const authError = await requireProjectAccess(request, projectId)
    if (authError) return authError

    const supabase = getServiceClient()

    // Fast-path 1: If project already has pre-computed analysis and caller wants timeline or comprehensive, return immediately
    const { data: projectRow } = await supabase
      .from('projects')
      .select('analysis, message_count')
      .eq('id', projectId)
      .maybeSingle()

    if (projectRow?.analysis) {
      if (analysisType === 'timeline' && projectRow.analysis.timeGroups) {
        return NextResponse.json({
          success: true,
          analysis: projectRow.analysis,
          messageCount: projectRow.message_count || 0,
          analysisType: 'timeline',
          cached: true
        })
      }
      if (analysisType === 'comprehensive' && projectRow.analysis.type) {
        return NextResponse.json({
          success: true,
          analysis: projectRow.analysis,
          messageCount: projectRow.message_count || 0,
          analysisType: 'comprehensive',
          cached: true
        })
      }
    }

    // Fast-path 2: If analysisType is purely 'timeline', we only need timestamps and raw sender tokens (no message text decryption needed)
    if (analysisType === 'timeline') {
      const { data: timelineRows, error: timeErr } = await supabase
        .from('messages')
        .select('sender, timestamp')
        .eq('project_id', projectId)

      if (timeErr) throw timeErr
      const timelineResult = performTimelineAnalysis(timelineRows || [])
      return NextResponse.json({
        success: true,
        analysis: timelineResult,
        messageCount: (timelineRows || []).length,
        analysisType: 'timeline'
      })
    }

    // Get all messages for this project
    const { data: dbMessages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('project_id', projectId)

    if (msgError) throw msgError

    // Decrypt messages in memory if passphrase is provided
    let messages: any[] = []
    try {
      messages = await Promise.all(
        (dbMessages || []).map(async (msg) => {
          const decryptedMessage = await safeDecryptField(msg.message, passphrase)
          const decryptedSender = await safeDecryptField(msg.sender, passphrase)

          return {
            id: msg.id,
            projectId: msg.project_id,
            sender: decryptedSender,
            message: decryptedMessage,
            timestamp: msg.timestamp
          }
        })
      )
    } catch (cryptoErr: any) {
      return NextResponse.json(
        { error: `Message decryption failed: ${cryptoErr.message}` },
        { status: 400 }
      )
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages found for this project' }, { status: 404 })
    }

    // Perform different types of analysis
    let analysisResult: any = {}

    if (analysisType === 'comprehensive_swarm') {
      const config: AgentConfig = {
        jurisdiction: 'UK',
        regulator: 'FCA',
        expertId: 'LEGAL_COUNSEL'
      }
      const swarm = new SwarmManager(messages, config)
      const swarmResult = await swarm.analyze()
      
      analysisResult = {
        type: 'comprehensive_swarm',
        overall: swarmResult.ledger,
        sentiment: swarmResult.sentimentTimeline,
        synthesis: swarmResult.finalSynthesis,
        generatedAt: new Date().toISOString()
      }
    } else {
      switch (analysisType) {
        case 'sentiment':
          analysisResult = performSentimentAnalysis(messages)
          break
        case 'financial':
          analysisResult = performFinancialAnalysis(messages)
          break
        case 'timeline':
          analysisResult = performTimelineAnalysis(messages)
          break
        case 'comprehensive':
        default:
          analysisResult = performComprehensiveAnalysis(messages)
          break
      }
    }

    // Update project with new analysis
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        analysis: analysisResult,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      analysis: analysisResult,
      messageCount: messages.length,
      analysisType
    })

  } catch (error) {
    console.error('Error analyzing project:', error)
    return NextResponse.json({ error: 'Failed to analyze project' }, { status: 500 })
  }
}

function performSentimentAnalysis(messages: any[]) {
  const sentimentWords = {
    positive: ['good', 'great', 'awesome', 'amazing', 'love', 'excellent', 'perfect', 'wonderful', 'fantastic', 'brilliant'],
    negative: ['bad', 'terrible', 'awful', 'hate', 'horrible', 'worst', 'problem', 'issue', 'disappointed', 'frustrated'],
    financial_positive: ['profit', 'gain', 'success', 'achievement', 'bonus', 'reward'],
    financial_negative: ['loss', 'debt', 'expense', 'cost', 'payment', 'bill', 'owe', 'borrowed']
  }

  let scores = { positive: 0, negative: 0, neutral: 0, financial_positive: 0, financial_negative: 0 }
  let classifications = { positive: 0, negative: 0, neutral: 0 }
  let messageAnalysis: any[] = []

  messages.forEach(msg => {
    const text = msg.message.toLowerCase()
    let msgScore = { positive: 0, negative: 0, financial_positive: 0, financial_negative: 0 }

    Object.entries(sentimentWords).forEach(([category, words]) => {
      const count = words.filter(word => text.includes(word)).length
      msgScore[category as keyof typeof msgScore] = count
      scores[category as keyof typeof scores] += count
    })

    const overallSentiment = msgScore.positive > msgScore.negative ? 'positive' :
                            msgScore.negative > msgScore.positive ? 'negative' : 'neutral'

    classifications[overallSentiment]++

    messageAnalysis.push({
      messageId: msg.id,
      sender: msg.sender,
      sentiment: overallSentiment,
      scores: msgScore,
      timestamp: msg.timestamp
    })
  })

  return {
    type: 'sentiment',
    overall: scores,
    percentages: {
      positive: Math.round((classifications.positive / messages.length) * 100),
      negative: Math.round((classifications.negative / messages.length) * 100),
      neutral: Math.round((classifications.neutral / messages.length) * 100)
    },
    messageAnalysis: messageAnalysis.slice(0, 50), // Limit for storage
    generatedAt: new Date().toISOString()
  }
}

function performFinancialAnalysis(messages: any[]) {
  const financialPatterns = {
    amounts: /[\$₹€£¥]\s*\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|rupees?|euros?|pounds?|yen)/gi,
    payments: /\b(?:pay|paid|payment|transfer|send|sent|receive|received|owe|owes|borrowed|lent)\b/gi,
    financial_terms: /\b(?:money|cash|bank|account|credit|debit|loan|debt|interest|profit|loss|expense|cost|budget|invoice|bill)\b/gi
  }

  let financialMentions: any[] = []
  let totalAmounts: number[] = []
  let paymentKeywords = new Set<string>()

  messages.forEach(msg => {
    const text = msg.message

    // Extract monetary amounts
    const amounts = text.match(financialPatterns.amounts) || []
         amounts.forEach((amount: string) => {
       const numericValue = parseFloat(amount.replace(/[^\d.]/g, ''))
       if (!isNaN(numericValue)) {
         totalAmounts.push(numericValue)
       }
     })

    // Extract payment-related mentions
    const payments = text.match(financialPatterns.payments) || []
    const terms = text.match(financialPatterns.financial_terms) || []

    if (amounts.length > 0 || payments.length > 0 || terms.length > 0) {
      financialMentions.push({
        messageId: msg.id,
        sender: msg.sender,
        timestamp: msg.timestamp,
        amounts,
        payments,
        terms,
        fullMessage: text
      })

             payments.forEach((p: string) => paymentKeywords.add(p.toLowerCase()))
       terms.forEach((t: string) => paymentKeywords.add(t.toLowerCase()))
    }
  })

  return {
    type: 'financial',
    summary: {
      totalFinancialMentions: financialMentions.length,
      uniqueAmounts: totalAmounts.length,
      totalValue: totalAmounts.reduce((sum, val) => sum + val, 0),
      averageAmount: totalAmounts.length > 0 ? totalAmounts.reduce((sum, val) => sum + val, 0) / totalAmounts.length : 0,
      keyTerms: Array.from(paymentKeywords).slice(0, 20)
    },
    mentions: financialMentions.slice(0, 100), // Limit for storage
    amounts: totalAmounts.slice(0, 50),
    generatedAt: new Date().toISOString()
  }
}

function performTimelineAnalysis(messages: any[]) {
  // Group messages by time periods
  const timeGroups = {
    hourly: {} as Record<string, number>,
    daily: {} as Record<string, number>,
    weekly: {} as Record<string, number>,
    monthly: {} as Record<string, number>
  }

  const participantActivity = {} as Record<string, Record<string, number>>

  messages.forEach(msg => {
    try {
      const date = new Date(msg.timestamp)
      if (isNaN(date.getTime())) return

      const hour = `${date.getHours()}:00`
      const day = date.toISOString().split('T')[0]
      const week = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`
      const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`

      timeGroups.hourly[hour] = (timeGroups.hourly[hour] || 0) + 1
      timeGroups.daily[day] = (timeGroups.daily[day] || 0) + 1
      timeGroups.weekly[week] = (timeGroups.weekly[week] || 0) + 1
      timeGroups.monthly[month] = (timeGroups.monthly[month] || 0) + 1

      // Track participant activity
      if (!participantActivity[msg.sender]) {
        participantActivity[msg.sender] = {}
      }
      participantActivity[msg.sender][day] = (participantActivity[msg.sender][day] || 0) + 1

    } catch (error) {
      // Skip invalid timestamps
    }
  })

  return {
    type: 'timeline',
    timeGroups,
    participantActivity,
    insights: {
      mostActiveHour: Object.entries(timeGroups.hourly).sort(([,a], [,b]) => b - a)[0],
      mostActiveDay: Object.entries(timeGroups.daily).sort(([,a], [,b]) => b - a)[0],
      totalDays: Object.keys(timeGroups.daily).length,
      averageMessagesPerDay: Math.round(messages.length / Object.keys(timeGroups.daily).length)
    },
    generatedAt: new Date().toISOString()
  }
}

function performComprehensiveAnalysis(messages: any[]) {
  return {
    type: 'comprehensive',
    sentiment: performSentimentAnalysis(messages),
    financial: performFinancialAnalysis(messages),
    timeline: performTimelineAnalysis(messages),
    averageResponseTimes: calculateResponseTimes(messages),
    generatedAt: new Date().toISOString()
  }
}

function calculateResponseTimes(messages: any[]) {
  const responseTimesByParticipant: Record<string, number[]> = {}
  let lastMessage: any = null

  // Ensure messages are sorted by timestamp
  const sorted = [...messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  for (const message of sorted) {
    const msgTime = new Date(message.timestamp).getTime()
    if (isNaN(msgTime)) continue

    if (lastMessage && lastMessage.sender !== message.sender) {
      const lastTime = new Date(lastMessage.timestamp).getTime()
      if (!isNaN(lastTime)) {
        const diffMs = msgTime - lastTime
        if (diffMs > 0 && diffMs < 12 * 60 * 60 * 1000) {
          if (!responseTimesByParticipant[message.sender]) {
            responseTimesByParticipant[message.sender] = []
          }
          responseTimesByParticipant[message.sender].push(diffMs / 1000)
        }
      }
    }
    lastMessage = message
  }

  const averageResponseTimes: Record<string, number> = {}
  Object.entries(responseTimesByParticipant).forEach(([sender, times]) => {
    const total = times.reduce((sum, t) => sum + t, 0)
    averageResponseTimes[sender] = times.length > 0 ? Math.round(total / times.length) : 0
  })

  return averageResponseTimes
} 