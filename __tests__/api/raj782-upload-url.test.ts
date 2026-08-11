/**
 * RAJ-782 — /api/upload-url authorization, storage tier, and CLIENT CONTRACT.
 *
 * THE BUG
 * -------
 * Files over GCS_THRESHOLD (10 MB) route to POST /api/upload-url, which called
 * `requireAuth()` and demanded a Supabase Bearer JWT. The app has NO login or
 * signup UI, so no JWT can ever exist. Every upload above 10 MB failed with
 * "Missing or invalid Authorization header" — in production, always. It passed
 * locally only because `requireAuth` returns a dev user when NODE_ENV is
 * 'development'. Reported symptom: a 28.52 MB
 * "WhatsApp Chat - KoLake Finance and Petty Cash.zip" could not be loaded.
 *
 * THE SECOND BUG (found by four-eyes review, not by these tests)
 * -------------------------------------------------------------
 * The first version of the fix authorized correctly and minted a working
 * Supabase URL — but dropped `sessionId` from the response. The client does
 * `const { sessionId, uploadUrl } = await urlRes.json()` and then polls
 * `sessions` with it, so the file uploaded fine and was then never processed:
 * the same user-visible failure, plus an orphaned object per attempt. Every
 * test still passed, because they all mocked storage and none asserted the
 * response SHAPE the client depends on.
 *
 * That is why the contract block below exists. A test that only proves the
 * server is internally consistent proves nothing about whether the feature
 * works.
 */
const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222'

const mockState: {
  authError: any
  hasCredential: boolean
  inserted: Record<string, any[]>
  archiveDays: number | null
} = { authError: null, hasCredential: true, inserted: {}, archiveDays: null }

jest.mock('../../lib/api-auth', () => ({
  requireProjectAccess: jest.fn(async () => mockState.authError),
  hasAnyProjectCredential: jest.fn(() => mockState.hasCredential),
  missingCredentialResponse: () => {
    const { NextResponse } = require('next/server')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  },
  isValidProjectId: (v: unknown) =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

jest.mock('../../lib/auth', () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      insert: (rows: any) => {
        ;(mockState.inserted[table] ||= []).push(rows)
        return Promise.resolve({ data: rows, error: null })
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              mockState.archiveDays === null ? {} : { archive_days: mockState.archiveDays },
            error: null,
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUploadUrl: async (p: string) => ({
          data: { signedUrl: `https://sb.invalid/${p}` },
          error: null,
        }),
      }),
    },
  }),
}))

import { NextResponse } from 'next/server'
import { POST } from '../../app/api/upload-url/route'

const req = (body: any) =>
  ({
    method: 'POST',
    headers: { get: () => null, has: () => false },
    cookies: { get: () => undefined, getAll: () => [] },
    json: async () => body,
  }) as any

const ok = (over: Record<string, any> = {}) =>
  req({
    projectId: PROJECT,
    fileName: 'WhatsApp Chat - KoLake Finance and Petty Cash.zip',
    fileSize: Math.round(28.52 * 1024 * 1024),
    mimeType: 'application/zip',
    ...over,
  })

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  mockState.authError = null
  mockState.hasCredential = true
  mockState.inserted = {}
  mockState.archiveDays = null
  ;(process.env as any).NODE_ENV = 'production'
  process.env.SUPABASE_STORAGE_BUCKET = 'evidence'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

