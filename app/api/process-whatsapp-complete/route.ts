import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'

// Allow up to 5 minutes for large file processing (requires Vercel Pro)
export const maxDuration = 300

// Batch size for Supabase inserts (PostgREST has practical row limits)
const INSERT_BATCH_SIZE = 500

interface WhatsAppMessage {
  timestamp: string
  sender: string
  message: string
}

interface ProcessingResult {
  totalMessages: number
  participants: string[]
  dateRange: { start: string; end: string }
  topSenders: { name: string; count: number }[]
  messagesByDay: { date: string; count: number }[]
  keywords: string[]
  sentimentAnalysis: {
    positive: number
    negative: number
    neutral: number
  }
  financialTerms: string[]
}

export async function POST(request: NextRequest) {
  const supabase = getServiceClient()
  try {
    const contentType = request.headers.get('content-type') || ''
    
    let projectId: string
    let messages: any[] = []
    let dbAnalysis: any
    let responsePayload: any

    if (contentType.includes('application/json')) {
      const body = await request.json()
      projectId = body.projectId
      
      const chatData = body.chatData
      messages = body.messages || chatData?.messages || []
      
      const clientAnalysis = body.analysis || chatData?.analysis || {}
      const totalMessagesCount = body.messages ? body.messages.length : (chatData?.totalMessages || messages.length || 0)
      
      dbAnalysis = {
        participants: clientAnalysis.participants || [],
        dateRange: clientAnalysis.dateRange || { start: '', end: '' },
        sentiment: clientAnalysis.sentimentAnalysis || clientAnalysis.sentiment || { positive: 0, negative: 0, neutral: 100 },
        keywords: clientAnalysis.keywords || [],
        insights: clientAnalysis.insights || []
      }

      if (!projectId) {
        return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
      }

      responsePayload = {
        success: true,
        messageCount: totalMessagesCount
      }
    } else {
      // Legacy FormData fallback
      const formData = await request.formData()
      const file = formData.get('file') as File
      projectId = formData.get('projectId') as string

      if (!file || !projectId) {
        return NextResponse.json({ error: 'No file or project ID provided' }, { status: 400 })
      }

      // Process the file on the server
      const text = await file.text()
      const rawMessages = parseWhatsAppChat(text)
      const rawAnalysis = generateComprehensiveAnalysis(rawMessages)
      
      messages = rawMessages
      dbAnalysis = {
        participants: rawAnalysis.participants,
        dateRange: rawAnalysis.dateRange,
        sentiment: rawAnalysis.sentimentAnalysis,
        keywords: rawAnalysis.keywords,
        insights: generateInsights(rawAnalysis)
      }

      responsePayload = {
        success: true,
        analysis: rawAnalysis,
        messageCount: messages.length
      }
    }

    // Store messages in Supabase if present (batched insert to avoid PostgREST row limits)
    if (messages.length > 0) {
      const messagesToInsert = messages.map(message => ({
        project_id: projectId,
        sender: message.sender,
        message: message.message,
        timestamp: message.timestamp,
        processed: true
      }))

      // Insert in batches of INSERT_BATCH_SIZE
      for (let i = 0; i < messagesToInsert.length; i += INSERT_BATCH_SIZE) {
        const batch = messagesToInsert.slice(i, i + INSERT_BATCH_SIZE)
        const { error: batchError } = await supabase
          .from('messages')
          .insert(batch)

        if (batchError) throw batchError
      }
    }

    // Update project with analysis
    const totalMessagesCount = responsePayload.messageCount
    const { error: projectUpdateError } = await supabase
      .from('projects')
      .update({
        message_count: totalMessagesCount,
        participants: dbAnalysis.participants,
        date_range: dbAnalysis.dateRange,
        analysis: {
          sentiment: dbAnalysis.sentiment,
          keywords: dbAnalysis.keywords,
          insights: dbAnalysis.insights
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)

    if (projectUpdateError) throw projectUpdateError

    return NextResponse.json(responsePayload)

  } catch (error) {
    console.error('Error processing WhatsApp file:', error)
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 })
  }
}

function parseWhatsAppChat(text: string): WhatsAppMessage[] {
  const lines = text.split('\n')
  const messages: WhatsAppMessage[] = []
  
  // Enhanced WhatsApp chat parsing with multiple format support
  const patterns = [
    // [MM/DD/YY, HH:MM:SS AM/PM] Sender: Message
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}:?\d{0,2}(?:\s*[APap][Mm])?)\]\s*([^:]+):\s*(.+)$/,
    // MM/DD/YY, HH:MM AM/PM - Sender: Message
    /^(\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\s*-\s*([^:]+):\s*(.+)$/,
    // DD/MM/YYYY, HH:MM - Sender: Message (European format)
    /^(\d{1,2}\/\d{1,2}\/\d{4},?\s*\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.+)$/
  ]
  
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match) {
        messages.push({
          timestamp: match[1],
          sender: match[2].trim(),
          message: match[3].trim()
        })
        break
      }
    }
  }
  
  return messages
}

