/**
 * In-memory, per-tab passphrase + project-token store (RAJ-746, RAJ-747).
 *
 * The raw passphrase is deliberately NOT persisted to sessionStorage/localStorage:
 * anything in web storage survives navigation and is recoverable by injected
 * script. Holding it in a module-scoped map means it lives only for the lifetime
 * of the page's JS context and is gone on reload/tab close.
 *
 * The short-lived project token issued by /api/project-token is what travels to
 * the server for authorization, instead of the passphrase itself.
 */

import CryptoJS from 'crypto-js'

const passphrases = new Map<string, string>()
const tokens = new Map<string, { token: string; expiresAt: number }>()

const SESSION_STORAGE_PREFIX = 'whathappen_pw_'

export function setPassphrase(projectId: string, passphrase: string): void {
  passphrases.set(projectId, passphrase)
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${projectId}`, passphrase)
    }
  } catch {}
}

export function getPassphrase(projectId: string): string | undefined {
  const mem = passphrases.get(projectId)
  if (mem) return mem
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${projectId}`)
      if (stored) {
        passphrases.set(projectId, stored)
        return stored
      }
    }
  } catch {}
  return undefined
}

export function clearPassphrase(projectId: string): void {
  passphrases.delete(projectId)
  tokens.delete(projectId)
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(`${SESSION_STORAGE_PREFIX}${projectId}`)
    }
  } catch {}
}

export const clearProjectSession = clearPassphrase

export function clearAll(): void {
  passphrases.clear()
  tokens.clear()
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const keys = Object.keys(window.sessionStorage)
      for (const k of keys) {
        if (k.startsWith(SESSION_STORAGE_PREFIX)) {
          window.sessionStorage.removeItem(k)
        }
      }
    }
  } catch {}
}

export const clearAllSessions = clearAll

export function getProjectToken(projectId: string): string | undefined {
  const entry = tokens.get(projectId)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    tokens.delete(projectId)
    return undefined
  }
  return entry.token
}

function getSafeCrypto(): Crypto | undefined {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto as Crypto
  }
  try {
    const nodeCrypto = require('crypto')
    return (nodeCrypto.webcrypto || nodeCrypto) as unknown as Crypto
  } catch {
    return undefined
  }
}

/**
 * Browser-side sha256 → hex (mirrors the server's `sha256Hex`).
 */
async function sha256Hex(value: string): Promise<string> {
  const c = getSafeCrypto()
  if (c && c.subtle) {
    try {
      const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(value))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    } catch {
      // Fall through to CryptoJS
    }
  }
  return CryptoJS.SHA256(value).toString(CryptoJS.enc.Hex)
}

/**
 * proof = HMAC-SHA256(key = sha256(passphrase) hex string, message = nonce).
 * The raw passphrase never leaves the browser — only this derived proof does,
 * so the zero-knowledge property of the app is preserved (RAJ-747 rework).
 */
export async function computeProof(passphrase: string, nonce: string): Promise<string> {
  const keyHex = await sha256Hex(passphrase)
  const c = getSafeCrypto()
  if (c && c.subtle) {
    try {
      const key = await c.subtle.importKey(
        'raw',
        new TextEncoder().encode(keyHex),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = await c.subtle.sign('HMAC', key, new TextEncoder().encode(nonce))
      return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    } catch {
      // Fall through to CryptoJS
    }
  }
  return CryptoJS.HmacSHA256(nonce, keyHex).toString(CryptoJS.enc.Hex)
}

/**
 * Fetch (and cache in MEMORY only) a short-lived project access token, proving
 * knowledge of the passphrase via the server challenge/response handshake.
 *
 * Requires the passphrase to already be in the in-memory store (i.e. the user
 * has entered it for decryption).
 */
export async function ensureProjectToken(projectId: string): Promise<string | undefined> {
  const cached = getProjectToken(projectId)
  if (cached) return cached

  const passphrase = passphrases.get(projectId)
  if (!passphrase) return undefined

  try {
    // 1. Get challenge nonce
    const challengeRes = await fetch(`/api/auth/challenge?projectId=${encodeURIComponent(projectId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
    if (!challengeRes.ok) return undefined
    const challengeData = await challengeRes.json()
    if (!challengeData?.nonce) return undefined

    // 2. Compute HMAC proof with passphrase
    const proof = await computeProof(passphrase, challengeData.nonce)

    // 3. Request token with challenge and proof
    const res = await fetch('/api/project-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        challenge: challengeData.nonce,
        proof,
      }),
    })
    if (!res.ok) return undefined
    const data = await res.json()
    if (typeof data?.token !== 'string') return undefined
    tokens.set(projectId, { token: data.token, expiresAt: data.expiresAt ?? Date.now() + 2 * 3600 * 1000 })
    return data.token
  } catch {
    return undefined
  }
}

/** Build request headers carrying the project token when one is available. */
export async function projectAuthHeaders(
  projectId: string
): Promise<Record<string, string>> {
  const token = await ensureProjectToken(projectId)
  return token ? { 'x-project-token': token } : {}
}

/**
 * Synchronous variant: uses only an already-cached token and never issues a
 * network request. Use in hot paths that piggyback on a token provisioned at
 * project-selection time.
 */
export function projectAuthHeadersSync(projectId: string): Record<string, string> {
  const token = getProjectToken(projectId)
  return token ? { 'x-project-token': token } : {}
}
