export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { parse as csvParse } from 'csv-parse/sync'
import { v4 as uuidv4 } from 'uuid'
const Sentiment = require('sentiment')

// Firebase integration temporarily disabled due to compatibility issues
// Will be re-enabled once Node.js/Firebase compatibility is resolved

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
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'No file provided' 
        },
        { status: 400 }
      )
    }

    // Safety check: Limit file size to 10MB
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: 'File size exceeds the 10MB limit'
        },
        { status: 400 }
      )
    }

    // Safety check: Validate file extension
    const allowedExtensions = ['.txt', '.docx', '.pdf', '.csv', '.json']
    const lowerName = file.name.toLowerCase()
    const hasAllowedExtension = allowedExtensions.some(ext => lowerName.endsWith(ext))
    if (!hasAllowedExtension) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file type'
        },
        { status: 400 }
      )
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    if (fileBuffer.length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Empty file' 
        },
        { status: 400 }
      )
    }
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
        { 
          success: false,
          error: 'Unsupported file type' 
        },
        { status: 400 }
      )
    }

    // Parse WhatsApp chat format or JSON directly
    let messages: ProcessedMessage[] = []
    
    if (file.name.endsWith('.json')) {
      try {
        const jsonData = JSON.parse(fileBuffer.toString('utf-8'))
        const rawMessages = Array.isArray(jsonData) ? jsonData : jsonData.messages || []
        messages = rawMessages.map((msg: any) => {
          const text = msg.message || msg.content || ''
          const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date()
          
          let messageType: 'text' | 'media' | 'system' = 'text'
          if (text.includes('<Media omitted>') || text.includes('image omitted') || text.includes('video omitted')) {
            messageType = 'media'
          } else if (text.includes('added') || text.includes('left') || text.includes('changed')) {
            messageType = 'system'
          }

          let sentimentAnalysis
          if (messageType === 'text') {
            sentimentAnalysis = sentiment.analyze(text)
          }

          return {
            timestamp,
            sender: (msg.sender || 'Unknown').trim(),
            message: text.trim(),
            messageType,
            sentiment: sentimentAnalysis
          }
        })
      } catch (jsonErr) {
        console.error('Failed to parse JSON file:', jsonErr)
        messages = []
      }
    } else {
      messages = parseWhatsAppChat(fileContent)
    }
    
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
        average: analysis.averageSentiment,
        overall: analysis.averageSentiment
      },
      timeAnalysis: {
        dailyDistribution: analysis.dailyMessageCounts.reduce((acc: Record<string, number>, item: { date: string; count: number }) => {
          acc[item.date] = item.count
          return acc
        }, {}),
        hourlyDistribution: analysis.hourlyDistribution
      },
      wordFrequency: analysis.topWords.reduce((acc: Record<string, number>, item: { word: string; count: number }) => {
        acc[item.word] = item.count
        return acc
      }, {})
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
        error: 'Failed to process file'
      },
      { status: 500 }
    )
  }
}