// ---------------------------------------------------------------------------
describe('RAJ-782 — CLIENT CONTRACT (the shape file-upload.tsx destructures)', () => {
  it('REGRESSION: returns sessionId AND uploadUrl', async () => {
    // components/file-upload.tsx:
    //   const { sessionId, uploadUrl } = await urlRes.json()
    // Dropping either silently breaks the whole upload flow while every
    // server-side test still passes. This is that guard.
    const res = await POST(ok())
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(typeof body.sessionId).toBe('string')
    expect(body.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(typeof body.uploadUrl).toBe('string')
    expect(body.uploadUrl).toContain('https://')
  })

  it('creates the sessions row the client will poll, with an explicit storage_path', async () => {
    const res = await POST(ok())
    const body = await res.json()
    const session = mockState.inserted['sessions']?.[0]

    expect(session).toBeDefined()
    expect(session.id).toBe(body.sessionId)
    expect(session.project_id).toBe(PROJECT)
    // process-file must NOT have to reconstruct a path — that is what broke.
    expect(session.storage_path).toBe(body.path)
    expect(session.storage_provider).toBe('supabase')
    expect(session.processing_status).toBe('pending')
  })

  it('satisfies sessions.user_id NOT NULL deterministically for the same project', async () => {
    await POST(ok())
    await POST(ok())
    const [a, b] = mockState.inserted['sessions']
    expect(a.user_id).toBeTruthy()
    expect(a.user_id).toBe(b.user_id)
  })

  it('names the retention date archiveAt, not expiresAt (it is not the URL expiry)', async () => {
    const body = await (await POST(ok())).json()
    expect(body.archiveAt).toBeDefined()
    expect(new Date(body.archiveAt).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('RAJ-782 — authorization', () => {
  it('REGRESSION: accepts a 28 MB zip (the reported failure)', async () => {
    expect((await POST(ok())).status).toBe(200)
  })

  it('rejects before parsing the body when no credential is present', async () => {
    mockState.hasCredential = false
    const res = await POST(ok())
    expect(res.status).toBe(401)
    expect(mockState.inserted['sessions']).toBeUndefined()
  })

  it('rejects an invalid or missing project token', async () => {
    mockState.authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    expect((await POST(ok())).status).toBe(401)
  })

  it('rejects a token minted for a different project, writing nothing', async () => {
    mockState.authError = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const res = await POST(ok({ projectId: OTHER_PROJECT }))
    expect(res.status).toBe(403)
    expect(mockState.inserted['sessions']).toBeUndefined()
    expect(mockState.inserted['media_objects']).toBeUndefined()
  })

  it('requires a valid project id', async () => {
    expect((await POST(ok({ projectId: 'nope' }))).status).toBe(400)
  })

  it('never requires an Authorization header (no login UI can produce one)', async () => {
    expect((await POST(ok())).status).not.toBe(401)
  })
})

describe('RAJ-782 — input validation happens before any write', () => {
  it('rejects an oversize file with 413', async () => {
    const res = await POST(ok({ fileSize: 900 * 1024 * 1024 }))
    expect(res.status).toBe(413)
    expect(mockState.inserted['sessions']).toBeUndefined()
  })

  it('rejects a disallowed extension with 415', async () => {
    const res = await POST(ok({ fileName: 'payload.exe' }))
    expect(res.status).toBe(415)
    expect(mockState.inserted['sessions']).toBeUndefined()
  })

  it('rejects an absurdly long filename rather than letting it into the object key', async () => {
    const res = await POST(ok({ fileName: 'a'.repeat(5000) + '.zip' }))
    expect(res.status).toBe(400)
    expect(mockState.inserted['sessions']).toBeUndefined()
  })

  it('sanitises the filename out of the object path (no traversal, no separators)', async () => {
    const body = await (await POST(ok({ fileName: '../../etc/passwd.zip' }))).json()
    // The property that matters is structural: the key has exactly three
    // segments and is anchored under this project. Asserting the absence of the
    // '.' character would be cosmetic — '..' cannot traverse once '/' is gone.
    expect(body.path.split('/')).toHaveLength(3) // projectId / sessionId / name
    expect(body.path.startsWith(`${PROJECT}/`)).toBe(true)
    expect(body.path).not.toContain('..')
    expect(body.path.split('/')[2].startsWith('.')).toBe(false)
  })

  it('falls back to a placeholder when sanitising leaves nothing usable', async () => {
    const body = await (await POST(ok({ fileName: '....zip' }))).json()
    expect(body.path.split('/')[2].length).toBeGreaterThan(0)
  })
})

describe('RAJ-782 — retention', () => {
  it('records media_objects as pending until the bytes are confirmed', async () => {
    await POST(ok())
    const media = mockState.inserted['media_objects']?.[0]
    expect(media.status).toBe('pending')
    expect(media.project_id).toBe(PROJECT)
  })

  it("honours the project's archive_days rather than only the env default", async () => {
    mockState.archiveDays = 30
    const body = await (await POST(ok())).json()
    const days = (new Date(body.archiveAt).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29)
    expect(days).toBeLessThan(31)
  })

  it('honours archive_days = 0 instead of coercing it to the default', async () => {
    mockState.archiveDays = 0
    const body = await (await POST(ok())).json()
    const days = (new Date(body.archiveAt).getTime() - Date.now()) / 86_400_000
    expect(days).toBeLessThan(0.001)
  })
})
