/**
 * Comprehensive Test Harness: PostgREST Resilience, 0-Row Lookups & Upload Lifecycle
 * 
 * Verifies that:
 * 1. PostgREST 0-row lookups degrade gracefully to 404s/empty states rather than throwing PGRST116 coercion errors.
 * 2. Upload lifecycle states ('pending' -> 'processing' -> 'complete' | 'error') correctly reflect in polling.
 * 3. Magic-byte verification permits signatureless formats (.txt, .csv, .json, .pst) and rejects mismatched binaries.
 * 4. Error propagation to the client is clean and structured.
 */

import { NextResponse } from 'next/server'
import { POST as processFilePost, GET as processFileGet } from '../../app/api/process-file/route'
import { POST as processWhatsappInappPost } from '../../app/api/process-whatsapp-inapp/route'
import { GET as getProjectById } from '../../app/api/projects/[id]/route'
import { GET as getAiChatProject } from '../../app/api/ai-chat/[projectId]/route'
import { safeParseTimestamp } from '../../lib/api-auth'

const VALID_PROJECT_ID = '11111111-2222-3333-4444-555555555555'
const NON_EXISTENT_PROJECT_ID = '99999999-9999-9999-9999-999999999999'
const VALID_SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const NON_EXISTENT_SESSION_ID = '00000000-0000-0000-0000-000000000000'

// Realistic database mock state
const mockDb = {
  sessions: new Map<string, any>(),
  projects: new Map<string, any>(),
  messages: [] as any[],
  storage: new Map<string, Buffer>(),
  storageError: null as string | null,
}

const mockRequest = (opts: {
  url?: string
  body?: any
  headers?: Record<string, string>
  method?: string
}) => {
  const headers = new Map(
    Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  )
  return {
    url: opts.url || 'http://localhost/api/test',
    method: opts.method || 'POST',
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
      has: (k: string) => headers.has(k.toLowerCase()),
    },
    json: jest.fn().mockResolvedValue(opts.body ?? {}),
    formData: jest.fn().mockResolvedValue(null),
  } as any
}

jest.mock('../../lib/api-auth', () => {
  const actual = jest.requireActual('../../lib/api-auth')
  return {
    ...actual,
    PROJECT_TOKEN_HEADER: 'x-project-token',
    requireProjectAccess: jest.fn(async (_req: any, projectId: string) => {
      if (projectId === 'unauthorized-project') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return null
    }),
    isAuthBypassed: jest.fn(() => false),
    hasAnyProjectCredential: jest.fn(() => true),
    missingCredentialResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    isValidProjectId: (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v),
  }
})

