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
 *   2. `GET /api/auth/challenge?projectId=<uuid>` issues a single-use nonce
 *      with a 60s TTL.
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

/** Nonce lifetime: deliberately short so a captured challenge is near-useless. */
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
// Single-use nonce store.
//
// In-memory Map: adequate for a single-instance deployment and for the 60s
// window. On a multi-instance deployment this should move to Redis / a signed
// stateless JWT challenge; the interface below is the seam for that change.
// -----------------------------------------------------------------------------
interface ChallengeEntry {
  projectId: string
  expiresAt: number
}

const challenges = new Map<string, ChallengeEntry>()

function sweep(now: number): void {
  challenges.forEach((entry, nonce) => {
    if (entry.expiresAt <= now) challenges.delete(nonce)
  })
}

export function issueChallenge(
  projectId: string,
  ttlMs: number = CHALLENGE_TTL_MS
): { nonce: string; expiresAt: number } {
  const now = Date.now()
  sweep(now)
  const nonce = crypto.randomBytes(32).toString('hex')
  const expiresAt = now + ttlMs
  challenges.set(nonce, { projectId, expiresAt })
  return { nonce, expiresAt }
}

/**
 * Consume a nonce: valid exactly once, for the project it was issued to, and
 * only before it expires. Returns false for unknown/replayed/expired/mismatched.
 */
export function consumeChallenge(nonce: unknown, projectId: string): boolean {
  if (typeof nonce !== 'string' || nonce.length === 0) return false
  const entry = challenges.get(nonce)
  if (!entry) return false
  // Single-use: delete on first lookup regardless of outcome (no replay).
  challenges.delete(nonce)
  if (entry.expiresAt <= Date.now()) return false
  return entry.projectId === projectId
}

/** Test/maintenance helper. */
export function _resetChallenges(): void {
  challenges.clear()
}
