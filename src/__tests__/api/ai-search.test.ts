import { POST } from '@/app/api/ai-search/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'user-1' }, token: 'token-1' })),
  getUserClient: jest.fn(),
}))

describe('POST /api/ai-search', () => {
  test('returns 400 when query is missing', async () => {
    const request = new NextRequest('http://localhost/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({ sessionId: '11111111-1111-1111-1111-111111111111' })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toMatch(/query is required/i)
  })

  test('returns 400 for malformed sessionId', async () => {
    const request = new NextRequest('http://localhost/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({ query: 'hello', sessionId: 'not-a-uuid' })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toMatch(/Invalid session ID/i)
  })
})
