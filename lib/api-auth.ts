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
import { requireAuth } from '@/lib/auth'

/** Default token lifetime: 2 hours. */
export const PROJECT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000

export const PROJECT_TOKEN_HEADER = 'x-project-token'
export const WEBHOOK_SECRET_HEADER = 'x-webhook-secret'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** True when running in a local/dev/test context where auth is intentionally bypassed. */
export function isAuthBypassed(): boolean {
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
 * Authorize a project-scoped request.
 *
 * Accepts, in order:
 *   1. a valid Supabase Bearer JWT (`requireAuth`)
 *   2. a valid short-lived project access token in `x-project-token`
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

  const headerToken = request.headers.get(PROJECT_TOKEN_HEADER)
  if (headerToken && verifyProjectToken(headerToken, projectId)) return null

  if (request.headers.get('authorization')?.startsWith('Bearer ')) {
    const authResult = await requireAuth(request)
    if (authResult instanceof NextResponse) return authResult
    return null
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
