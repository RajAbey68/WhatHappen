/**
 * Regression tests for the RAJ-739 / RAJ-747 auth-bypass rework.
 *
 * RAJ-739: the webhook shared secret is now MANDATORY on every
 *          /api/process-whatsapp-complete request (previously it was only
 *          checked when the header happened to be present, so omitting the
 *          header bypassed webhook auth entirely).
 * RAJ-747: /api/project-token now requires a server-verified passphrase proof
 *          (HMAC challenge/response) instead of minting tokens for anyone who
 *          knows a project UUID.
 */
import crypto from 'crypto'

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

import {
  computeProof,
  consumeChallenge,
  issueChallenge,
  sha256Hex,
  timingSafeEqualStr,
  _resetChallenges,
} from '../../lib/passphrase-proof'

const PASSPHRASE = 'correct horse battery staple'
const PASSPHRASE_HASH = crypto.createHash('sha256').update(PASSPHRASE, 'utf8').digest('hex')

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

/** Production-like: auth is NOT bypassed, verifier IS provisioned. */
function enforceAuth() {
  ;(process.env as any).NODE_ENV = 'production'
  process.env.BYPASS_AUTH = 'false'
  process.env.APP_SESSION_SECRET = 'test-secret-value'
  process.env.WHATSAPP_PASSPHRASE_HASH = PASSPHRASE_HASH
}

beforeEach(() => {
  jest.clearAllMocks()
  _resetChallenges()
  enforceAuth()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

// -----------------------------------------------------------------------------
describe('RAJ-747 — challenge / proof primitives', () => {
  it('sha256Hex matches node crypto', () => {
    expect(sha256Hex(PASSPHRASE)).toBe(PASSPHRASE_HASH)
  })

  it('computeProof is HMAC-SHA256(passphraseHash, nonce)', () => {
    const nonce = 'deadbeef'
    const expected = crypto
      .createHmac('sha256', PASSPHRASE_HASH)
      .update(nonce, 'utf8')
      .digest('hex')
    expect(computeProof(PASSPHRASE_HASH, nonce)).toBe(expected)
  })

  it('a proof from the wrong passphrase does not match', () => {
    const nonce = 'deadbeef'
    const wrongHash = sha256Hex('not the passphrase')
    expect(computeProof(wrongHash, nonce)).not.toBe(computeProof(PASSPHRASE_HASH, nonce))
  })

  it('timingSafeEqualStr handles mismatched lengths and non-strings', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualStr(null, 'abc')).toBe(false)
    expect(timingSafeEqualStr(undefined, undefined)).toBe(false)
  })

  it('a valid challenge token is accepted', () => {
    const { nonce } = issueChallenge(VALID_PROJECT_ID)
    expect(consumeChallenge(nonce, VALID_PROJECT_ID)).toBe(true)
  })

  it('a nonce is bound to the project it was issued for', () => {
    const { nonce } = issueChallenge(VALID_PROJECT_ID)
    expect(consumeChallenge(nonce, OTHER_PROJECT_ID)).toBe(false)
  })

  it('an expired nonce is rejected', () => {
    const { nonce } = issueChallenge(VALID_PROJECT_ID, -1000)
    expect(consumeChallenge(nonce, VALID_PROJECT_ID)).toBe(false)
  })

  it('an unknown nonce is rejected', () => {
    expect(consumeChallenge('never-issued', VALID_PROJECT_ID)).toBe(false)
    expect(consumeChallenge(undefined, VALID_PROJECT_ID)).toBe(false)
  })
})

// -----------------------------------------------------------------------------
describe('RAJ-747 — GET /api/auth/challenge', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GET } = require('../../app/api/auth/challenge/route')

  it('rejects a non-UUID projectId with 400', async () => {
    enforceAuth()
    const res = await GET(
      mockRequest({ url: 'http://localhost/api/auth/challenge?projectId=nope', method: 'GET' })
    )
    expect(res.status).toBe(400)
  })

  it('fails closed with 401 when WHATSAPP_PASSPHRASE_HASH is unset', async () => {
    enforceAuth()
    delete process.env.WHATSAPP_PASSPHRASE_HASH
    const res = await GET(
      mockRequest({
        url: `http://localhost/api/auth/challenge?projectId=${VALID_PROJECT_ID}`,
        method: 'GET',
      })
    )
    expect(res.status).toBe(401)
  })

  it('issues a nonce for a valid project when provisioned', async () => {
    enforceAuth()
    const res = await GET(
      mockRequest({
        url: `http://localhost/api/auth/challenge?projectId=${VALID_PROJECT_ID}`,
        method: 'GET',
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.nonce).toBe('string')
    expect(body.nonce.length).toBeGreaterThan(16)
  })
})

