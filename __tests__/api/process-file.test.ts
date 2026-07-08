import { POST } from '../../app/api/process-file/route'
import { NextRequest } from 'next/server'

// Mock external dependencies
jest.mock('mammoth', () => ({
  extractRawText: jest.fn()
}))

jest.mock('pdf-parse', () => jest.fn())

jest.mock('csv-parse/sync', () => ({
  parse: jest.fn()
}))

jest.mock('sentiment', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: jest.fn().mockReturnValue({ score: 0.5, comparative: 0.1 })
  }))
})

describe('/api/process-file', () => {
  const createMockFormData = (fileName: string, content: string, type = 'text/plain') => {
    const file = new File([content], fileName, { type })
    const formData = new FormData()
    formData.append('file', file)
    return formData
  }

  const createMockRequest = (formData: FormData): NextRequest => {
    return {
      formData: jest.fn().mockResolvedValue(formData),
      nextUrl: {
        searchParams: new URLSearchParams()
      }
    } as unknown as NextRequest
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('WhatsApp Chat Text File Processing', () => {
    test('should process valid WhatsApp chat format', async () => {
      const chatContent = `[1/1/2024, 10:30:00 AM] John Doe: Hello everyone!
[1/1/2024, 10:31:00 AM] Jane Smith: Hi John! How are you?
[1/1/2024, 10:32:00 AM] John Doe: I'm doing great, thanks for asking!`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.totalMessages).toBe(3)
      expect(result.data.participants).toHaveLength(2)
      expect(result.data.participants.map((p: any) => p.name).sort()).toEqual(['Jane Smith', 'John Doe'])
    })

    test('should handle different timestamp formats', async () => {
      const chatContent = `1/1/24, 10:30 - John: Hello
2024-01-01 10:31 - Jane: Hi there
[01/01/2024, 10:32:00] Bob: Hey everyone`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.totalMessages).toBeGreaterThan(0)
    })

    test('should parse messages with emojis and special characters', async () => {
      const chatContent = `[1/1/2024, 10:30:00 AM] John 😊: Hello! 🎉 How's everyone doing? 🤔
[1/1/2024, 10:31:00 AM] Jane 💕: Great! 👍 Thanks for asking! ❤️`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.totalMessages).toBe(2)
    })

    test('should handle system messages and media messages', async () => {
      const chatContent = `[1/1/2024, 10:30:00 AM] John: Hello
[1/1/2024, 10:31:00 AM] Messages and calls are end-to-end encrypted.
[1/1/2024, 10:32:00 AM] Jane: <Media omitted>
[1/1/2024, 10:33:00 AM] John: 📷 Photo
[1/1/2024, 10:34:00 AM] Jane added Bob to the group`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.totalMessages).toBeGreaterThan(0)
    })

    test('should auto-detect US date locale (MM/DD/YYYY) correctly', async () => {
      const chatContent = `[12/31/2024, 10:30:00 AM] John: New Year's Eve!
[05/06/2024, 10:31:00 AM] Jane: Indeed`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      
      const msg1Date = new Date(result.data.messages[0].timestamp)
      expect(msg1Date.getMonth()).toBe(11) // December is 11
      expect(msg1Date.getDate()).toBe(31)

      const msg2Date = new Date(result.data.messages[1].timestamp)
      expect(msg2Date.getMonth()).toBe(4) // May is 4
      expect(msg2Date.getDate()).toBe(6)
    })

    test('should handle different date delimiters like dots and dashes', async () => {
      const chatContent = `[12.31.2024, 10:30:00 AM] John: Dot separation
[12-31-2024, 10:31:00 AM] Jane: Dash separation`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.totalMessages).toBe(2)
      
      const date1 = new Date(result.data.messages[0].timestamp)
      expect(date1.getMonth()).toBe(11)
      expect(date1.getDate()).toBe(31)
    })

    test('should normalize 2-digit years to 4-digit years', async () => {
      const chatContent = `[12/31/24, 10:30:00 AM] John: 2-digit year`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      const date = new Date(result.data.messages[0].timestamp)
      expect(date.getFullYear()).toBe(2024)
    })

    test('should reset currentMessage on parse error to avoid stale message appending', async () => {
      const chatContent = `[12/31/2024, 10:30:00 AM] John: Message 1
[invalid line format] John: This is invalid and throws
Some continuation text that should not append to Message 1`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.messages[0].message).not.toContain('continuation text')
    })

    test('should calculate daily message counts independently of timezone shifts', async () => {
      const chatContent = `[12/31/2024, 11:30:00 PM] John: Message near midnight`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      
      // Daily distribution should key by local day of the message date, not UTC day if timezone shifts it.
      expect(result.data.timeAnalysis.dailyDistribution['2024-12-31']).toBe(1)
      expect(result.data.timeAnalysis.dailyDistribution['2025-01-01']).toBeUndefined()
    })
  })

  describe('Analysis Functions', () => {
    test('should perform sentiment analysis', async () => {
      const chatContent = `[1/1/2024, 10:30:00 AM] John: I'm so happy today! This is amazing!
[1/1/2024, 10:31:00 AM] Jane: That's terrible news. I'm really sad.`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.data.sentimentAnalysis).toBeDefined()
      expect(result.data.sentimentAnalysis.overall).toBeDefined()
      expect(result.data.sentimentAnalysis.byParticipant).toBeDefined()
    })

    test('should calculate word frequency', async () => {
      const chatContent = `[1/1/2024, 10:30:00 AM] John: hello world hello
[1/1/2024, 10:31:00 AM] Jane: world world test`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.data.wordFrequency).toBeDefined()
      expect(Object.keys(result.data.wordFrequency).length).toBeGreaterThan(0)
    })

    test('should analyze time patterns', async () => {
      const chatContent = `[1/1/2024, 10:30:00 AM] John: Morning message
[1/1/2024, 02:15:00 PM] Jane: Afternoon message
[1/2/2024, 08:45:00 PM] John: Evening message`

      const formData = createMockFormData('chat.txt', chatContent)
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.data.timeAnalysis).toBeDefined()
      expect(result.data.timeAnalysis.dailyDistribution).toBeDefined()
      expect(result.data.timeAnalysis.hourlyDistribution).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    test('should handle missing file', async () => {
      const formData = new FormData()
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('No file provided')
    })

    test('should handle unsupported file types', async () => {
      const formData = createMockFormData('test.exe', 'binary', 'application/octet-stream')
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported file type')
    })

    test('should handle empty files', async () => {
      const formData = createMockFormData('empty.txt', '')
      const request = createMockRequest(formData)

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Empty file')
    })
  })
}) 