function generateComprehensiveAnalysis(messages: WhatsAppMessage[]): ProcessingResult {
  const participants = Array.from(new Set(messages.map(m => m.sender)))
  
  // O(n) single-pass sender counting (was O(n²) with filter per participant)
  const senderCountMap = new Map<string, number>()
  for (const msg of messages) {
    senderCountMap.set(msg.sender, (senderCountMap.get(msg.sender) || 0) + 1)
  }
  const senderCounts = Array.from(senderCountMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // Date range analysis
  const dates = messages.map(m => m.timestamp).filter(Boolean)
  const dateRange = dates.length > 0 ? {
    start: dates[0],
    end: dates[dates.length - 1]
  } : { start: '', end: '' }

  // Advanced keyword extraction
  const allText = messages.map(m => m.message).join(' ').toLowerCase()
  const words = allText.split(/\s+/).filter(word => 
    word.length > 3 && 
    !['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'were', 'said'].includes(word)
  )
  
  const wordCounts = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const keywords = Object.entries(wordCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .map(([word]) => word)

  // Financial terms detection
  const financialKeywords = [
    'payment', 'money', 'paid', 'pay', 'cost', 'price', 'expense', 'budget',
    'invoice', 'bill', 'dollar', 'rupee', 'euro', 'pound', 'yen', 'crypto',
    'bank', 'account', 'transfer', 'loan', 'debt', 'credit', 'finance',
    'upfront', '24000', '$24,000', 'thousand'
  ]
  
  const financialTerms = financialKeywords.filter(term => 
    allText.includes(term.toLowerCase())
  )

  // Basic sentiment analysis (simplified)
  const positiveWords = ['good', 'great', 'awesome', 'amazing', 'love', 'excellent', 'perfect', 'wonderful']
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'worst', 'problem', 'issue']
  
  let positive = 0, negative = 0, neutral = 0
  
  messages.forEach(msg => {
    const msgLower = msg.message.toLowerCase()
    const hasPositive = positiveWords.some(word => msgLower.includes(word))
    const hasNegative = negativeWords.some(word => msgLower.includes(word))
    
    if (hasPositive && !hasNegative) positive++
    else if (hasNegative && !hasPositive) negative++
    else neutral++
  })

  // Messages by day grouping
  const messagesByDay = groupMessagesByDay(messages)

  // Guard against division by zero for empty message arrays
  const total = messages.length || 1

  return {
    totalMessages: messages.length,
    participants,
    dateRange,
    topSenders: senderCounts.slice(0, 10),
    messagesByDay,
    keywords,
    sentimentAnalysis: {
      positive: Math.round((positive / total) * 100),
      negative: Math.round((negative / total) * 100),
      neutral: Math.round((neutral / total) * 100)
    },
    financialTerms
  }
}

function groupMessagesByDay(messages: WhatsAppMessage[]): { date: string; count: number }[] {
  const dayGroups = messages.reduce((acc, msg) => {
    try {
      // Extract date part from timestamp
      const dateMatch = msg.timestamp.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})/)
      if (dateMatch) {
        const date = dateMatch[1]
        acc[date] = (acc[date] || 0) + 1
      }
    } catch (error) {
      // Skip malformed timestamps
    }
    return acc
  }, {} as Record<string, number>)

  return Object.entries(dayGroups)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

function generateInsights(analysis: ProcessingResult): string[] {
  const insights: string[] = []

  // Participation insights
  if (analysis.participants.length > 2) {
    insights.push(`This is a group chat with ${analysis.participants.length} participants`)
  } else {
    insights.push('This is a private conversation between 2 people')
  }

  // Activity insights
  const mostActive = analysis.topSenders[0]
  if (mostActive) {
    const percentage = Math.round((mostActive.count / (analysis.totalMessages || 1)) * 100)
    insights.push(`${mostActive.name} is the most active participant with ${percentage}% of all messages`)
  }

  // Sentiment insights
  if (analysis.sentimentAnalysis.positive > 60) {
    insights.push('The overall conversation tone is very positive')
  } else if (analysis.sentimentAnalysis.negative > 40) {
    insights.push('The conversation contains some negative sentiment')
  }

  // Financial insights
  if (analysis.financialTerms.length > 0) {
    insights.push(`Financial topics discussed: ${analysis.financialTerms.slice(0, 3).join(', ')}`)
  }

  // Activity patterns
  if (analysis.messagesByDay.length > 0) {
    const avgPerDay = Math.round(analysis.totalMessages / analysis.messagesByDay.length)
    insights.push(`Average of ${avgPerDay} messages per day`)
  }

  return insights
}