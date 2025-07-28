import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'

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
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const projectId = formData.get('projectId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: 'No project ID provided' }, { status: 400 })
    }

    // Process the file
    const text = await file.text()
    const messages = parseWhatsAppChat(text)
    const analysis = generateComprehensiveAnalysis(messages)

    // Store messages in Firebase
    const messagePromises = messages.map(message => 
      addDoc(collection(db, 'messages'), {
        ...message,
        projectId,
        processed: true,
        createdAt: serverTimestamp()
      })
    )

    await Promise.all(messagePromises)

    // Update project with analysis
    const projectRef = doc(db, 'projects', projectId)
    await updateDoc(projectRef, {
      messageCount: messages.length,
      participants: analysis.participants,
      dateRange: analysis.dateRange,
      analysis: {
        sentiment: analysis.sentimentAnalysis,
        keywords: analysis.keywords,
        insights: generateInsights(analysis)
      },
      updatedAt: serverTimestamp()
    })

    return NextResponse.json({
      success: true,
      analysis,
      messageCount: messages.length
    })

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
  const senderCounts = participants.map(participant => ({
    name: participant,
    count: messages.filter(m => m.sender === participant).length
  })).sort((a, b) => b.count - a.count)

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

  return {
    totalMessages: messages.length,
    participants,
    dateRange,
    topSenders: senderCounts.slice(0, 10),
    messagesByDay,
    keywords,
    sentimentAnalysis: {
      positive: Math.round((positive / messages.length) * 100),
      negative: Math.round((negative / messages.length) * 100),
      neutral: Math.round((neutral / messages.length) * 100)
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
    const percentage = Math.round((mostActive.count / analysis.totalMessages) * 100)
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