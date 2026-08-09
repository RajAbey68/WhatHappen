/**
 * RAJ-780 — regression tests for project-scoped authorization.
 *
 * THE BUG
 * -------
 * `requireProjectAccess()` accepted ANY valid Supabase Bearer JWT as
 * authorization for ANY projectId:
 *
 *     if (request.headers.get('authorization')?.startsWith('Bearer ')) {
 *       const authResult = await requireAuth(request)
 *       if (authResult instanceof NextResponse) return authResult
 *       return null            // <-- authorized for every project in the DB
 *     }
 *
 * Supabase projects accept self-service signup by default, so anyone could
 * register an account and then read, mutate or irreversibly delete every
 * project — bypassing the RAJ-747 passphrase proof entirely. Server routes use
 * `getServiceClient()` (service role), which bypasses RLS, so the database's
 * `users_own_projects` policy did not mitigate this on the API path.
 *
 * THE FIX
 * -------
 * The Bearer path now additionally requires `projects.user_id` to match the
 * authenticated user, and returns 403 when it does not.
 *
 * These tests are RED against the previous implementation and GREEN against the
 * fixed one — specifically `bearer JWT from a non-owner is rejected`, which
 * returned `null` (authorized) before the fix.
 */
import crypto from 'crypto'

const PROJECT_OWNED = '11111111-1111-4111-8111-111111111111'
const PROJECT_UNOWNED = '22222222-2222-4222-8222-222222222222'
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STRANGER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

/** Mutable across tests; must be `mock`-prefixed to be usable in a jest factory. */
const mockAuthState: { user: { id: string } | null } = { user: null }

jest.mock('../../lib/auth', () => {
  const { NextResponse } = require('next/server')

  // projectId -> owning user id (null = legacy row with no owner)
  const owners: Record<string, string | null> = {
    '11111111-1111-4111-8111-111111111111': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222': null,
  }

  return {
    requireAuth: jest.fn(async () => {
      if (!mockAuthState.user) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
      }
      return { user: mockAuthState.user }
    }),
    getServiceClient: () => ({
      from: (_table: string) => {
        const filters: Record<string, string> = {}
        const q: any = {
          select: () => q,
          eq: (col: string, val: string) => {
            filters[col] = val
            return q
          },
          maybeSingle: async () => {
            const owner = owners[filters['id']] ?? null
            if (owner !== null && owner === filters['user_id']) {
              return { data: { id: filters['id'] }, error: null }
            }
            return { data: null, error: null }
          },
        }
        return q
      },
    }),
  }
})

import {
  requireProjectAccess,
  issueProjectToken,
  verifyProjectToken,
  hasAnyProjectCredential,
  PROJECT_TOKEN_HEADER,
} from '../../lib/api-auth'

const ORIGINAL_ENV = { ...process.env }

/** Production-like: auth is NOT bypassed. */
function enforceAuth() {
  ;(process.env as any).NODE_ENV = 'production'
  process.env.BYPASS_AUTH = 'false'
  process.env.APP_SESSION_SECRET = 'test-secret-value'
}

const mockRequest = (
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
  method = 'POST'
) => {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    url: 'http://localhost/api/test',
    method,
    headers: {
      get: (k: string) => h.get(k.toLowerCase()) ?? null,
      has: (k: string) => h.has(k.toLowerCase()),
    },
    cookies: {
      get: (k: string) => (k in cookies ? { name: k, value: cookies[k] } : undefined),
    },
  } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthState.user = null
  enforceAuth()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

