import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { decryptText } from '@/lib/crypto'

export async function POST(request: NextRequest) {
  const _auth = await requireAuth(request)
  if (_auth instanceof NextResponse) return _auth
  try {
    const { projectId, analysisType = 'comprehensive', passphrase } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Get all messages for this project
    const { data: dbMessages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('project_id', projectId)

    if (msgError) throw msgError

    // Decrypt messages in memory if passphrase is provided
    const messages = await Promise.all(
      (dbMessages || []).map(async (msg) => {
        let decryptedMessage = msg.message
        let decryptedSender = msg.sender

        if (passphrase) {
          try {
            const messageEnc = JSON.parse(msg.message)
            if (messageEnc.ciphertext && messageEnc.salt && messageEnc.iv) {
              decryptedMessage = await decryptText(
                messageEnc.ciphertext,
                passphrase,
                messageEnc.salt,
                messageEnc.iv
              )
            }
          } catch (e) {
            // Treat as plaintext fallback
          }

          try {
            const senderEnc = JSON.parse(msg.sender)
            if (senderEnc.ciphertext && senderEnc.salt && senderEnc.iv) {
              decryptedSender = await decryptText(
                senderEnc.ciphertext,
                passphrase,
                senderEnc.salt,
                senderEnc.iv
              )
            }
          } catch (e) {
            // Treat as plaintext fallback
          }
        }

        return {
          id: msg.id,
          projectId: msg.project_id,
          sender: decryptedSender,
          message: decryptedMessage,
          timestamp: msg.timestamp
        }
      })
    )

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages found for this project' }, { status: 404 })
    }

    // Perform different types of analysis
    let analysisResult = {}

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

    scores[overallSentiment]++

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
      positive: Math.round((scores.positive / messages.length) * 100),
      negative: Math.round((scores.negative / messages.length) * 100),
      neutral: Math.round((scores.neutral / messages.length) * 100)
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
    generatedAt: new Date().toISOString()
  }
} 