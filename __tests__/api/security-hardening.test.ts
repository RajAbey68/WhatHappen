/**
 * Regression tests for the jcode-swarm security findings:
 *   RAJ-738 (authz + field whitelisting on /api/ai-chat/save)
 *   RAJ-739 (webhook shared-secret on /api/process-whatsapp-complete)
 *   RAJ-740 (projectId + message payload validation)
 *   RAJ-745 (safe timestamp parsing)
 *   RAJ-747 (short-lived project access tokens)
 *   RAJ-748 (loud failure on missing Supabase env)
 *   RAJ-759 (explicit response content-type)
 *
 * NOTE: jest.setup.js globally stubs `next/server`, so requests here are plain
 * objects with `headers` as a Map and responses are plain objects.
 */

const VALID_PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222'

const inserted: any[] = []

const makeQuery = () => {
  const q: any = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
    single: jest.fn(() => Promise.resolve({ data: { id: 'conv-1' }, error: null })),
    maybeSingle: jest.fn(() =>
      Promise.resolve({ data: { id: VALID_PROJECT_ID }, error: null })
    ),
    insert: jest.fn((rows: any) => {
      inserted.push(rows)
      return q
    }),
    update: jest.fn(() => q),
    then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
  }
  return q
}

jest.mock('../../lib/auth', () => ({
  getServiceClient: () => ({ from: jest.fn(() => makeQuery()) }),
  requireAuth: jest.fn(),
}))

import {
  safeParseTimestamp,
  isValidProjectId,
  issueProjectToken,
  verifyProjectToken,
} from '../../lib/api-auth'

const ORIGINAL_ENV = { ...process.env }

/** Build a request shaped like the jest.setup.js NextRequest stub. */
const mockRequest = (opts: {
  url?: string
  body?: any
  headers?: Record<string, string>
}) => {
  const headers = new Map(
    Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  )
  return {
    url: opts.url || 'http://localhost/api/test',
    method: 'POST',
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
      has: (k: string) => headers.has(k.toLowerCase()),
    },
    json: jest.fn().mockResolvedValue(opts.body ?? {}),
    formData: jest.fn().mockResolvedValue(new Map()),
  } as any
}

/** Force production-like behaviour so auth is NOT bypassed. */
function enforceAuth() {
  ;(process.env as any).NODE_ENV = 'production'
  process.env.BYPASS_AUTH = 'false'
  process.env.APP_SESSION_SECRET = 'test-secret-value'
}

