/**
 * GET /api/auth/challenge?projectId=<uuid>  (RAJ-747 rework)
 *
 * Issues a single-use, 60s nonce that the client must sign with
 * HMAC-SHA256(sha256(passphrase), nonce) and present to POST /api/project-token.
 *
 * Fails closed when WHATSAPP_PASSPHRASE_HASH is not provisioned.
 */
export const runtime = 'nodejs'
// Reads `request.url` (and issues per-call state), so it must never be
// statically pre-rendered at build time.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { isValidProjectId, isAuthBypassed } from '@/lib/api-auth'
import { RateLimiter } from '@asimov/ingest'
import {
  issueChallenge,
  getConfiguredPassphraseHash,
} from '@/lib/passphrase-proof'

// Rate limit: 20 challenge requests per minute per IP to prevent nonce exhaustion / brute force
const challengeLimiter = new RateLimiter({ capacity: 20, refillPerMinute: 20 })

function clientKeyFor(request: NextRequest): string {
  const headers = (request as { headers?: Headers }).headers
  const forwarded = headers?.get?.('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return headers?.get?.('x-real-ip') || 'unknown'
}

export async function GET(request: NextRequest) {
  try {
    const projectId = new URL(request.url).searchParams.get('projectId')

    if (!isValidProjectId(projectId)) {
      return NextResponse.json(
        { error: 'A valid project ID is required' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!isAuthBypassed() && !challengeLimiter.tryConsume(clientKeyFor(request))) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait and try again.' },
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Fail closed: an unprovisioned server must not hand out challenges that
    // could never be verified (and must not silently degrade to "no auth").
    if (!getConfiguredPassphraseHash() && !isAuthBypassed()) {
      return NextResponse.json(
        { error: 'Passphrase verification is not configured on the server' },
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { nonce, expiresAt } = issueChallenge(projectId)
    return NextResponse.json(
      { nonce, expiresAt },
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error issuing auth challenge:', err)
    return NextResponse.json(
      { error: 'Failed to issue challenge' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
