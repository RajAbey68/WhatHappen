import { NextRequest, NextResponse } from 'next/server'
import { parse as csvParse } from 'csv-parse/sync'
import * as natural from 'natural'
import { FirebaseService, FirebaseMessage, FirebaseChatAnalysis } from '@/lib/firebase-service'
import { v4 as uuidv4 } from 'uuid'
const Sentiment = require('sentiment')

// Conditional imports to avoid build-time issues
let mammoth: any = null
let pdfParse: any = null

async function getMammoth() {
  if (!mammoth) {
    mammoth = await import('mammoth')
  }
  return mammoth
}

async function getPdfParse() {
  if (!pdfParse) {
    pdfParse = await import('pdf-parse')
  }
  return pdfParse
}

// Initialize sentiment analyzer
const sentiment = new Sentiment()

interface ProcessedMessage {
  timestamp: Date
  sender: string
  message: string
  messageType: 'text' | 'media' | 'system'
  sentiment?: {
    score: number
    comparative: number
    tokens: string[]
    words: string[]
    positive: string[]
    negative: string[]
  }
}

interface ChatAnalysis {
  totalMessages: number
  participants: string[]
  dateRange: {
    start: Date
    end: Date
  }
  messagesByParticipant: Record<string, number>
  averageSentiment: number
  topWords: Array<{ word: string; count: number }>
  dailyMessageCounts: Array<{ date: string; count: number }>
  hourlyDistribution: Record<string, number>
  mediaMessages: number
  textMessages: number
  averageMessageLength: number
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { 
          success: false,
          error: 'No file provided' 
        },
        { status: 400 }
      )
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    let fileContent: string = ''

    // Process different file types
    if (file.name.endsWith('.txt')) {
      fileContent = fileBuffer.toString('utf-8')
    } else if (file.name.endsWith('.docx')) {
      const mammothModule = await getMammoth()
      const result = await mammothModule.extractRawText({ buffer: fileBuffer })
      fileContent = result.value
    } else if (file.name.endsWith('.pdf')) {
      const pdfParseModule = await getPdfParse()
      const pdfData = await pdfParseModule.default(fileBuffer)
      fileContent = pdfData.text
    } else if (file.name.endsWith('.csv')) {
      const records = csvParse(fileBuffer.toString('utf-8'), {
        columns: true,
        skip_empty_lines: true
      })
      fileContent = records.map((record: any) => Object.values(record).join(' ')).join('\n')
    } else if (file.name.endsWith('.json')) {
      const jsonData = JSON.parse(fileBuffer.toString('utf-8'))
      fileContent = JSON.stringify(jsonData, null, 2)
    } else {
      return NextResponse.json(
        { error: 'Unsupported file format' },
        { status: 400 }
      )
    }

    // Parse WhatsApp chat format
    const messages = parseWhatsAppChat(fileContent)
    
    // Perform analysis
    const analysis = analyzeChat(messages)

    // Generate unique IDs for tracking
    const fileId = uuidv4()
    const chatId = uuidv4()

    // Prepare standardized response format
    const result = {
      fileId,
      chatId,
      fileName: file.name,
      fileSize: file.size,
      processedAt: new Date().toISOString(),
      totalMessages: messages.length,
      participants: analysis.participants.map(name => ({ name })),
      messages: messages.slice(0, 100), // Return first 100 messages for preview
      analysis,
      sentimentAnalysis: {
        byParticipant: analysis.messagesByParticipant,
        average: analysis.averageSentiment
      },
      timeAnalysis: {
        dailyDistribution: analysis.dailyMessageCounts.reduce((acc: any, item: any) => {
          acc[item.date] = item.count
          return acc
        }, {}),
        hourlyDistribution: analysis.hourlyDistribution
      },
      wordFrequency: analysis.topWords.reduce((acc: any, item: any) => {
        acc[item.word] = item.count
        return acc
      }, {})
    }

    // Store in Firebase if environment is configured
    try {
      if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
        // Prepare messages for Firebase storage
        const firebaseMessages: FirebaseMessage[] = messages.map(msg => ({
          timestamp: msg.timestamp,
          sender: msg.sender,
          message: msg.message,
          messageType: msg.messageType,
          sentiment: msg.sentiment,
          chatId,
          fileId
        }))

        // Store messages in Firebase
        await FirebaseService.storeMessages(firebaseMessages)

        // Store chat analysis
        const chatAnalysis: FirebaseChatAnalysis = {
          fileId,
          fileName: file.name,
          fileSize: file.size,
          processedAt: new Date(),
          totalMessages: messages.length,
          participants: analysis.participants.map(name => ({ name })),
          analysis,
          sentimentAnalysis: result.sentimentAnalysis,
          timeAnalysis: result.timeAnalysis,
          wordFrequency: result.wordFrequency
        }

        await FirebaseService.storeChatAnalysis(chatAnalysis)

        // Store file metadata
        await FirebaseService.storeFileMetadata(fileId, {
          fileName: file.name,
          fileSize: file.size,
          originalType: file.type,
          processedAt: new Date()
        })

        console.log(`Successfully stored ${messages.length} messages and analysis in Firebase`)
      }
    } catch (firebaseError) {
      console.warn('Firebase storage failed, continuing with local processing:', firebaseError)
      // Don't fail the entire request if Firebase is unavailable
    }

    return NextResponse.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('File processing error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process file', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

function parseWhatsAppChat(content: string): ProcessedMessage[] {
  const messages: ProcessedMessage[] = []
  const lines = content.split('\n')
  
  // WhatsApp message pattern: [DD/MM/YYYY, HH:MM:SS] Sender: Message
  const messagePattern = /^\[(\d{1,2}\/\d{1,2}\/\d{4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\]\s*([^:]+):\s*(.*)$/i
  
  // Alternative pattern: DD/MM/YYYY, HH:MM - Sender: Message  
  const altPattern = /^(\d{1,2}\/\d{1,2}\/\d{4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\s*-\s*([^:]+):\s*(.*)$/i

  let currentMessage: ProcessedMessage | null = null

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    let match = trimmedLine.match(messagePattern) || trimmedLine.match(altPattern)
    
    if (match) {
      // Save previous message if exists
      if (currentMessage) {
        messages.push(currentMessage)
      }

      const [, dateStr, timeStr, sender, message] = match
      
      try {
        // Parse date and time
        const [day, month, year] = dateStr.split('/').map(Number)
        const timestamp = new Date(year, month - 1, day)
        
        // Determine message type
        let messageType: 'text' | 'media' | 'system' = 'text'
        if (message.includes('<Media omitted>') || message.includes('image omitted') || message.includes('video omitted')) {
          messageType = 'media'
        } else if (message.includes('added') || message.includes('left') || message.includes('changed')) {
          messageType = 'system'
        }

        // Analyze sentiment for text messages
        let sentimentAnalysis
        if (messageType === 'text') {
          sentimentAnalysis = sentiment.analyze(message)
        }

        currentMessage = {
          timestamp,
          sender: sender.trim(),
          message: message.trim(),
          messageType,
          sentiment: sentimentAnalysis
        }
      } catch (error) {
        console.warn('Failed to parse message:', trimmedLine)
      }
    } else if (currentMessage) {
      // This line is a continuation of the previous message
      currentMessage.message += '\n' + trimmedLine
    }
  }

  // Add the last message
  if (currentMessage) {
    messages.push(currentMessage)
  }

  return messages
}

function analyzeChat(messages: ProcessedMessage[]): ChatAnalysis {
  const participants = [...new Set(messages.map(m => m.sender))]
  const messagesByParticipant: Record<string, number> = {}
  const dailyMessageCounts: Record<string, number> = {}
  const hourlyDistribution: Record<string, number> = {}
  
  let totalSentiment = 0
  let sentimentCount = 0
  let mediaMessages = 0
  let textMessages = 0
  let totalMessageLength = 0

  // Word frequency analysis
  const wordCounts: Record<string, number> = {}

  for (const message of messages) {
    // Count by participant
    messagesByParticipant[message.sender] = (messagesByParticipant[message.sender] || 0) + 1
    
    // Count by type
    if (message.messageType === 'media') {
      mediaMessages++
    } else if (message.messageType === 'text') {
      textMessages++
      totalMessageLength += message.message.length
      
      // Sentiment analysis
      if (message.sentiment) {
        totalSentiment += message.sentiment.score
        sentimentCount++
      }

      // Word frequency
      const words = message.message.toLowerCase().split(/\s+/).filter(word => word.length > 3) || []
      for (const word of words) {
        if (word.length > 3) { // Filter out short words
          wordCounts[word] = (wordCounts[word] || 0) + 1
        }
      }
    }

    // Daily distribution
    const dateKey = message.timestamp.toISOString().split('T')[0]
    dailyMessageCounts[dateKey] = (dailyMessageCounts[dateKey] || 0) + 1

    // Hourly distribution
    const hour = message.timestamp.getHours().toString()
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1
  }

  // Get top words
  const topWords = Object.entries(wordCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }))

  // Convert daily counts to array format
  const dailyMessageArray = Object.entries(dailyMessageCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  const timestamps = messages.map(m => m.timestamp).filter(t => t instanceof Date && !isNaN(t.getTime()))
  
  return {
    totalMessages: messages.length,
    participants,
    dateRange: {
      start: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : new Date(),
      end: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : new Date()
    },
    messagesByParticipant,
    averageSentiment: sentimentCount > 0 ? totalSentiment / sentimentCount : 0,
    topWords,
    dailyMessageCounts: dailyMessageArray,
    hourlyDistribution,
    mediaMessages,
    textMessages,
    averageMessageLength: textMessages > 0 ? totalMessageLength / textMessages : 0
  }
} 