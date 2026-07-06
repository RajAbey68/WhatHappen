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
let AdmZip: any = null

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

async function getAdmZip() {
  if (!AdmZip) {
    AdmZip = (await import('adm-zip')).default
  }
  return AdmZip
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

/**
 * Helper: convert a Buffer to a base64 data URL suitable for the Gemini Vision API.
 */
function bufferToBase64(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

/**
 * Helper: get MIME type from image extension.
 */
function imageExtToMime(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.gif': 'image/gif',
  }
  return map[ext.toLowerCase()] || 'image/jpeg'
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

    // Safety check: Limit file size to 10MB (larger files go through upload-url → GCS)
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
    const allowedExtensions = [
      '.txt', '.docx', '.pdf', '.csv', '.json',
      '.zip', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
    ]
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
    let ocrText: string = ''
    let ocrImagesProcessed: number = 0

    // ── ZIP handling ──────────────────────────────────────────────────────
    // WhatsApp exports are often ZIP archives containing the chat .txt/.json
    // alongside media files (images, videos). We extract the chat file and
    // run OCR on any images found.
    if (file.name.endsWith('.zip')) {
      try {
        const AdmZipModule = await getAdmZip()
        const zip = new AdmZipModule(fileBuffer)
        const entries = zip.getEntries()

        // Separate chat files and image files from the ZIP
        const chatFiles: Array<{ name: string; data: Buffer }> = []
        const imageFiles: Array<{ name: string; data: Buffer }> = []

        for (const entry of entries) {
          if (entry.isDirectory) continue
          const name = entry.entryName || entry.getEntryName?.() || ''
          const lower = name.toLowerCase()
          const data: Buffer | null = entry.getData()

          if (!data) continue

          if (lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.csv')) {
            chatFiles.push({ name: lower, data })
          } else if (isImageExtension(lower)) {
            imageFiles.push({ name, data })
          }
        }

        // Process the best chat file found (prefer .txt, then .json, then .csv)
        if (chatFiles.length > 0) {
          let bestChat: { name: string; data: Buffer } | null = null
          for (const ext of ['.txt', '.json', '.csv']) {
            bestChat = chatFiles.find(c => c.name.endsWith(ext)) || null
            if (bestChat) break
          }
          if (!bestChat) bestChat = chatFiles[0] // fallback

          // Set file name to the inner chat file name for downstream parsing
          ;(file as any).name = bestChat.name
          fileContent = bestChat.data.toString('utf-8')
        }

        // Run OCR on all images found in the ZIP
        if (imageFiles.length > 0) {
          const { extractImageText } = await import('@/lib/gemini-ocr')
          const ocrResults: string[] = []

          for (const img of imageFiles) {
            const ext = getExtension(img.name)
            const mimeType = imageExtToMime(ext)
            const base64 = bufferToBase64(img.data, mimeType)

            const result = await extractImageText(base64)
            if (result.success && result.extractedText) {
              ocrResults.push(
                `[Image: ${img.name}]\n${result.extractedText}`
              )
              ocrImagesProcessed++
            }
          }

          ocrText = ocrResults.join('\n\n')
        }

        // If no chat file found in the ZIP, try OCR on its own
        if (!fileContent && imageFiles.length > 0) {
          fileContent = `[ZIP upload with ${imageFiles.length} image(s)]\n\nOCR Extracted Text:\n${ocrText}`
        }

        // Fallback: if no chat file and no images, read the ZIP as text
        if (!fileContent) {
          fileContent = `[ZIP archive: ${entries.length} entries. No chat files or images found.]`
        }
      } catch (zipErr) {
        console.error('ZIP extraction error:', zipErr)
        fileContent = `[Failed to extract ZIP archive: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}]`
      }
    // ── Direct image upload ────────────────────────────────────────────────
    } else if (isImageExtension(file.name)) {
      const ext = getExtension(file.name)
      const mimeType = imageExtToMime(ext)
      const base64 = bufferToBase64(fileBuffer, mimeType)

      const { extractImageText } = await import('@/lib/gemini-ocr')
      const result = await extractImageText(base64)
      if (result.success && result.extractedText) {
        fileContent = `[Uploaded image: ${file.name}]\n\nOCR Extracted Text:\n${result.extractedText}`
        ocrText = result.extractedText
        ocrImagesProcessed = 1
      } else {
        fileContent = `[Uploaded image: ${file.name}]\n\nOCR failed: ${result.error || 'No text extracted'}]`
        ocrText = ''
        ocrImagesProcessed = 0
      }
    // ── Standard file types ────────────────────────────────────────────────
    } else if (file.name.endsWith('.txt')) {
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
    
    // If we have OCR text from images and there are media-omitted messages,
    // enrich them with the OCR data
    const enrichedMessages = enrichMediaMessages(messages, ocrText)
    
    // Perform analysis
    const analysis = analyzeChat(enrichedMessages)

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
      totalMessages: enrichedMessages.length,
      participants: analysis.participants.map(name => ({ name })),
      messages: enrichedMessages.slice(0, 100), // Return first 100 messages for preview
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
      }, {}),
      // OCR data for AI search/chat pipeline
      ocrText: ocrText || undefined,
      ocrImagesProcessed,
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

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if a filename has a supported image extension.
 */
function isImageExtension(name: string): boolean {
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif']
  const lower = name.toLowerCase()
  return imageExts.some(ext => lower.endsWith(ext))
}

/**
 * Get the extension from a filename (lowercased).
 */
function getExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx).toLowerCase() : ''
}

/**
 * Enrich media-omitted messages with OCR text where applicable.
 * When images were found and OCR'd, replace "<Media omitted>" placeholders
 * with the actual OCR text so the analysis pipeline can use it.
 */
function enrichMediaMessages(
  messages: ProcessedMessage[],
  ocrText: string
): ProcessedMessage[] {
  if (!ocrText) return messages

  const ocrBlocks = ocrText.split(/\n\n/)
  let ocrIndex = 0

  return messages.map((msg) => {
    if (
      msg.messageType === 'media' &&
      (msg.message.includes('<Media omitted>') ||
       msg.message.includes('image omitted') ||
       msg.message.includes('video omitted'))
    ) {
      const block = ocrBlocks[ocrIndex]
      if (block) {
        ocrIndex++
        return {
          ...msg,
          message: `${msg.message}\n\n[OCR Extracted Text]\n${block}`,
          messageType: 'text', // Promote to text so it gets analyzed
        }
      }
    }
    return msg
  })
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