beforeEach(() => {
  inserted.length = 0
  jest.clearAllMocks()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

// -----------------------------------------------------------------------------
describe('RAJ-745 — safeParseTimestamp', () => {
  it('rejects malformed timestamps instead of producing Invalid Date', () => {
    expect(safeParseTimestamp('not-a-date')).toBeNull()
    expect(safeParseTimestamp('')).toBeNull()
    expect(safeParseTimestamp(undefined)).toBeNull()
    expect(safeParseTimestamp(null)).toBeNull()
    expect(safeParseTimestamp({})).toBeNull()
    expect(safeParseTimestamp(NaN)).toBeNull()
    expect(safeParseTimestamp(Infinity)).toBeNull()
  })

  it('accepts valid ISO strings, epoch numbers and Date objects', () => {
    expect(safeParseTimestamp('2026-01-02T03:04:05.000Z')).toBe('2026-01-02T03:04:05.000Z')
    expect(safeParseTimestamp(0)).toBe('1970-01-01T00:00:00.000Z')
    expect(safeParseTimestamp(new Date(0))).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('RAJ-740 — project id validation', () => {
  it('rejects non-UUID project ids', () => {
    expect(isValidProjectId('../../etc/passwd')).toBe(false)
    expect(isValidProjectId("1' OR '1'='1")).toBe(false)
    expect(isValidProjectId('')).toBe(false)
    expect(isValidProjectId(123 as any)).toBe(false)
  })

  it('accepts a well-formed UUID', () => {
    expect(isValidProjectId(VALID_PROJECT_ID)).toBe(true)
  })
})

describe('RAJ-747 — short-lived project tokens', () => {
  beforeEach(enforceAuth)

  it('round-trips a token for the same project', () => {
    const { token } = issueProjectToken(VALID_PROJECT_ID)
    expect(verifyProjectToken(token, VALID_PROJECT_ID)).toBe(true)
  })

  it('rejects a token bound to a different project', () => {
    const { token } = issueProjectToken(VALID_PROJECT_ID)
    expect(verifyProjectToken(token, OTHER_PROJECT_ID)).toBe(false)
  })

  it('rejects expired tokens', () => {
    const { token } = issueProjectToken(VALID_PROJECT_ID, -1000)
    expect(verifyProjectToken(token, VALID_PROJECT_ID)).toBe(false)
  })

  it('rejects tampered/garbage tokens', () => {
    expect(verifyProjectToken('garbage', VALID_PROJECT_ID)).toBe(false)
    const { token } = issueProjectToken(VALID_PROJECT_ID)
    expect(verifyProjectToken(token.slice(0, -1) + '0', VALID_PROJECT_ID)).toBe(false)
  })
})

describe('RAJ-738 — /api/ai-chat/save authorization + field whitelisting', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { POST, GET } = require('../../app/api/ai-chat/save/route')

  const validMsg = { role: 'user', content: 'hi', timestamp: '2026-01-01T00:00:00Z' }

  it('rejects unauthenticated writes with 401', async () => {
    enforceAuth()
    const res = await POST(
      mockRequest({ body: { projectId: VALID_PROJECT_ID, messages: [validMsg] } })
    )
    expect(res.status).toBe(401)
  })

  it('rejects a non-UUID projectId with 400', async () => {
    enforceAuth()
    const res = await POST(
      mockRequest({ body: { projectId: 'not-a-uuid', messages: [validMsg] } })
    )
    expect(res.status).toBe(400)
  })

  it('rejects unauthenticated reads with 401', async () => {
    enforceAuth()
    const res = await GET(
      mockRequest({ url: `http://localhost/api/ai-chat/save?projectId=${VALID_PROJECT_ID}` })
    )
    expect(res.status).toBe(401)
  })

  it('rejects malformed timestamps (RAJ-745) even when authorized', async () => {
    enforceAuth()
    const { token } = issueProjectToken(VALID_PROJECT_ID)
    const res = await POST(
      mockRequest({
        headers: { 'x-project-token': token },
        body: {
          projectId: VALID_PROJECT_ID,
          messages: [{ role: 'user', content: 'hi', timestamp: 'nonsense' }],
        },
      })
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid message payload' })
  })

  it('rejects disallowed roles', async () => {
    enforceAuth()
    const { token } = issueProjectToken(VALID_PROJECT_ID)
    const res = await POST(
      mockRequest({
        headers: { 'x-project-token': token },
        body: {
          projectId: VALID_PROJECT_ID,
          messages: [{ role: 'root', content: 'pwn', timestamp: '2026-01-01T00:00:00Z' }],
        },
      })
    )
    expect(res.status).toBe(400)
  })

  it('strips arbitrary client-supplied fields before writing', async () => {
    enforceAuth()
    const { token } = issueProjectToken(VALID_PROJECT_ID)
    await POST(
      mockRequest({
        headers: { 'x-project-token': token },
        body: {
          projectId: VALID_PROJECT_ID,
          messages: [
            { ...validMsg, is_admin: true, id: 'attacker-controlled', project_id: OTHER_PROJECT_ID },
          ],
        },
      })
    )

    expect(inserted.length).toBeGreaterThan(0)
    const saved = inserted[0].messages[0]
    expect(Object.keys(saved).sort()).toEqual(['content', 'role', 'timestamp'])
    expect(saved).not.toHaveProperty('is_admin')
    expect(inserted[0].project_id).toBe(VALID_PROJECT_ID)
  })
})

describe('RAJ-739/740/759 — /api/process-whatsapp-complete', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { POST } = require('../../app/api/process-whatsapp-complete/route')

  it('rejects an unauthenticated in-app call with 401', async () => {
    enforceAuth()
    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json' },
        body: { projectId: VALID_PROJECT_ID, messages: [] },
      })
    )
    expect(res.status).toBe(401)
  })

  it('rejects a webhook call carrying a bad shared secret', async () => {
    enforceAuth()
    process.env.WHATSAPP_WEBHOOK_SECRET = 'correct-horse-battery'
    const res = await POST(
      mockRequest({
        headers: {
          'content-type': 'application/json',
          'x-webhook-secret': 'wrong-secret-value!!!',
        },
        body: { projectId: VALID_PROJECT_ID, messages: [] },
      })
    )
    expect(res.status).toBe(401)
  })

  it('rejects a webhook call when no secret is configured on the server', async () => {
    enforceAuth()
    delete process.env.WHATSAPP_WEBHOOK_SECRET
    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json', 'x-webhook-secret': 'anything' },
        body: { projectId: VALID_PROJECT_ID, messages: [] },
      })
    )
    expect(res.status).toBe(401)
  })

  // RAJ-739 rework: the shared webhook secret is now MANDATORY on every
  // request, so the RAJ-740/759 payload assertions below must supply it in
  // order to reach the validation code paths at all.
  const WEBHOOK_SECRET = 'correct-horse-battery'
  const withSecret = (extra: Record<string, string> = {}) => {
    process.env.WHATSAPP_WEBHOOK_SECRET = WEBHOOK_SECRET
    return {
      'content-type': 'application/json',
      'x-webhook-secret': WEBHOOK_SECRET,
      ...extra,
    }
  }

  it('rejects an authorized call carrying a non-UUID projectId (RAJ-740)', async () => {
    enforceAuth()
    const res = await POST(
      mockRequest({
        headers: withSecret(),
        body: { projectId: "1' OR '1'='1", messages: [] },
      })
    )
    expect(res.status).toBe(400)
  })

  it('rejects malformed message payloads when authorized (RAJ-740)', async () => {
    enforceAuth()
    const { token } = issueProjectToken(VALID_PROJECT_ID)
    const res = await POST(
      mockRequest({
        headers: withSecret({ 'x-project-token': token }),
        body: {
          projectId: VALID_PROJECT_ID,
          messages: [{ sender: 123, message: {}, timestamp: null }],
        },
      })
    )
    expect(res.status).toBe(400)
  })

  it('sets an explicit JSON content-type on the response (RAJ-759)', async () => {
    enforceAuth()
    const { token } = issueProjectToken(VALID_PROJECT_ID)
    const res = await POST(
      mockRequest({
        headers: withSecret({ 'x-project-token': token }),
        body: { projectId: VALID_PROJECT_ID, messages: [] },
      })
    )
    expect(res.headers).toEqual({ 'Content-Type': 'application/json' })
  })
})

describe('RAJ-748 — lib/supabase fails loudly on missing env', () => {
  it('throws when NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are absent', () => {
    jest.resetModules()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(() => require('../../lib/supabase')).toThrow(/Supabase is not configured/)
  })
})
