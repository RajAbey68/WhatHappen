/**
 * POST /api/project-token — issue a short-lived, HMAC-signed project access
 * token, but ONLY to a caller who has proven knowledge of the project
 * passphrase (RAJ-747 rework).
 *
 * PREVIOUS BUG: this endpoint minted a token for any caller who knew a project
 * UUID. Project UUIDs are not secrets, so the token proved nothing and every
 * downstream route that trusted `x-project-token` was effectively open.
 *
 * NOW: challenge/response.
 *   1. Client calls GET /api/auth/challenge?projectId=<uuid> → { nonce }.
 *   2. Client computes response = HMAC-SHA256(sha256(passphrase), nonce)
 *      with Web Crypto — the raw passphrase never leaves the browser, so the
 *      zero-knowledge property is preserved.
 *   3. This route recomputes the same HMAC using the server-provisioned
 *      WHATSAPP_PASSPHRASE_HASH env var and compares timing-safely.
 *
 * *** REQUIRES ENV VAR `WHATSAPP_PASSPHRASE_HASH` (hex sha256 of the project
 *     passphrase). Fails closed with 401 when it is missing. ***
 *
 * The token is returned in the body (for the `x-project-token` header) and also
 * set as an httpOnly cookie so it is not readable by injected script (RAJ-746).
 */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { RateLimiter } from '@asimov/ingest'
import {
  isValidProjectId,
  issueProjectToken,
  isAuthBypassed,
  PROJECT_TOKEN_TTL_MS,
} from '@/lib/api-auth'
import {
  computeProof,
  consumeChallenge,
  getConfiguredPassphraseHash,
  timingSafeEqualStr,
} from '@/lib/passphrase-proof'

// Rate limit token minting to prevent brute-forcing HMAC proofs: 10 attempts per minute per IP
const projectTokenLimiter = new RateLimiter({ capacity: 10, refillPerMinute: 10 })

function clientKeyFor(request: NextRequest): string {
  const headers = (request as { headers?: Headers }).headers
  const forwarded = headers?.get?.('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return headers?.get?.('x-real-ip') || 'unknown'
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const unauthorized = () =>
  NextResponse.json(
    { error: 'Unauthorized: invalid or missing passphrase proof' },
    { status: 401, headers: JSON_HEADERS }
  )

export async function POST(request: NextRequest) {
  try {
    const { projectId, nonce, response: proof } = await request.json()

    if (!isValidProjectId(projectId)) {
      return NextResponse.json(
        { error: 'A valid project ID is required' },
        { status: 400, headers: JSON_HEADERS }
      )
    }

    if (!isAuthBypassed() && !projectTokenLimiter.tryConsume(clientKeyFor(request))) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait and try again.' },
        { status: 429, headers: JSON_HEADERS }
      )
    }

    // ---- Passphrase proof gate (fail closed) --------------------------------
    const passphraseHash = getConfiguredPassphraseHash()
    if (!passphraseHash) {
      // Local dev/test may run without a provisioned verifier; production
      // must not.
      if (!isAuthBypassed()) return unauthorized()
    } else {
      if (typeof proof !== 'string' || proof.length === 0) return unauthorized()
      // Single-use + TTL + project binding all enforced here.
      if (!consumeChallenge(nonce, projectId)) return unauthorized()
      const expected = computeProof(passphraseHash, nonce as string)
      if (!timingSafeEqualStr(proof.toLowerCase(), expected)) return unauthorized()
    }
    // -------------------------------------------------------------------------

    // The project must exist before we mint a token for it.
    const supabase = getServiceClient()
    const { data: project, error } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()

    if (error) throw error
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404, headers: JSON_HEADERS }
      )
    }

    const { token, expiresAt } = issueProjectToken(projectId)

    const response = NextResponse.json({ token, expiresAt }, { headers: JSON_HEADERS })

    // httpOnly so XSS cannot read it; short-lived so theft has a bounded window.
    response.cookies?.set?.(`project-token-${projectId}`, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor(PROJECT_TOKEN_TTL_MS / 1000),
    })

    return response
  } catch (err) {
    console.error('Error issuing project token:', err)
    return NextResponse.json(
      { error: 'Failed to issue project token' },
      { status: 500, headers: JSON_HEADERS }
    )
  }
}
