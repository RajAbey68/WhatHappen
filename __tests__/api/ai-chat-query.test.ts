import { POST } from '../../app/api/ai-chat/query/route'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getUserClient } from '@/lib/auth'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  getUserClient: jest.fn(),
}))

type QueryBuilder = {
  select: jest.Mock
  eq: jest.Mock
  order?: jest.Mock
  limit?: jest.Mock
  single?: jest.Mock
}

describe('/api/ai-chat/query', () => {
  const requireAuthMock = requireAuth as jest.Mock
  const getUserClientMock = getUserClient as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    requireAuthMock.mockResolvedValue({ user: { id: 'user-1' }, token: 'token-1' })
  })

  it('returns 401 when Authorization is invalid', async () => {
    requireAuthMock.mockResolvedValueOnce(NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }))

    const request = new NextRequest('http://localhost/api/ai-chat/query', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'proj-1',
        message: 'find invoice discussion'
      })
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toMatch(/invalid|authorization|token/i)
  })

  it('returns 404 when project is not visible to the authenticated user', async () => {
    const projectsBuilder: QueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }

    getUserClientMock.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'projects') return projectsBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const request = new NextRequest('http://localhost/api/ai-chat/query', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'proj-2',
        message: 'show me project data'
      })
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toMatch(/project not found|not authorized/i)
  })

  it('uses stored message content when answering database queries', async () => {
    const projectsBuilder: QueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'proj-1',
          name: 'Demo Project',
          description: 'Test project',
          message_count: 2,
          participants: ['Alice', 'Bob'],
          date_range: { start: '2024-01-01', end: '2024-01-02' },
          analysis: { keywords: ['invoice'] }
        },
        error: null
      })
    }

    const messagesBuilder: QueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          { sender: 'Alice', message: 'Invoice 123 was sent', timestamp: '2024-01-01T10:00:00Z' },
          { sender: 'OCR', message: '[Attachment:receipt.jpg] Total amount 125.00 USD', timestamp: '2024-01-01T11:00:00Z' },
          { sender: 'Bob', message: 'Payment received', timestamp: '2024-01-01T12:00:00Z' }
        ],
        error: null
      })
    }

    getUserClientMock.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'projects') return projectsBuilder
        if (table === 'messages') return messagesBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const request = new NextRequest('http://localhost/api/ai-chat/query', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'proj-1',
        message: 'find invoice discussion'
      })
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.response).toContain('Invoice 123')
    expect(body.response).toContain('receipt.jpg')
    expect(body.response).toContain('125.00')
  })
})
