/**
 * Route-split regression tests.
 *
 * Design (owner-approved):
 *   /api/process-whatsapp-complete — EXTERNAL webhook. x-webhook-secret MANDATORY
 *                                    (RAJ-739). Unchanged by the split.
 *   /api/process-whatsapp-inapp    — IN-APP browser upload. Requires a valid
 *                                    passphrase-proven x-project-token (RAJ-747).
 *                                    Does NOT accept x-webhook-secret.
 *
 * Both share lib/processWhatsapp.ts so their processing cannot diverge.
 */
const VALID_PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222'

jest.mock('../../lib/auth', () => {
  const makeQuery = () => {
    const q: any = {
      select: jest.fn(() => q),
      eq: jest.fn(() => q),
      order: jest.fn(() => Promise.resolve({ data: [], error: null })),
      single: jest.fn(() => Promise.resolve({ data: { id: 'conv-1' }, error: null })),
      maybeSingle: jest.fn(() =>
        Promise.resolve({ data: { id: '11111111-1111-4111-8111-111111111111' }, error: null })
      ),
      insert: jest.fn(() => q),
      update: jest.fn(() => q),
      then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
    }
    return q
  }
  return {
    getServiceClient: () => ({ from: jest.fn(() => makeQuery()) }),
    requireAuth: jest.fn(),
  }
})

const ORIGINAL_ENV = { ...process.env }

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
    formData: jest.fn().mockResolvedValue(new Map()),
  } as any
}

/** Production-like: auth is NOT bypassed. */
function enforceAuth() {
  ;(process.env as any).NODE_ENV = 'production'
  process.env.BYPASS_AUTH = 'false'
  process.env.APP_SESSION_SECRET = 'test-secret-value'
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  jest.resetModules()
})

describe('/api/process-whatsapp-inapp — token-authenticated in-app route', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { POST } = require('../../app/api/process-whatsapp-inapp/route')

  const jsonBody = { projectId: VALID_PROJECT_ID, messages: [] }

  it('accepts a request with a VALID x-project-token (the in-app upload path)', async () => {
    enforceAuth()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { issueProjectToken } = require('../../lib/api-auth')
    const { token } = issueProjectToken(VALID_PROJECT_ID)

    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json', 'x-project-token': token },
        body: jsonBody,
      })
    )
    expect(res.status).toBe(200)
  })

  it('rejects a request with NO project token with 401', async () => {
    enforceAuth()
    const res = await POST(
      mockRequest({ headers: { 'content-type': 'application/json' }, body: jsonBody })
    )
    expect(res.status).toBe(401)
  })

  it('rejects a token minted for a DIFFERENT project with 401', async () => {
    enforceAuth()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { issueProjectToken } = require('../../lib/api-auth')
    const { token } = issueProjectToken(OTHER_PROJECT_ID)

    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json', 'x-project-token': token },
        body: jsonBody,
      })
    )
    expect(res.status).toBe(401)
  })

  it('rejects a garbage project token with 401', async () => {
    enforceAuth()
    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json', 'x-project-token': '999.deadbeef' },
        body: jsonBody,
      })
    )
    expect(res.status).toBe(401)
  })

  it('does NOT accept the webhook secret in place of a project token (401)', async () => {
    enforceAuth()
    process.env.WHATSAPP_WEBHOOK_SECRET = 'correct-horse-battery'
    const res = await POST(
      mockRequest({
        headers: {
          'content-type': 'application/json',
          'x-webhook-secret': 'correct-horse-battery',
        },
        body: jsonBody,
      })
    )
    expect(res.status).toBe(401)
  })

  it('does NOT require the webhook secret to be configured at all', async () => {
    enforceAuth()
    delete process.env.WHATSAPP_WEBHOOK_SECRET
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { issueProjectToken } = require('../../lib/api-auth')
    const { token } = issueProjectToken(VALID_PROJECT_ID)

    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json', 'x-project-token': token },
        body: jsonBody,
      })
    )
    expect(res.status).toBe(200)
  })

  it('zero-knowledge: a raw passphrase or hash is NOT accepted as auth (401)', async () => {
    enforceAuth()
    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json' },
        body: {
          ...jsonBody,
          passphrase: 'correct horse battery staple',
          passphraseHash: 'a'.repeat(64),
        },
      })
    )
    expect(res.status).toBe(401)
  })

  it('still validates the project id shape for an authorized caller (400)', async () => {
    enforceAuth()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { issueProjectToken } = require('../../lib/api-auth')
    const { token } = issueProjectToken(VALID_PROJECT_ID)

    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json', 'x-project-token': token },
        body: { projectId: 'not-a-uuid', messages: [] },
      })
    )
    expect(res.status).toBe(400)
  })
})

describe('route split — webhook route remains secret-mandatory', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { POST } = require('../../app/api/process-whatsapp-complete/route')

  it('rejects the in-app style call (token only, no secret) with 401', async () => {
    enforceAuth()
    process.env.WHATSAPP_WEBHOOK_SECRET = 'correct-horse-battery'
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { issueProjectToken } = require('../../lib/api-auth')
    const { token } = issueProjectToken(VALID_PROJECT_ID)

    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json', 'x-project-token': token },
        body: { projectId: VALID_PROJECT_ID, messages: [] },
      })
    )
    expect(res.status).toBe(401)
  })

  it('accepts the external webhook call with the CORRECT secret', async () => {
    enforceAuth()
    process.env.WHATSAPP_WEBHOOK_SECRET = 'correct-horse-battery'
    const res = await POST(
      mockRequest({
        headers: {
          'content-type': 'application/json',
          'x-webhook-secret': 'correct-horse-battery',
        },
        body: { projectId: VALID_PROJECT_ID, messages: [] },
      })
    )
    expect(res.status).toBe(200)
  })
})
