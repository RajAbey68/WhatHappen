/**
 * Server-side authorization helpers for project-scoped API routes.
 *
 * The app uses a client-side passphrase gate (see app/page.tsx). Historically the
 * raw passphrase was posted to the server and routes performed no authorization at
 * all. These helpers add a server-verified, short-lived project access token so
 * routes can authorize a caller WITHOUT the raw passphrase being sent on every
 * request.
 *
 * Token format: `<expiryEpochMs>.<hex hmac-sha256(projectId + '.' + expiry)>`
 */
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServiceClient } from '@/lib/auth'

/** Default token lifetime: 2 hours. */
export const PROJECT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000

export const PROJECT_TOKEN_HEADER = 'x-project-token'
export const WEBHOOK_SECRET_HEADER = 'x-webhook-secret'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * True when running in a local/dev/test context where auth is intentionally
 * bypassed.
 *
 * RAJ-780: `BYPASS_AUTH` is deliberately NOT honoured in production. It was
 * previously an unconditional master off-switch — a single mis-set environment
 * variable on Cloud Run disabled authorization on every route at once. A
 * developer convenience must not be reachable from a production config.
 */
export function isAuthBypassed(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    process.env.BYPASS_AUTH === 'true'
  )
}

function getSecret(): string {
  const secret =
    process.env.APP_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error(
      'APP_SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to issue project access tokens'
    )
  }
  return secret
}

/** Validate that a value is a well-formed project UUID. */
export function isValidProjectId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function issueProjectToken(
  projectId: string,
  ttlMs: number = PROJECT_TOKEN_TTL_MS
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + ttlMs
  const mac = crypto
    .createHmac('sha256', getSecret())
    .update(`${projectId}.${expiresAt}`)
    .digest('hex')
  return { token: `${expiresAt}.${mac}`, expiresAt }
}

export function verifyProjectToken(
  token: unknown,
  projectId: string
): boolean {
  if (typeof token !== 'string' || !token.includes('.')) return false
  const idx = token.indexOf('.')
  const expiryPart = token.slice(0, idx)
  const mac = token.slice(idx + 1)

  const expiresAt = Number(expiryPart)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false

  let expected: string
  try {
    expected = crypto
      .createHmac('sha256', getSecret())
      .update(`${projectId}.${expiresAt}`)
      .digest('hex')
  } catch {
    return false
  }

  const a = Buffer.from(mac, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Cheap pre-filter: does this request carry ANY credential worth evaluating?
 *
 * Routes that take `projectId` from the JSON body cannot call
 * `requireProjectAccess` until the body has been parsed — which means an
 * unauthenticated caller can make the server parse an arbitrarily large payload
 * before being rejected. Calling this first lets those routes reject
 * credential-less requests BEFORE `await request.json()`, without changing the
 * real authorization decision (which still runs afterwards).
 *
 * Deliberately permissive: it checks only for the PRESENCE of a credential, never
 * its validity. It must never be used as the authorization decision itself.
 */
export function hasAnyProjectCredential(request: NextRequest): boolean {
  if (isAuthBypassed()) return true
  if (request.headers.get(PROJECT_TOKEN_HEADER)) return true
  if (request.headers.get('authorization')?.startsWith('Bearer ')) return true
  try {
    const all = request.cookies?.getAll?.() ?? []
    return all.some(
      (c: { name?: string }) => typeof c?.name === 'string' && c.name.startsWith('project-token-')
    )
  } catch {
    return false
  }
}

/** Standard 401 for a request carrying no usable credential at all. */
export function missingCredentialResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized: missing or invalid project access token' },
    { status: 401 }
  )
}

/**
 * Does this Supabase user own this project?
 *
 * RAJ-780: `projects.user_id` exists in the live database and is the column the
 * `users_own_projects` RLS policy keys on. Every server route uses
 * `getServiceClient()` (service role), which BYPASSES RLS — so that policy
 * provides no protection on the API path and ownership must be checked in code.
 *
 * Note: `projects.user_id` is nullable and the create path does not yet populate
 * it, so unowned (legacy) projects deliberately return `false` here. That is the
 * fail-closed direction: a Bearer JWT alone must never unlock a project.
 */
export async function userOwnsProject(
  userId: string,
  projectId: string
): Promise<boolean> {
  try {
    const { data, error } = await getServiceClient()
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return false
    return Boolean(data)
  } catch {
    return false
  }
}

