/**
 * RAJ-780 follow-up — found by the z.ai/GLM-4.6 four-eyes swarm (2026-08-09).
 *
 * lib/api-auth.ts was hardened so that isAuthBypassed() returns false in
 * production. lib/auth.ts has its OWN, separate bypass that was never touched:
 *
 *   if (NODE_ENV === 'development' || BYPASS_AUTH === 'true') return devUser
 *
 * BYPASS_AUTH=true therefore still minted a synthetic authenticated user in
 * production. Nothing sets that variable on Cloud Run today, so this was not
 * live — but one env var away from a full authentication bypass on every route
 * that calls requireAuth directly (/api/sessions, /api/ai-search).
 *
 * Production must never bypass, whatever the flags say.
 */
import { NextRequest, NextResponse } from 'next/server'

const ORIGINAL_ENV = process.env.NODE_ENV
const ORIGINAL_BYPASS = process.env.BYPASS_AUTH

const setNodeEnv = (value: string) => {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
  })
}

const makeRequest = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/sessions', { headers })

describe('lib/auth requireAuth — production must not honour bypass flags', () => {
  afterEach(() => {
    setNodeEnv(ORIGINAL_ENV as string)
    if (ORIGINAL_BYPASS === undefined) delete process.env.BYPASS_AUTH
    else process.env.BYPASS_AUTH = ORIGINAL_BYPASS
    jest.resetModules()
  })

  it('rejects an unauthenticated request in production even when BYPASS_AUTH=true', async () => {
    setNodeEnv('production')
    process.env.BYPASS_AUTH = 'true'
    jest.resetModules()

    const { requireAuth } = await import('@/lib/auth')
    const result = await requireAuth(makeRequest())

    // Assert on shape, not `instanceof`: NextResponse identity does not survive
    // duplicate module copies (vendor/), which bit us earlier on this branch.
    expect((result as { user?: unknown }).user).toBeUndefined()
    expect((result as unknown as { status: number }).status).toBe(401)
  })

  it('does not mint the synthetic dev user in production', async () => {
    setNodeEnv('production')
    process.env.BYPASS_AUTH = 'true'
    jest.resetModules()

    const { requireAuth } = await import('@/lib/auth')
    const result = await requireAuth(makeRequest())

    // The synthetic user is the all-zero uuid; it must never be handed out here.
    expect(JSON.stringify(result)).not.toContain('00000000-0000-0000-0000-000000000000')
  })

  it('still bypasses in development, so local work is unaffected', async () => {
    setNodeEnv('development')
    delete process.env.BYPASS_AUTH
    jest.resetModules()

    const { requireAuth } = await import('@/lib/auth')
    const result = await requireAuth(makeRequest())

    expect((result as unknown as { status?: number }).status).toBeUndefined()
    expect((result as { user: { id: string } }).user.id).toBe(
      '00000000-0000-0000-0000-000000000000'
    )
  })
})
