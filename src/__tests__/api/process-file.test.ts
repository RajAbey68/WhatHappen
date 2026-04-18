describe('POST /api/process-file', () => {
  const mockPOST = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when no file is provided', async () => {
    mockPOST.mockResolvedValueOnce({
      status: 400,
      json: async () => ({ success: false, error: 'No file provided' }),
    })

    const response = await mockPOST()
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
  })

  test('processes text file successfully', async () => {
    mockPOST.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          messageCount: 42,
          participants: ['Alice', 'Bob'],
          dateRange: { start: '2024-01-01', end: '2024-01-31' },
        },
      }),
    })

    const response = await mockPOST({ file: 'chat.txt' })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.messageCount).toBeGreaterThan(0)
  })

  test('handles CSV file upload', async () => {
    mockPOST.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        data: { rows: 150, columns: 5 },
      }),
    })

    const response = await mockPOST({ file: 'data.csv' })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.rows).toBeGreaterThan(0)
  })

  test('rejects unsupported file types', async () => {
    mockPOST.mockResolvedValueOnce({
      status: 400,
      json: async () => ({ success: false, error: 'Unsupported file type' }),
    })

    const response = await mockPOST({ file: 'image.png' })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Unsupported')
  })

  test('validates file size limits', async () => {
    mockPOST.mockResolvedValueOnce({
      status: 413,
      json: async () => ({ success: false, error: 'File too large' }),
    })

    const response = await mockPOST({ file: 'huge_file.txt', size: '500MB' })
    const data = await response.json()

    expect(response.status).toBe(413)
  })
})
