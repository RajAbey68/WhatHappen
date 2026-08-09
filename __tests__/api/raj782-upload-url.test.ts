/**
 * RAJ-782 — /api/upload-url authorization and storage tier.
 *
 * THE BUG
 * -------
 * Files over GCS_THRESHOLD (10 MB) route to POST /api/upload-url, which called
 * `requireAuth()` and demanded `Authorization: Bearer <supabase-jwt>`. The app
 * has NO login or signup UI, so `supabase.auth.getSession()` always returns
 * null and no Bearer header is ever sent. Every upload above 10 MB therefore
 * failed with "Missing or invalid Authorization header" — in production, always.
 * It passed locally only because `requireAuth` returns a synthetic dev user
 * when NODE_ENV === 'development'.
 *
 * Reported symptom: a 28.52 MB "WhatsApp Chat - KoLake Finance and Petty Cash.zip"
 * could not be loaded.
 *
 * THE FIX
 * -------
 * Authorize with the passphrase-proven project token (the app's actual auth
 * mechanism) and mint a Supabase Storage signed upload URL instead of a GCS one.
 *
 * Test 'accepts a 28 MB zip' is the regression for the reported bug.
 */
const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222'

const mockState: { authError: any; signedUrl: any; inserted: any[] } = {
  authError: null,
  signedUrl: { url: 'https://sb.invalid/signed', path: 'p', expiresAt: 0 },
  inserted: [],
}

jest.mock('../../lib/api-auth', () => ({
  requireProjectAccess: jest.fn(async () => mockState.authError),
  isValidProjectId: (v: unknown) =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

jest.mock('../../lib/auth', () => ({
  getServiceClient: () => ({
    from: () => ({
      insert: (rows: any) => {
        mockState.inserted.push(rows)
        return Promise.resolve({ data: rows, error: null })
      },
    }),
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({
          data: { signedUrl: `https://sb.invalid/${path}` },
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

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  mockState.authError = null
  mockState.inserted = []
  ;(process.env as any).NODE_ENV = 'production'
  process.env.SUPABASE_STORAGE_BUCKET = 'evidence'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('RAJ-782 — upload-url is authorized by the project token, not a JWT', () => {
  it('REGRESSION: accepts a 28 MB zip (the reported failure)', async () => {
    const res = await POST(
      req({
        projectId: PROJECT,
        fileName: 'WhatsApp Chat - KoLake Finance and Petty Cash.zip',
        fileSize: 28.52 * 1024 * 1024,
        mimeType: 'application/zip',
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.uploadUrl).toContain('https://sb.invalid/')
    expect(body.path).toContain(PROJECT)
  })

  it('rejects when the project token is missing or invalid', async () => {
    mockState.authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const res = await POST(
      req({ projectId: PROJECT, fileName: 'a.zip', fileSize: 100, mimeType: 'application/zip' })
    )
    expect(res.status).toBe(401)
  })

  it('rejects a token minted for a different project', async () => {
    mockState.authError = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const res = await POST(
      req({ projectId: OTHER_PROJECT, fileName: 'a.zip', fileSize: 100, mimeType: 'application/zip' })
    )
    expect(res.status).toBe(403)
    expect(mockState.inserted).toHaveLength(0)
  })

  it('requires a valid project id', async () => {
    const res = await POST(req({ projectId: 'nope', fileName: 'a.zip', fileSize: 1 }))
    expect(res.status).toBe(400)
  })

  it('rejects an oversize file BEFORE minting a URL', async () => {
    const res = await POST(
      req({
        projectId: PROJECT,
        fileName: 'huge.zip',
        fileSize: 900 * 1024 * 1024,
        mimeType: 'application/zip',
      })
    )
    expect(res.status).toBe(413)
    expect(mockState.inserted).toHaveLength(0)
  })

  it('rejects a disallowed extension', async () => {
    const res = await POST(
      req({
        projectId: PROJECT,
        fileName: 'payload.exe',
        fileSize: 100,
        mimeType: 'application/octet-stream',
      })
    )
    expect(res.status).toBe(415)
    expect(mockState.inserted).toHaveLength(0)
  })

  it('records the object with an expiry derived from the retention window', async () => {
    await POST(
      req({
        projectId: PROJECT,
        fileName: 'chat.zip',
        fileSize: 1024,
        mimeType: 'application/zip',
      })
    )
    expect(mockState.inserted).toHaveLength(1)
    const row = mockState.inserted[0]
    expect(row.project_id).toBe(PROJECT)
    expect(typeof row.expires_at).toBe('string')
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('never requires an Authorization header (there is no login UI to produce one)', async () => {
    const res = await POST(
      req({ projectId: PROJECT, fileName: 'a.zip', fileSize: 10, mimeType: 'application/zip' })
    )
    expect(res.status).not.toBe(401)
  })
})
