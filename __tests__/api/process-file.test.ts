import { POST } from '../../app/api/process-file/route'

describe('/api/process-file', () => {
  test('returns 400 when no file is supplied', async () => {
    const request = {
      formData: async () => ({
        get: () => null,
      }),
    } as any

    const response = await POST(request)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toMatch(/No file provided/i)
  })

  test('returns 400 for unsupported file type', async () => {
    const unsupportedFile = new File(['content'], 'notes.unsupported', {
      type: 'application/octet-stream',
    })

    const request = {
      formData: async () => ({
        get: (key: string) => {
          if (key === 'file') {
            return unsupportedFile
          }
          return null
        },
      }),
    } as any

    const response = await POST(request)
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toMatch(/Unsupported file type/i)
  })
})
