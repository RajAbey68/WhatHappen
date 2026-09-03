/**
 * Server-side passphrase-proof primitives (RAJ-747 rework).
 *
 * THREAT MODEL
 * ------------
 * WhatHappen is zero-knowledge: the passphrase is the client-side AES-GCM
 * decryption key and MUST NOT be sent to the server. Before this rework the
 * `/api/project-token` endpoint minted a project token for ANY caller who knew
 * a project UUID, which meant the token was not evidence of anything and the
 * whole authorization model collapsed.
 *
 * FIX: challenge/response proof of passphrase knowledge.
 *
 *   1. Operator provisions `WHATSAPP_PASSPHRASE_HASH` = sha256(passphrase), hex.
 *      This is derived from the SAME passphrase the client types for decryption.
 *      It is a verifier, not the passphrase: the server still cannot decrypt
 *      any chat content with it, so zero-knowledge of the plaintext is kept.
 *
 *      *** NEW REQUIRED ENV VAR — must be provisioned before deploy. ***
 *      Generate with:  printf '%s' "$PASSPHRASE" | shasum -a 256
 *
 *   2. `GET /api/auth/challenge?projectId=<uuid>` issues a stateless signed
 *      challenge token (no server-side state — works on Vercel serverless).
 *
 *   3. `POST /api/project-token` receives
 *      response = HMAC-SHA256(key = WHATSAPP_PASSPHRASE_HASH, msg = nonce)
 *      and compares it timing-safely against its own computation.
 *
 * Fails CLOSED: if `WHATSAPP_PASSPHRASE_HASH` is unset, no challenge is issued
 * and no token is minted (401), except in an explicitly bypassed local/dev
 * context (see `isAuthBypassed`).
 */
import crypto from 'crypto'

/** Challenge token lifetime: deliberately short so a captured challenge is near-useless. */
export const CHALLENGE_TTL_MS = 60_000

/** Hex sha256 of an arbitrary string (mirrors the client's Web Crypto digest). */
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * The canonical proof value for a nonce.
 * key = the sha256 hex digest of the passphrase; message = the nonce.
 */
export function computeProof(passphraseHashHex: string, nonce: string): string {
  return crypto.createHmac('sha256', passphraseHashHex).update(nonce, 'utf8').digest('hex')
}

/** Configured verifier, or null when the server has not been provisioned. */
export function getConfiguredPassphraseHash(): string | null {
  const v = process.env.WHATSAPP_PASSPHRASE_HASH
  if (!v || typeof v !== 'string' || v.trim() === '') return null
  return v.trim().toLowerCase()
}

/** Constant-time string comparison that never throws on length mismatch. */
export function timingSafeEqualStr(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

// -----------------------------------------------------------------------------
// Stateless challenge token (RAJ-747 production fix).
//
// Previously an in-memory Map — which fails on Vercel serverless when the
// challenge GET and token POST hit different instances. Now the challenge is
// a self-contained signed token: the nonce IS the token, no server-side state
// needed. Tamper-proof via HMAC-SHA256 keyed on WHATSAPP_PASSPHRASE_HASH.
// -----------------------------------------------------------------------------

interface ChallengePayload {
  nonce: string
  projectId: string
  expiresAt: number
}

/**
 * Sign a challenge payload using the passphrase hash as the HMAC key.
 * Returns a compact token: base64url(payload).base64url(signature).
 */
function signChallenge(payload: ChallengePayload): string {
  const key = getConfiguredPassphraseHash()
  if (!key) throw new Error('WHATSAPP_PASSPHRASE_HASH not configured')

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64url')
  const sig = crypto.createHmac('sha256', key)
    .update(payloadB64, 'utf8')
    .digest('base64url')

  return `${payloadB64}.${sig}`
}

/**
 * Verify a challenge token's signature and expiry. Returns the payload if
 * valid, or null if tampered, expired, or signed with a different key.
 */
function verifyChallenge(token: string): ChallengePayload | null {
  const key = getConfiguredPassphraseHash()
  if (!key) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadB64, sig] = parts
  const expectedSig = crypto.createHmac('sha256', key)
    .update(payloadB64, 'utf8')
    .digest('base64url')

  if (!timingSafeEqualStr(sig, expectedSig)) return null

  try {
    const payload: ChallengePayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    )
    if (payload.expiresAt <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// In-memory single-use consumed nonce store with TTL pruning
const consumedNonces = new Map<string, number>()

function pruneExpiredNonces(): void {
  const now = Date.now()
  consumedNonces.forEach((expiresAt, nonce) => {
    if (expiresAt <= now) {
      consumedNonces.delete(nonce)
    }
  })
}

/**
 * Issue a stateless challenge: returns a signed token that encodes the nonce,
 * project ID, and expiry.
 */
export function issueChallenge(
  projectId: string,
  ttlMs: number = CHALLENGE_TTL_MS
): { nonce: string; expiresAt: number } {
  const nonce = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + ttlMs

  // The nonce is also the challenge token — self-contained and signed.
  const token = signChallenge({ nonce, projectId, expiresAt })

  return { nonce: token, expiresAt }
}

/**
 * Consume a challenge: verifies the token signature, checks expiry,
 * confirms project binding, and atomically enforces single-use consumption.
 * Returns false for tampered, expired, mismatched, or already-consumed tokens.
 */
export function consumeChallenge(token: unknown, projectId: string): boolean {
  if (typeof token !== 'string' || token.length === 0) return false

  const payload = verifyChallenge(token)
  if (!payload) return false

  if (payload.projectId !== projectId) return false

  // Replay protection: enforce single-use consumption
  if (consumedNonces.has(payload.nonce)) {
    return false
  }

  pruneExpiredNonces()
  consumedNonces.set(payload.nonce, payload.expiresAt)

  return true
}

/** Test helper — resets the in-memory consumed nonces store. */
export function _resetChallenges(): void {
  consumedNonces.clear()
}
