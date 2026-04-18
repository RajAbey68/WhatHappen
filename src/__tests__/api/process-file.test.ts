import { POST } from '@/app/api/process-file/route'
import { NextRequest } from 'next/server'

describe('POST /api/process-file', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when no file is provided', async () => {
    const formData = new FormData()
    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('No file provided')
  })

  test('returns 400 for unsupported file format', async () => {
    const formData = new FormData()
    const file = new File(['test content'], 'test.exe', { type: 'application/x-executable' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Unsupported file format')
  })

  test('processes txt file successfully', async () => {
    const txtContent = `[01/01/2024, 10:30:00] Alice: Hello!
[01/01/2024, 10:31:00] Bob: Hi there!
[01/01/2024, 10:32:00] Alice: How are you?`

    const formData = new FormData()
    const file = new File([txtContent], 'chat.txt', { type: 'text/plain' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data).toBeDefined()
    expect(data.data.fileName).toBe('chat.txt')
    expect(data.data.totalMessages).toBeGreaterThan(0)
    expect(data.data.participants).toBeDefined()
  })

  test('extracts participants from chat', async () => {
    const txtContent = `[01/01/2024, 10:30:00] Alice: Hello!
[01/01/2024, 10:31:00] Bob: Hi!
[01/01/2024, 10:32:00] Charlie: Hey!`

    const formData = new FormData()
    const file = new File([txtContent], 'chat.txt', { type: 'text/plain' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.data.participants).toContainEqual({ name: 'Alice' })
    expect(data.data.participants).toContainEqual({ name: 'Bob' })
    expect(data.data.participants).toContainEqual({ name: 'Charlie' })
  })

  test('calculates message counts by participant', async () => {
    const txtContent = `[01/01/2024, 10:30:00] Alice: Hello!
[01/01/2024, 10:31:00] Alice: How are you?
[01/01/2024, 10:32:00] Bob: I'm fine!`

    const formData = new FormData()
    const file = new File([txtContent], 'chat.txt', { type: 'text/plain' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.data.analysis.messagesByParticipant.Alice).toBe(2)
    expect(data.data.analysis.messagesByParticipant.Bob).toBe(1)
  })

  test('handles CSV file format', async () => {
    const csvContent = `name,message,timestamp
Alice,Hello,2024-01-01T10:30:00
Bob,Hi,2024-01-01T10:31:00`

    const formData = new FormData()
    const file = new File([csvContent], 'chat.csv', { type: 'text/csv' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.fileName).toBe('chat.csv')
  })

  test('handles JSON file format', async () => {
    const jsonContent = JSON.stringify({
      messages: [
        { sender: 'Alice', text: 'Hello', timestamp: '2024-01-01T10:30:00' },
        { sender: 'Bob', text: 'Hi', timestamp: '2024-01-01T10:31:00' }
      ]
    })

    const formData = new FormData()
    const file = new File([jsonContent], 'chat.json', { type: 'application/json' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.fileName).toBe('chat.json')
  })

  test('includes response metadata', async () => {
    const txtContent = `[01/01/2024, 10:30:00] Alice: Hello!`

    const formData = new FormData()
    const file = new File([txtContent], 'chat.txt', { type: 'text/plain' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.data.fileId).toBeDefined()
    expect(data.data.chatId).toBeDefined()
    expect(data.data.processedAt).toBeDefined()
    expect(data.data.fileSize).toBeDefined()
  })

  test('returns preview of first 100 messages', async () => {
    const txtContent = Array.from({ length: 150 }, (_, i) =>
      `[01/01/2024, ${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(30 + (i % 60)).padStart(2, '0')}:00] User${i % 2}: Message ${i}`
    ).join('\n')

    const formData = new FormData()
    const file = new File([txtContent], 'chat.txt', { type: 'text/plain' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.data.messages.length).toBeLessThanOrEqual(100)
    expect(data.data.totalMessages).toBeGreaterThan(100)
  })

  test('handles media messages correctly', async () => {
    const txtContent = `[01/01/2024, 10:30:00] Alice: <Media omitted>
[01/01/2024, 10:31:00] Bob: <image omitted>
[01/01/2024, 10:32:00] Charlie: Normal message`

    const formData = new FormData()
    const file = new File([txtContent], 'chat.txt', { type: 'text/plain' })
    formData.append('file', file)

    const request = new NextRequest('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.data.analysis.mediaMessages).toBe(2)
    expect(data.data.analysis.textMessages).toBe(1)
  })
})