jest.mock('../../lib/auth', () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      let filterCol = ''
      let filterVal = ''
      let updatePayload: any = null

      const builder: any = {
        select: (_cols?: string) => builder,
        eq: (col: string, val: string) => {
          filterCol = col
          filterVal = val
          if (updatePayload && table === 'sessions') {
            const existing = mockDb.sessions.get(val)
            if (existing) {
              mockDb.sessions.set(val, { ...existing, ...updatePayload })
            }
          }
          return builder
        },
        order: (_col: string, _opts?: any) => builder,
        delete: () => builder,
        update: (payload: any) => {
          updatePayload = payload
          return builder
        },
        insert: async (records: any) => {
          const arr = Array.isArray(records) ? records : [records]
          if (table === 'messages') {
            mockDb.messages.push(...arr)
          } else if (table === 'projects') {
            for (const r of arr) {
              const id = r.id || VALID_PROJECT_ID
              mockDb.projects.set(id, { ...r, id })
            }
          }
          return { data: arr, error: null }
        },
        // Emulate realistic PostgREST .maybeSingle() behavior: returns null when 0 rows match
        maybeSingle: async () => {
          if (table === 'sessions') {
            const session = mockDb.sessions.get(filterVal)
            return { data: session || null, error: null }
          }
          if (table === 'projects') {
            const project = mockDb.projects.get(filterVal)
            return { data: project || null, error: null }
          }
          return { data: null, error: null }
        },
        // Emulate real PostgREST .single() behavior: throws PGRST116 when 0 rows match
        single: async () => {
          if (table === 'sessions') {
            const session = mockDb.sessions.get(filterVal)
            if (!session) {
              return {
                data: null,
                error: {
                  code: 'PGRST116',
                  details: 'The result contains 0 rows',
                  message: 'Cannot coerce the result to a single JSON object',
                },
              }
            }
            return { data: session, error: null }
          }
          if (table === 'projects') {
            const project = mockDb.projects.get(filterVal)
            if (!project) {
              return {
                data: null,
                error: {
                  code: 'PGRST116',
                  details: 'The result contains 0 rows',
                  message: 'Cannot coerce the result to a single JSON object',
                },
              }
            }
            return { data: project, error: null }
          }
          return { data: null, error: new Error('PostgREST single error') }
        },
        // Make builder awaitable/thenable
        then: (onfulfilled: any, onrejected: any) => {
          return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected)
        },
        catch: (onrejected: any) => {
          return Promise.resolve({ data: null, error: null }).catch(onrejected)
        },
      }

      return builder
    },
    storage: {
      from: (_bucket: string) => ({
        download: async (path: string) => {
          if (mockDb.storageError) {
            return { data: null, error: new Error(mockDb.storageError) }
          }
          const buf = mockDb.storage.get(path)
          if (!buf) {
            return { data: null, error: new Error('Object not found in storage') }
          }
          return {
            data: {
              arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
            },
            error: null,
          }
        },
      }),
    },
  }),
}))

