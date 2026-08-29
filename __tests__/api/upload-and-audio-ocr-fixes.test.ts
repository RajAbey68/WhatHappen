import { GET as processFileGet } from '../../app/api/process-file/route'
import { isAudioFile, getAudioMimeType } from '../../lib/audio-transcriber'
import { isImageFile } from '../../lib/gemini-ocr'
import { NextRequest, NextResponse } from 'next/server'

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

const mockState: {
  authError: any
  sessionData: any
} = {
  authError: null,
  sessionData: null,
}

jest.mock('../../lib/api-auth', () => ({
  requireProjectAccess: jest.fn(async () => mockState.authError),
  isAuthBypassed: jest.fn(() => false),
  hasAnyProjectCredential: jest.fn(() => true),
  missingCredentialResponse: () => {
    const { NextResponse } = require('next/server')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  },
  isValidProjectId: (v: unknown) => typeof v === 'string',
}))

jest.mock('../../lib/auth', () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (val === SESSION_ID) {
              return { data: mockState.sessionData, error: null }
            }
            return { data: null, error: null }
          },
          single: async () => {
            if (val === SESSION_ID) {
              return { data: mockState.sessionData, error: null }
            }
            return { data: null, error: new Error('Row not found') }
          },
        }),
      }),
    }),
  }),
}))

describe('Upload & Audio/OCR Pipeline Fixes', () => {
  beforeEach(() => {
    mockState.authError = null
    mockState.sessionData = {
      id: SESSION_ID,
      project_id: PROJECT_ID,
      file_name: 'test_chat.zip',
      file_size_bytes: 50000,
      processing_status: 'complete',
      processing_error: null,
      total_messages: 150,
      date_range_start: '2024-01-01T00:00:00.000Z',
      date_range_end: '2024-01-10T00:00:00.000Z',
      created_at: new Date().toISOString(),
      processing_ms: 1200,
    }
  })

  describe('Audio & Image Type Detection', () => {
    it('correctly detects audio files supported in WhatsApp exports', () => {
      expect(isAudioFile('PTT-20240101-WA0001.opus')).toBe(true)
      expect(isAudioFile('audio.m4a')).toBe(true)
      expect(isAudioFile('voice_note.mp3')).toBe(true)
      expect(isAudioFile('recording.wav')).toBe(true)
      expect(isAudioFile('sound.ogg')).toBe(true)
      expect(isAudioFile('video.mp4')).toBe(false)
      expect(isAudioFile('document.pdf')).toBe(false)
    })

    it('maps audio file extensions to accurate MIME types', () => {
      expect(getAudioMimeType('note.opus')).toBe('audio/ogg')
      expect(getAudioMimeType('audio.m4a')).toBe('audio/mp4')
      expect(getAudioMimeType('track.mp3')).toBe('audio/mpeg')
      expect(getAudioMimeType('voice.wav')).toBe('audio/wav')
    })

    it('identifies image files for OCR processing', () => {
      expect(isImageFile('IMG-20240101-WA0001.jpg')).toBe(true)
      expect(isImageFile('photo.jpeg')).toBe(true)
      expect(isImageFile('screenshot.png')).toBe(true)
      expect(isImageFile('sticker.webp')).toBe(true)
      expect(isImageFile('ios_photo.heic')).toBe(true)
      expect(isImageFile('video.mp4')).toBe(false)
    })
  })

  describe('GET /api/process-file (Authenticated Polling Route)', () => {
    it('returns 400 when sessionId is missing', async () => {
      const req = new NextRequest('http://localhost/api/process-file', { method: 'GET' })
      const res = await processFileGet(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('sessionId')
    })

    it('returns 404 when session is not found', async () => {
      const req = new NextRequest('http://localhost/api/process-file?sessionId=non-existent', { method: 'GET' })
      const res = await processFileGet(req)
      expect(res.status).toBe(404)
    })

    it('returns 401/403 when authorization fails', async () => {
      mockState.authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const req = new NextRequest(`http://localhost/api/process-file?sessionId=${SESSION_ID}&projectId=${PROJECT_ID}`, { method: 'GET' })
      const res = await processFileGet(req)
      expect(res.status).toBe(401)
    })

    it('returns 200 with session status and metrics on valid authenticated request', async () => {
      const req = new NextRequest(`http://localhost/api/process-file?sessionId=${SESSION_ID}&projectId=${PROJECT_ID}`, { method: 'GET' })
      const res = await processFileGet(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.session.id).toBe(SESSION_ID)
      expect(data.session.processing_status).toBe('complete')
      expect(data.session.total_messages).toBe(150)
      expect(data.session.date_range_start).toBe('2024-01-01T00:00:00.000Z')
    })
  })
})