// -----------------------------------------------------------------------------
describe('RAJ-747 — POST /api/project-token requires a passphrase proof', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { POST } = require('../../app/api/project-token/route')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GET: CHALLENGE } = require('../../app/api/auth/challenge/route')

  const getNonce = async (projectId = VALID_PROJECT_ID) => {
    const res = await CHALLENGE(
      mockRequest({
        url: `http://localhost/api/auth/challenge?projectId=${projectId}`,
        method: 'GET',
      })
    )
    const body = await res.json()
    return body.nonce as string
  }

  it('rejects an UNAUTHENTICATED mint (no proof at all) with 401', async () => {
    enforceAuth()
    const res = await POST(mockRequest({ body: { projectId: VALID_PROJECT_ID } }))
    expect(res.status).toBe(401)
  })

  it('rejects a WRONG proof with 401', async () => {
    enforceAuth()
    const nonce = await getNonce()
    const wrongProof = computeProof(sha256Hex('wrong passphrase'), nonce)
    const res = await POST(
      mockRequest({ body: { projectId: VALID_PROJECT_ID, nonce, response: wrongProof } })
    )
    expect(res.status).toBe(401)
  })

  it('rejects a valid proof against an unknown/forged nonce with 401', async () => {
    enforceAuth()
    const forged = 'a'.repeat(64)
    const res = await POST(
      mockRequest({
        body: {
          projectId: VALID_PROJECT_ID,
          nonce: forged,
          response: computeProof(PASSPHRASE_HASH, forged),
        },
      })
    )
    expect(res.status).toBe(401)
  })

  it('rejects a nonce issued for a different project with 401', async () => {
    enforceAuth()
    const nonce = await getNonce() // issued for VALID_PROJECT_ID
    const proof = computeProof(PASSPHRASE_HASH, nonce)
    const res = await POST(
      mockRequest({ body: { projectId: OTHER_PROJECT_ID, nonce, response: proof } })
    )
    expect(res.status).toBe(401)
  })

  it('fails closed with 401 when WHATSAPP_PASSPHRASE_HASH is unset', async () => {
    enforceAuth()
    delete process.env.WHATSAPP_PASSPHRASE_HASH
    const res = await POST(
      mockRequest({
        body: { projectId: VALID_PROJECT_ID, nonce: 'x', response: 'y' },
      })
    )
    expect(res.status).toBe(401)
  })

  it('mints a token for a VALID proof', async () => {
    enforceAuth()
    const nonce = await getNonce()
    const proof = computeProof(PASSPHRASE_HASH, nonce)
    const res = await POST(
      mockRequest({ body: { projectId: VALID_PROJECT_ID, nonce, response: proof } })
    )
    const body = await res.json()
    expect(typeof body.token).toBe('string')
    expect(body.token).toContain('.')

    // The minted token must actually authorize this project.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { verifyProjectToken } = require('../../lib/api-auth')
    expect(verifyProjectToken(body.token, VALID_PROJECT_ID)).toBe(true)
    expect(verifyProjectToken(body.token, OTHER_PROJECT_ID)).toBe(false)
  })
})

// -----------------------------------------------------------------------------
describe('RAJ-739 — webhook secret is mandatory on /api/process-whatsapp-complete', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { POST } = require('../../app/api/process-whatsapp-complete/route')

  it('rejects a request with NO x-webhook-secret header with 401 (the bypass)', async () => {
    enforceAuth()
    process.env.WHATSAPP_WEBHOOK_SECRET = 'correct-horse-battery'
    const res = await POST(
      mockRequest({
        headers: { 'content-type': 'application/json' },
        body: { projectId: VALID_PROJECT_ID, messages: [] },
      })
    )
    expect(res.status).toBe(401)
  })

  it('rejects even a token-bearing request when the webhook secret is absent', async () => {
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

  it('fails closed with 401 when WHATSAPP_WEBHOOK_SECRET is unset on the server', async () => {
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

  it('accepts a request carrying the CORRECT x-webhook-secret', async () => {
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
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(400)
  })
})