/**
 * Authorize a project-scoped request.
 *
 * Accepts, in order:
 *   1. a valid short-lived project access token (`x-project-token` header, or the
 *      httpOnly cookie set alongside it) — proof the caller knew the passphrase.
 *   2. a valid Supabase Bearer JWT **whose user actually owns the project**.
 *
 * RAJ-780 (security fix): previously ANY valid Supabase JWT returned `null` here
 * for ANY projectId. Because Supabase projects accept self-service signup by
 * default, that let anyone register an account and then read, mutate or delete
 * every project in the database — completely bypassing the RAJ-747 passphrase
 * proof that the rest of this module exists to enforce. The JWT path now
 * additionally requires a project-ownership match and returns 403 when it fails.
 *
 * Returns `null` when authorized, or a NextResponse error to return to the caller.
 */
export async function requireProjectAccess(
  request: NextRequest,
  projectId: unknown
): Promise<NextResponse | null> {
  if (!isValidProjectId(projectId)) {
    return NextResponse.json(
      { error: 'A valid project ID is required' },
      { status: 400 }
    )
  }

  if (isAuthBypassed()) return null

  // 1a. Passphrase-proven project token in the request HEADER.
  //
  // A custom header cannot be attached by a cross-site form or image request —
  // sending one forces a CORS preflight — so the header path is inherently
  // CSRF-safe and is accepted for every HTTP method.
  const headerToken = request.headers.get(PROJECT_TOKEN_HEADER)
  if (headerToken && verifyProjectToken(headerToken, projectId)) return null

  // 1b. Same token from the httpOnly cookie — SAFE METHODS ONLY.
  //
  // Cookies are ambient: the browser attaches them automatically. Accepting one
  // as authorization for a state-changing request is the textbook CSRF setup —
  // a page on another origin could trigger DELETE /api/projects/<id> or the GCS
  // media purge and the browser would supply the credential. `sameSite: 'strict'`
  // on the cookie already blocks that in current browsers, but relying on a
  // single cookie attribute as the only barrier to an irreversible delete on a
  // legal-evidence system is too thin. The client always sends the header token
  // (lib/session-store.ts), so restricting the cookie to read-only methods costs
  // nothing and removes the class of bug entirely.
  const method = (request.method || 'GET').toUpperCase()
  const isSafeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  if (isSafeMethod) {
    const cookieToken = request.cookies?.get?.(`project-token-${projectId}`)?.value
    if (cookieToken && verifyProjectToken(cookieToken, projectId)) return null
  }

  // 2. Bearer JWT — only for a user who owns this specific project.
  if (request.headers.get('authorization')?.startsWith('Bearer ')) {
    const authResult = await requireAuth(request)
    if (authResult instanceof NextResponse) return authResult

    // Fail closed rather than trusting the shape of `authResult`. `instanceof`
    // is the only thing distinguishing "error response" from "authenticated
    // user" above, and it silently degrades whenever two copies of next/server
    // are loaded (module duplication, test harnesses, bundler edge cases). If we
    // cannot positively identify a user id, deny.
    const userId = (authResult as { user?: { id?: string } })?.user?.id
    if (typeof userId !== 'string' || userId.length === 0) {
      return NextResponse.json(
        { error: 'Unauthorized: could not establish an authenticated user' },
        { status: 401 }
      )
    }

    if (await userOwnsProject(userId, projectId)) return null
    return NextResponse.json(
      { error: 'Forbidden: you do not have access to this project' },
      { status: 403 }
    )
  }

  return NextResponse.json(
    { error: 'Unauthorized: missing or invalid project access token' },
    { status: 401 }
  )
}

/**
 * Authorize a server-to-server webhook call using a shared secret.
 * Returns `null` when authorized, or a NextResponse error.
 */
export function verifyWebhookSecret(request: NextRequest): NextResponse | null {
  const configured = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!configured) {
    return NextResponse.json(
      { error: 'Webhook secret is not configured on the server' },
      { status: 401 }
    )
  }
  const provided = request.headers.get(WEBHOOK_SECRET_HEADER) || ''
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(configured, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }
  return null
}

/**
 * Safely parse a client-supplied timestamp into an ISO string.
 * Returns null for missing/malformed/out-of-range values instead of producing
 * "Invalid Date" or throwing (RAJ-745).
 */
export function safeParseTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof value !== 'string' || value.trim() === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
