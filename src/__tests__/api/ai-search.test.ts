import { POST } from '@/app/api/ai-search/route'
import { NextRequest } from 'next/server'

describe('POST /api/ai-search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when query is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Query is required')
  })

  test('performs keyword search successfully', async () => {
    const chatData = {
      messages: [
        { sender: 'Alice', message: 'Let\'s discuss the project timeline', timestamp: '2024-01-01T10:30:00', sentiment: { score: 0 } },
        { sender: 'Bob', message: 'The timeline looks good', timestamp: '2024-01-01T10:31:00', sentiment: { score: 1 } },
        { sender: 'Charlie', message: 'I agree with the plan', timestamp: '2024-01-01T10:32:00', sentiment: { score: 1 } },
      ]
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'timeline',
        chatData,
        searchType: 'keyword'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.type).toBe('keyword_search')
    expect(data.results).toBeDefined()
    expect(data.query).toBe('timeline')
  })

  test('identifies financial queries correctly', async () => {
    const chatData = {
      messages: [
        { sender: 'Alice', message: 'We need to discuss the payment', timestamp: '2024-01-01T10:30:00' },
        { sender: 'Bob', message: 'Yes, the cost is $5000', timestamp: '2024-01-01T10:31:00' },
      ]
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'How much is the payment?',
        chatData,
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.type).toBe('financial_analysis')
  })

  test('performs financial analysis with specific amounts', async () => {
    const chatData = {
      messages: [
        { sender: 'Alice', message: 'The upfront cost is $24,000', timestamp: '2024-01-01T10:30:00' },
        { sender: 'Bob', message: 'That\'s within budget', timestamp: '2024-01-01T10:31:00' },
      ]
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'What\'s the cost?',
        chatData,
        searchType: 'financial'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.results).toBeDefined()
    if (data.results.length > 0) {
      expect(data.results[0]).toHaveProperty('message')
      expect(data.results[0]).toHaveProperty('sender')
      expect(data.results[0]).toHaveProperty('timestamp')
    }
  })

  test('performs sentiment analysis', async () => {
    const chatData = {
      messages: [
        { sender: 'Alice', message: 'This is great!', sentiment: { score: 3 } },
        { sender: 'Bob', message: 'I\'m disappointed', sentiment: { score: -2 } },
        { sender: 'Charlie', message: 'It\'s okay', sentiment: { score: 0 } },
      ]
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'sentiment analysis',
        chatData,
        searchType: 'sentiment'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.type).toBe('sentiment_analysis')
    expect(data.results).toHaveProperty('positive')
    expect(data.results).toHaveProperty('negative')
    expect(data.results).toHaveProperty('neutral')
  })

  test('handles missing chat data gracefully', async () => {
    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
        chatData: null,
        searchType: 'keyword'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.results).toEqual([])
  })

  test('respects search result limit option', async () => {
    const chatData = {
      messages: Array.from({ length: 50 }, (_, i) => ({
        sender: `User${i % 2}`,
        message: `Message ${i}`,
        timestamp: `2024-01-01T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:30:00`
      }))
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'Message',
        chatData,
        searchType: 'keyword',
        options: { limit: 10 }
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results.length).toBeLessThanOrEqual(10)
  })

  test('returns timestamp in response', async () => {
    const chatData = {
      messages: [
        { sender: 'Alice', message: 'Test message', timestamp: '2024-01-01T10:30:00' },
      ]
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'Test',
        chatData,
        searchType: 'keyword'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.timestamp).toBeDefined()
    expect(typeof data.timestamp).toBe('string')
  })

  test('handles invalid search type', async () => {
    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test',
        searchType: 'invalid_type'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
  })

  test('extracts multiple keywords for search', async () => {
    const chatData = {
      messages: [
        { sender: 'Alice', message: 'The project deadline is next week', timestamp: '2024-01-01T10:30:00' },
        { sender: 'Bob', message: 'We should finalize the design', timestamp: '2024-01-01T10:31:00' },
        { sender: 'Charlie', message: 'The timeline looks tight', timestamp: '2024-01-01T10:32:00' },
      ]
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'project deadline',
        chatData,
        searchType: 'keyword'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    if (data.results.length > 0) {
      expect(data.analysis).toContain('Found')
    }
  })

  test('handles financial analysis without OpenAI', async () => {
    const originalEnv = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY

    const chatData = {
      messages: [
        { sender: 'Alice', message: 'The cost is $5000', timestamp: '2024-01-01T10:30:00' },
      ]
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'payment',
        chatData,
        searchType: 'financial'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)

    process.env.OPENAI_API_KEY = originalEnv
  })

  test('filters sentiment results by score', async () => {
    const chatData = {
      messages: [
        { sender: 'Alice', message: 'Excellent!', sentiment: { score: 5 } },
        { sender: 'Bob', message: 'Terrible', sentiment: { score: -5 } },
        { sender: 'Charlie', message: 'Okay', sentiment: { score: 0 } },
        { sender: 'Diana', message: 'Amazing!', sentiment: { score: 4 } },
        { sender: 'Eve', message: 'Bad', sentiment: { score: -3 } },
      ]
    }

    const request = new NextRequest('http://localhost:3000/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'sentiment',
        chatData,
        searchType: 'sentiment'
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results.positive.length).toBeGreaterThan(0)
    expect(data.results.negative.length).toBeGreaterThan(0)
    expect(data.results.neutral.length).toBeGreaterThan(0)
  })
})