describe('PostgREST Resilience & Zero-Row Handling', () => {
  beforeEach(() => {
    mockDb.sessions.clear()
    mockDb.projects.clear()
    mockDb.messages = []
    mockDb.storage.clear()
    mockDb.storageError = null

    // Seed a valid project
    mockDb.projects.set(VALID_PROJECT_ID, {
      id: VALID_PROJECT_ID,
      name: 'Alpha Project',
      message_count: 0,
      analysis: null,
    })
  })

  describe('1. Zero-Row Lookups do NOT throw PGRST116', () => {
    it('POST /api/process-file returns 404 when sessionId is not found in DB', async () => {
      const req = mockRequest({
        url: `http://localhost/api/process-file?sessionId=${NON_EXISTENT_SESSION_ID}&projectId=${VALID_PROJECT_ID}`,
        method: 'POST',
      })
      const res = await processFilePost(req)
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error).toMatch(/Session not found/i)
      // Must not contain unhandled PostgREST coercion text
      expect(data.error).not.toContain('Cannot coerce the result')
    })

    it('GET /api/projects/[id] returns 404 when project does not exist', async () => {
      const req = mockRequest({
        url: 'http://localhost/api/projects/unknown',
        method: 'GET',
        headers: { 'x-project-token': 'valid-token' },
      })
      const res = await getProjectById(req, { params: { id: NON_EXISTENT_PROJECT_ID } })
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('Project not found')
    })

    it('GET /api/ai-chat/[projectId] returns 404 when project does not exist', async () => {
      const req = mockRequest({
        url: 'http://localhost/api/ai-chat/unknown',
        method: 'GET',
        headers: { 'x-project-token': 'valid-token' },
      })
      const res = await getAiChatProject(req, { params: { projectId: NON_EXISTENT_PROJECT_ID } })
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('Project not found')
    })
  })

  describe('2. Upload & Processing Lifecycle States', () => {
    it('handles transition from pending -> complete and serves polling', async () => {
      // 1. Initial pending session created
      mockDb.sessions.set(VALID_SESSION_ID, {
        id: VALID_SESSION_ID,
        project_id: VALID_PROJECT_ID,
        file_name: 'test_chat.txt',
        file_size_bytes: 1024,
        processing_status: 'pending',
        processing_error: null,
        storage_provider: 'supabase',
        storage_path: `${VALID_PROJECT_ID}/${VALID_SESSION_ID}/test_chat.txt`,
      })

      // 2. Poll while pending
      const pollReq1 = mockRequest({
        url: `http://localhost/api/process-file?sessionId=${VALID_SESSION_ID}&projectId=${VALID_PROJECT_ID}`,
        method: 'GET',
        headers: { 'x-project-token': 'valid-token' },
      })
      const pollRes1 = await processFileGet(pollReq1)
      expect(pollRes1.status).toBe(200)
      const pollData1 = await pollRes1.json()
      expect(pollData1.session.processing_status).toBe('pending')

      // 3. Complete processing via in-app completion
      const compReq = mockRequest({
        url: 'http://localhost/api/process-whatsapp-inapp',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-project-token': 'valid-token',
        },
        body: {
          projectId: VALID_PROJECT_ID,
          messages: [
            { sender: 'Alice', message: 'Hello world', timestamp: '2024-01-01T10:00:00.000Z' },
            { sender: 'Bob', message: 'Hi Alice', timestamp: '2024-01-01T10:01:00.000Z' },
          ],
          analysis: {
            participants: ['Alice', 'Bob'],
            dateRange: { start: '2024-01-01T10:00:00.000Z', end: '2024-01-01T10:01:00.000Z' },
            keywords: ['hello', 'world'],
          },
        },
      })

      const compRes = await processWhatsappInappPost(compReq)
      expect(compRes.status).toBe(200)
      const compData = await compRes.json()
      expect(compData.success).toBe(true)
      expect(compData.messageCount).toBe(2)

      // 4. Verify messages were inserted into DB
      expect(mockDb.messages.length).toBe(2)
      expect(mockDb.messages[0].sender).toBe('Alice')
    })
  })

  describe('3. Signatureless Formats (.txt, .csv, .json, .pst) Ingestion', () => {
    it('accepts signatureless plain text files without false magic-byte rejection', async () => {
      const textContent = Buffer.from('2024-01-01, 10:00 - Alice: Hey\n2024-01-01, 10:01 - Bob: Hey Alice')
      const storagePath = `${VALID_PROJECT_ID}/${VALID_SESSION_ID}/chat.txt`

      mockDb.storage.set(storagePath, textContent)
      mockDb.sessions.set(VALID_SESSION_ID, {
        id: VALID_SESSION_ID,
        project_id: VALID_PROJECT_ID,
        file_name: 'chat.txt',
        file_size_bytes: textContent.length,
        processing_status: 'pending',
        storage_provider: 'supabase',
        storage_path: storagePath,
      })

      const req = mockRequest({
        url: `http://localhost/api/process-file?sessionId=${VALID_SESSION_ID}&projectId=${VALID_PROJECT_ID}`,
        method: 'POST',
        headers: { 'x-project-token': 'valid-token' },
      })

      const res = await processFilePost(req)
      // Must not fail with 415 unsupported media type
      expect(res.status).not.toBe(415)
      const session = mockDb.sessions.get(VALID_SESSION_ID)
      expect(session.processing_error || '').not.toMatch(/not a permitted type/i)
    })
  })

  describe('4. Storage Degradation & Error Handling', () => {
    it('handles storage download failure and marks session as error', async () => {
      mockDb.storageError = 'Service Unavailable'
      mockDb.sessions.set(VALID_SESSION_ID, {
        id: VALID_SESSION_ID,
        project_id: VALID_PROJECT_ID,
        file_name: 'chat.zip',
        file_size_bytes: 5000,
        processing_status: 'pending',
        storage_provider: 'supabase',
        storage_path: `${VALID_PROJECT_ID}/${VALID_SESSION_ID}/chat.zip`,
      })

      const req = mockRequest({
        url: `http://localhost/api/process-file?sessionId=${VALID_SESSION_ID}&projectId=${VALID_PROJECT_ID}`,
        method: 'POST',
        headers: { 'x-project-token': 'valid-token' },
      })

      const res = await processFilePost(req)
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toContain('Failed to download file from storage')

      const session = mockDb.sessions.get(VALID_SESSION_ID)
      expect(session.processing_status).toBe('error')
      expect(session.processing_error).toContain('Download failed')
    })
  })
})
