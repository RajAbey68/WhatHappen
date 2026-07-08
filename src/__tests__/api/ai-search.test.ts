import { POST } from '@/app/api/ai-search/route'
import { NextRequest, NextResponse } from 'next/server'

// Prefix mocks with 'mock' to allow Jest to hoist them safely without global pollution
const mockRpc = jest.fn();
const mockSingle = jest.fn();
const mockEq2 = jest.fn().mockImplementation(() => ({
  single: mockSingle
}));
const mockEq1 = jest.fn().mockImplementation(() => ({
  eq: mockEq2
}));
const mockFrom = jest.fn().mockImplementation(() => ({
  select: () => ({
    eq: mockEq1
  })
}));

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockImplementation((request: NextRequest) => {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      Object.setPrototypeOf(res, NextResponse.prototype)
      return res
    }
    return { user: { id: 'mock-user-id', email: 'mock@example.com' } }
  }),
  getServiceClient: () => ({
    from: mockFrom,
    rpc: mockRpc
  })
}))

jest.mock('@/lib/llm', () => ({
  generateWithFallback: jest.fn().mockImplementation(async (messages: any[]) => {
    const systemPrompt = messages[0]?.content || ''
    if (systemPrompt.includes('PostgreSQL SELECT')) {
      return { content: 'SELECT total_messages FROM sessions WHERE id = $1', model: 'mock-model' }
    }
    return { content: 'This is the summarized safe search answer.', model: 'mock-model' }
  })
}))

const createMockRequest = (body: any, token: string | null = 'Bearer valid-token'): NextRequest => {
  const headers = new Headers()
  if (token) headers.set('authorization', token)
  return {
    json: jest.fn().mockResolvedValue(body),
    headers
  } as unknown as NextRequest
}

describe('/api/ai-search API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 401 when unauthorized', async () => {
    const request = createMockRequest({ query: 'test', sessionId: '12345678-1234-1234-1234-1234567890ab' }, null)
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  test('returns 400 when query is missing', async () => {
    const request = createMockRequest({ sessionId: '12345678-1234-1234-1234-1234567890ab' })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('query is required')
  })

  test('returns 400 when sessionId is invalid format', async () => {
    const request = createMockRequest({ query: 'show stats', sessionId: 'invalid-id' })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid session ID')
  })

  test('returns 404 when session does not exist or does not belong to user', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null })
    const request = createMockRequest({ query: 'show stats', sessionId: '12345678-1234-1234-1234-1234567890ab' })
    const response = await POST(request)
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Session not found')
  })

  test('executes search successfully and returns summary answer', async () => {
    mockSingle.mockResolvedValue({ data: { id: '12345678-1234-1234-1234-1234567890ab' }, error: null })
    mockRpc.mockResolvedValue({ data: [{ total_messages: 100 }], error: null })

    const request = createMockRequest({ query: 'how many messages?', sessionId: '12345678-1234-1234-1234-1234567890ab' })
    const response = await POST(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.answer).toBe('This is the summarized safe search answer.')
    expect(data.data).toEqual([{ total_messages: 100 }])
    expect(data.sql).toBe('SELECT total_messages FROM sessions WHERE id = $1')
  })

  test('returns 500 when database rpc fails', async () => {
    mockSingle.mockResolvedValue({ data: { id: '12345678-1234-1234-1234-1234567890ab' }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Database error' } })

    const request = createMockRequest({ query: 'how many messages?', sessionId: '12345678-1234-1234-1234-1234567890ab' })
    const response = await POST(request)
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Query execution failed')
  })
})
