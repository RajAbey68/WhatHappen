import { POST } from '../../app/api/ai-chat/query/route'
import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}))

describe('/api/ai-chat/query', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses stored message content when answering database queries', async () => {
    const fromMock = supabase.from as jest.Mock

    fromMock.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
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
      }

      if (table === 'messages') {
        return {
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
      }

      throw new Error(`Unexpected table: ${table}`)
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