// -----------------------------------------------------------------------------
describe('RAJ-780 — requireProjectAccess rejects unauthenticated callers', () => {
  it('rejects a request with no credentials at all', async () => {
    const res = await requireProjectAccess(mockRequest(), PROJECT_OWNED)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('rejects a malformed project id with 400', async () => {
    const res = await requireProjectAccess(mockRequest(), 'not-a-uuid')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(400)
  })

  it('rejects a garbage project token', async () => {
    const res = await requireProjectAccess(
      mockRequest({ [PROJECT_TOKEN_HEADER]: 'garbage.token' }),
      PROJECT_OWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })
})

describe('RAJ-780 — passphrase-proven project token', () => {
  it('accepts a valid token for the matching project', async () => {
    const { token } = issueProjectToken(PROJECT_OWNED)
    const res = await requireProjectAccess(
      mockRequest({ [PROJECT_TOKEN_HEADER]: token }),
      PROJECT_OWNED
    )
    expect(res).toBeNull()
  })

  it('accepts a valid httpOnly cookie on a SAFE method (GET)', async () => {
    const { token } = issueProjectToken(PROJECT_OWNED)
    const res = await requireProjectAccess(
      mockRequest({}, { [`project-token-${PROJECT_OWNED}`]: token }, 'GET'),
      PROJECT_OWNED
    )
    expect(res).toBeNull()
  })

  it('CSRF: REJECTS a cookie-only DELETE even though the cookie is valid', async () => {
    // Cookies are ambient credentials. If the cookie alone authorized a DELETE,
    // a page on another origin could destroy a project. The header token is
    // required for any state-changing method.
    const { token } = issueProjectToken(PROJECT_OWNED)
    const res = await requireProjectAccess(
      mockRequest({}, { [`project-token-${PROJECT_OWNED}`]: token }, 'DELETE'),
      PROJECT_OWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('CSRF: REJECTS a cookie-only POST even though the cookie is valid', async () => {
    const { token } = issueProjectToken(PROJECT_OWNED)
    const res = await requireProjectAccess(
      mockRequest({}, { [`project-token-${PROJECT_OWNED}`]: token }, 'POST'),
      PROJECT_OWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('the header token authorizes a state-changing method (cannot be sent cross-site)', async () => {
    const { token } = issueProjectToken(PROJECT_OWNED)
    const res = await requireProjectAccess(
      mockRequest({ [PROJECT_TOKEN_HEADER]: token }, {}, 'DELETE'),
      PROJECT_OWNED
    )
    expect(res).toBeNull()
  })

  it('REJECTS a token minted for a different project (no cross-project reuse)', async () => {
    const { token } = issueProjectToken(PROJECT_UNOWNED)
    const res = await requireProjectAccess(
      mockRequest({ [PROJECT_TOKEN_HEADER]: token }),
      PROJECT_OWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const { token } = issueProjectToken(PROJECT_OWNED, -1000)
    expect(verifyProjectToken(token, PROJECT_OWNED)).toBe(false)
    const res = await requireProjectAccess(
      mockRequest({ [PROJECT_TOKEN_HEADER]: token }),
      PROJECT_OWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('rejects a token whose HMAC was tampered with', async () => {
    const { token } = issueProjectToken(PROJECT_OWNED)
    const [expiry, mac] = token.split('.')
    const flipped = mac.slice(0, -1) + (mac.endsWith('a') ? 'b' : 'a')
    const res = await requireProjectAccess(
      mockRequest({ [PROJECT_TOKEN_HEADER]: `${expiry}.${flipped}` }),
      PROJECT_OWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })
})

describe('RAJ-780 — Bearer JWT no longer bypasses the passphrase gate', () => {
  it('REGRESSION: a valid JWT from a non-owner is rejected with 403', async () => {
    // Before the fix this returned null (fully authorized) for ANY project.
    mockAuthState.user = { id: STRANGER_ID }
    const res = await requireProjectAccess(
      mockRequest({ authorization: 'Bearer valid-jwt-for-a-stranger' }),
      PROJECT_OWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })

  it('REGRESSION: a valid JWT does not unlock a project with no owner', async () => {
    // Every project row currently has user_id NULL, so this is the real-world
    // shape of the attack: sign up, then hit any project you like.
    mockAuthState.user = { id: STRANGER_ID }
    const res = await requireProjectAccess(
      mockRequest({ authorization: 'Bearer valid-jwt' }),
      PROJECT_UNOWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })

  it('accepts a JWT from the user who actually owns the project', async () => {
    mockAuthState.user = { id: OWNER_ID }
    const res = await requireProjectAccess(
      mockRequest({ authorization: 'Bearer valid-jwt-for-owner' }),
      PROJECT_OWNED
    )
    expect(res).toBeNull()
  })

  it('propagates a 401 when the JWT itself is invalid', async () => {
    mockAuthState.user = null
    const res = await requireProjectAccess(
      mockRequest({ authorization: 'Bearer expired-or-forged' }),
      PROJECT_OWNED
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('a valid project token still wins even when a stranger JWT is also present', async () => {
    mockAuthState.user = { id: STRANGER_ID }
    const { token } = issueProjectToken(PROJECT_OWNED)
    const res = await requireProjectAccess(
      mockRequest({
        authorization: 'Bearer valid-jwt-for-a-stranger',
        [PROJECT_TOKEN_HEADER]: token,
      }),
      PROJECT_OWNED
    )
    expect(res).toBeNull()
  })
})

describe('RAJ-780 — hasAnyProjectCredential pre-filter', () => {
  it('is false for a bare request, so body parsing can be skipped', () => {
    expect(hasAnyProjectCredential(mockRequest())).toBe(false)
  })

  it('is true when a project-token header is present (even if invalid)', () => {
    expect(hasAnyProjectCredential(mockRequest({ [PROJECT_TOKEN_HEADER]: 'anything' }))).toBe(true)
  })

  it('is true when a Bearer authorization header is present', () => {
    expect(hasAnyProjectCredential(mockRequest({ authorization: 'Bearer x' }))).toBe(true)
  })

  it('is false for a non-Bearer authorization scheme', () => {
    expect(hasAnyProjectCredential(mockRequest({ authorization: 'Basic abc' }))).toBe(false)
  })

  it('is true when a project-token cookie is present', () => {
    const req = mockRequest()
    req.cookies.getAll = () => [{ name: `project-token-${PROJECT_OWNED}`, value: 'x' }]
    expect(hasAnyProjectCredential(req)).toBe(true)
  })

  it('NEVER stands in for authorization: a bogus token still fails the real check', async () => {
    const req = mockRequest({ [PROJECT_TOKEN_HEADER]: 'bogus' })
    expect(hasAnyProjectCredential(req)).toBe(true)
    const res = await requireProjectAccess(req, PROJECT_OWNED)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })
})

describe('RAJ-780 — token integrity properties', () => {
  it('a token is bound to its project id', () => {
    const { token } = issueProjectToken(PROJECT_OWNED)
    expect(verifyProjectToken(token, PROJECT_OWNED)).toBe(true)
    expect(verifyProjectToken(token, PROJECT_UNOWNED)).toBe(false)
  })

  it('a token cannot be forged without the server secret', () => {
    const expiresAt = Date.now() + 60_000
    const forged = `${expiresAt}.${crypto
      .createHmac('sha256', 'wrong-secret')
      .update(`${PROJECT_OWNED}.${expiresAt}`)
      .digest('hex')}`
    expect(verifyProjectToken(forged, PROJECT_OWNED)).toBe(false)
  })

  it('the expiry segment cannot be extended without invalidating the mac', () => {
    const { token } = issueProjectToken(PROJECT_OWNED)
    const mac = token.split('.')[1]
    const extended = `${Date.now() + 10 * 60 * 1000}.${mac}`
    expect(verifyProjectToken(extended, PROJECT_OWNED)).toBe(false)
  })
})
