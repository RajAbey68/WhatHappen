import { POST } from '../../app/api/ai-search/route'
import { NextRequest } from 'next/server'

// Mock OpenAI
jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Mocked AI response about financial analysis'
              }
            }]
          })
        }
      }
    }))
  }
})

describe('/api/ai-search', () => {
  const createMockRequest = (body: any): NextRequest => {
    return {
      json: jest.fn().mockResolvedValue(body)
    } as unknown as NextRequest
  }

  const mockChatData = {
    messages: [
      { timestamp: '2024-01-01T10:30:00Z', sender: 'John', content: 'I need to pay $500 for rent' },
      { timestamp: '2024-01-01T10:31:00Z', sender: 'Jane', content: 'Can you lend me $200?' },
      { timestamp: '2024-01-01T10:32:00Z', sender: 'John', content: 'I\'m so happy today!' },
      { timestamp: '2024-01-01T10:33:00Z', sender: 'Jane', content: 'This is terrible news...' },
      { timestamp: '2024-01-01T10:34:00Z', sender: 'Bob', content: 'Meeting at 3pm tomorrow' }
    ],
    participants: [
      { name: 'John', messages: 2 },
      { name: 'Jane', messages: 2 },
      { name: 'Bob', messages: 1 }
    ]
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock environment variable
    process.env.OPENAI_API_KEY = 'test-api-key'
  })

  describe('Financial Analysis', () => {
    test('should perform financial search', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'financial',
        query: 'money transactions'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.results).toBeDefined()
      expect(result.analysis).toBeDefined()
    })

    test('should find financial keywords', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'financial'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      // Should find messages with $500 and $200
      expect(result.results.length).toBeGreaterThan(0)
      expect(result.results.some((msg: any) => msg.content.includes('$500'))).toBe(true)
      expect(result.results.some((msg: any) => msg.content.includes('$200'))).toBe(true)
    })

    test('should handle no financial data found', async () => {
      const noFinancialData = {
        messages: [
          { timestamp: '2024-01-01T10:30:00Z', sender: 'John', content: 'Hello world' },
          { timestamp: '2024-01-01T10:31:00Z', sender: 'Jane', content: 'How are you?' }
        ]
      }

      const requestBody = {
        data: noFinancialData,
        searchType: 'financial'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(0)
    })
  })

  describe('Semantic Search', () => {
    test('should perform semantic search with query', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'semantic',
        query: 'happy emotions'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.results).toBeDefined()
      expect(result.analysis).toBeDefined()
    })

    test('should find semantically related messages', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'semantic',
        query: 'meeting appointment'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      // Should find the meeting message
      expect(result.results.some((msg: any) => msg.content.includes('Meeting'))).toBe(true)
    })

    test('should handle empty query', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'semantic',
        query: ''
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Query is required')
    })
  })

  describe('Keyword Search', () => {
    test('should perform keyword search', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'keyword',
        query: 'happy'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.results).toBeDefined()
      expect(result.results.some((msg: any) => msg.content.includes('happy'))).toBe(true)
    })

    test('should be case insensitive', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'keyword',
        query: 'HAPPY'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.results.length).toBeGreaterThan(0)
    })

    test('should handle multiple keywords', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'keyword',
        query: 'happy terrible'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      // Should find both positive and negative messages
      expect(result.results.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Sentiment Analysis', () => {
    test('should perform sentiment analysis', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'sentiment',
        query: 'positive'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.results).toBeDefined()
      expect(result.analysis).toBeDefined()
      expect(result.analysis).toContain('sentiment')
    })

    test('should filter by sentiment type', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'sentiment',
        query: 'negative'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      // Should find the "terrible" message
      expect(result.results.some((msg: any) => msg.content.includes('terrible'))).toBe(true)
    })

    test('should handle unknown sentiment filter', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'sentiment',
        query: 'unknown'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })
  })

  describe('Error Handling', () => {
    test('should handle missing data', async () => {
      const requestBody = {
        searchType: 'financial',
        query: 'test'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Chat data is required')
    })

    test('should handle invalid search type', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'invalid',
        query: 'test'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid search type')
    })

    test('should handle malformed data', async () => {
      const requestBody = {
        data: { invalid: 'structure' },
        searchType: 'keyword',
        query: 'test'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
    })

    test('should handle OpenAI API errors', async () => {
      // Mock OpenAI to throw an error
      const OpenAI = require('openai').OpenAI
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('OpenAI API Error'))
          }
        }
      }))

      const requestBody = {
        data: mockChatData,
        searchType: 'semantic',
        query: 'test'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toContain('AI analysis failed')
    })

    test('should handle missing OpenAI API key', async () => {
      delete process.env.OPENAI_API_KEY

      const requestBody = {
        data: mockChatData,
        searchType: 'semantic',
        query: 'test'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toContain('OpenAI API key not configured')
    })
  })

  describe('Performance and Edge Cases', () => {
    test('should handle large datasets', async () => {
      const largeData = {
        messages: Array.from({ length: 10000 }, (_, i) => ({
          timestamp: `2024-01-01T${String(i % 24).padStart(2, '0')}:30:00Z`,
          sender: `User${i % 100}`,
          content: `Message ${i} with various content including money $${i}`
        }))
      }

      const requestBody = {
        data: largeData,
        searchType: 'financial'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })

    test('should handle special characters in query', async () => {
      const requestBody = {
        data: mockChatData,
        searchType: 'keyword',
        query: '!@#$%^&*()_+-={}[]|\\:";\'<>?,./'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })

    test('should handle Unicode characters', async () => {
      const unicodeData = {
        messages: [
          { timestamp: '2024-01-01T10:30:00Z', sender: 'José', content: '¡Hola! 你好 こんにちは 🎉' },
          { timestamp: '2024-01-01T10:31:00Z', sender: 'Müller', content: 'Guten Tag! العربية' }
        ]
      }

      const requestBody = {
        data: unicodeData,
        searchType: 'keyword',
        query: '你好'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
    })

    test('should handle empty messages array', async () => {
      const emptyData = {
        messages: []
      }

      const requestBody = {
        data: emptyData,
        searchType: 'keyword',
        query: 'test'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(0)
    })
  })
}) 