function parseWhatsAppChat(content: string): ProcessedMessage[] {
  const messages: ProcessedMessage[] = []
  const lines = content.split('\n')
  
  // WhatsApp message patterns supporting different delimiters (/, ., -) and 2-4 digit years
  const messagePattern = /^\[(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\]\s*([^:]+):\s*(.*)$/i
  const altPattern = /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\s*-\s*([^:]+):\s*(.*)$/i

  // Pre-scan all valid messages to auto-detect the date locale (DD/MM vs MM/DD)
  let detectedLocale: 'DMY' | 'MDY' = 'DMY'
  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(messagePattern) || trimmed.match(altPattern)
    if (match) {
      const dateStr = match[1]
      const parts = dateStr.split(/[\/\-\.]/).map(Number)
      if (parts.length >= 2) {
        if (parts[0] > 12 && parts[1] <= 12) {
          detectedLocale = 'DMY'
          break
        } else if (parts[1] > 12 && parts[0] <= 12) {
          detectedLocale = 'MDY'
          break
        }
      }
    }
  }

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
        // Parse date
        const parts = dateStr.split(/[\/\-\.]/).map(Number)
        let day = 1, month = 1, year = 2025
        if (parts.length === 3) {
          let part1 = parts[0]
          let part2 = parts[1]
          let part3 = parts[2]

          // Year normalization
          if (part3 < 100) {
            part3 += 2000
          }

          if (detectedLocale === 'MDY') {
            month = part1
            day = part2
            year = part3
          } else {
            // Default to DMY
            day = part1
            month = part2
            year = part3
          }
        }
        
        let hours = 0, minutes = 0, seconds = 0
        const isPM = timeStr.toLowerCase().includes('pm')
        const isAM = timeStr.toLowerCase().includes('am')
        const timeClean = timeStr.replace(/\s*[AP]M/i, '').trim()
        const timeParts = timeClean.split(':').map(Number)
        
        if (timeParts.length >= 2) {
          hours = timeParts[0]
          minutes = timeParts[1]
          if (timeParts.length >= 3) {
            seconds = timeParts[2]
          }
          if (isPM && hours < 12) {
            hours += 12
          } else if (isAM && hours === 12) {
            hours = 0
          }
        }
        
        const timestamp = new Date(year, month - 1, day, hours, minutes, seconds)
        
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
        // Privacy-safe warning: avoid printing raw private user chat lines in server logs
        console.warn(`Failed to parse message line of length ${trimmedLine.length}`)
        currentMessage = null // Reset parser state so subsequent lines aren't appended to a stale message
      }
    } else {
      // Check if it looks like a new message line but is malformed
      const isMalformedHeader = trimmedLine.startsWith('[') || 
                                /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(trimmedLine)
      
      if (isMalformedHeader) {
        if (currentMessage) {
          messages.push(currentMessage)
          currentMessage = null
        }
      } else if (currentMessage) {
        // This line is a continuation of the previous message
        currentMessage.message += '\n' + trimmedLine
      }
    }
  }

  // Add the last message
  if (currentMessage) {
    messages.push(currentMessage)
  }

  return messages
}

const STOPWORDS = new Set([
  'the', 'and', 'you', 'that', 'this', 'have', 'with', 'just', 'like', 'what',
  'your', 'will', 'here', 'there', 'about', 'some', 'they', 'them', 'for', 'but',
  'not', 'are', 'was', 'were', 'had', 'has', 'can', 'out', 'all', 'one', 'get',
  'would', 'their', 'from', 'she', 'him', 'her', 'his', 'how', 'who', 'why',
  'when', 'where', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if',
  'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with',
  'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'cant',
  'dont', 'shouldnt', 'wont', 'ive', 'im', 'youre', 'theyre', 'weve', 'hes',
  'shes', 'its', 'thats', 'wasnt', 'werent', 'hasnt', 'hadnt', 'didnt', 'doesnt',
  'arent', 'isnt', 'havent'
])

function analyzeChat(messages: ProcessedMessage[]): ChatAnalysis {
  const participants = Array.from(new Set(messages.map(m => m.sender)))
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
    // Skip message if timestamp is invalid
    if (!(message.timestamp instanceof Date) || isNaN(message.timestamp.getTime())) {
      continue
    }

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

      // Word frequency (strip punctuation for accurate matching)
      const words = message.message.toLowerCase()
        .replace(/[^\w\s]/g, '') // Strip all punctuation
        .split(/\s+/)
        .filter(word => word.length >= 3 && !STOPWORDS.has(word))
      
      for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1
      }
    }

    // Daily distribution (timezone-independent)
    const year = message.timestamp.getFullYear()
    const month = String(message.timestamp.getMonth() + 1).padStart(2, '0')
    const day = String(message.timestamp.getDate()).padStart(2, '0')
    const dateKey = `${year}-${month}-${day}`
    dailyMessageCounts[dateKey] = (dailyMessageCounts[dateKey] || 0) + 1

    // Hourly distribution
    const hour = message.timestamp.getHours().toString()
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1
  }

  // Get top words
  const topWords = Object.entries(wordCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 200)
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