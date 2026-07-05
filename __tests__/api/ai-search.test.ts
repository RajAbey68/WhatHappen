import { POST } from '../../app/api/ai-search/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'user-1' }, token: 'token-1' })),
  getUserClient: jest.fn(),
}))

describe('/api/ai-search', () => {
  test('returns 400 when query is missing', async () => {
    const request = new NextRequest('http://localhost/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({ sessionId: '11111111-1111-1111-1111-111111111111' })
    })

    const response = await POST(request)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toMatch(/query is required/i)
  })

  test('returns 400 when sessionId is invalid', async () => {
    const request = new NextRequest('http://localhost/api/ai-search', {
      method: 'POST',
      body: JSON.stringify({ query: 'top senders', sessionId: 'bad-id' })
    })

    const response = await POST(request)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toMatch(/Invalid session ID/i)
  })
})
