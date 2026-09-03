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

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, challenge, proof } = body || {}

    if (!isValidProjectId(projectId)) {
      return NextResponse.json(
        { error: 'A valid project ID is required' },
        { status: 400, headers: JSON_HEADERS }
      )
    }

    // Fail closed: enforce challenge-response unless explicitly bypassed
    if (!isAuthBypassed()) {
      const configuredHash = getConfiguredPassphraseHash()
      if (!configuredHash) {
        return NextResponse.json(
          { error: 'Passphrase verification is not configured on the server' },
          { status: 401, headers: JSON_HEADERS }
        )
      }

      if (typeof challenge !== 'string' || typeof proof !== 'string' || !challenge || !proof) {
        return NextResponse.json(
          { error: 'Challenge and proof are required to obtain a project token' },
          { status: 401, headers: JSON_HEADERS }
        )
      }

      const isValidChallenge = consumeChallenge(challenge, projectId)
      if (!isValidChallenge) {
        return NextResponse.json(
          { error: 'Invalid or expired challenge' },
          { status: 401, headers: JSON_HEADERS }
        )
      }

      const expectedProof = computeProof(configuredHash, challenge)
      if (!timingSafeEqualStr(proof, expectedProof)) {
        return NextResponse.json(
          { error: 'Invalid passphrase proof' },
          { status: 401, headers: JSON_HEADERS }
        )
      }
    }

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
  } catch (error) {
    console.error('Error generating project token:', error)
    return NextResponse.json(
      { error: 'Failed to generate project token' },
      { status: 500, headers: JSON_HEADERS }
    )
  }
}
