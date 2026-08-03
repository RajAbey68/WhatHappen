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

const passphrases = new Map<string, string>()
const tokens = new Map<string, { token: string; expiresAt: number }>()

export function setPassphrase(projectId: string, passphrase: string): void {
  passphrases.set(projectId, passphrase)
}

export function getPassphrase(projectId: string): string | undefined {
  return passphrases.get(projectId)
}

export function clearPassphrase(projectId: string): void {
  passphrases.delete(projectId)
  tokens.delete(projectId)
}

export function clearAll(): void {
  passphrases.clear()
  tokens.clear()
}

export function getProjectToken(projectId: string): string | undefined {
  const entry = tokens.get(projectId)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    tokens.delete(projectId)
    return undefined
  }
  return entry.token
}

/**
 * Browser-side sha256 → hex (mirrors the server's `sha256Hex`).
 */
async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * proof = HMAC-SHA256(key = sha256(passphrase) hex string, message = nonce).
 * The raw passphrase never leaves the browser — only this derived proof does,
 * so the zero-knowledge property of the app is preserved (RAJ-747 rework).
 */
export async function computeProof(passphrase: string, nonce: string): Promise<string> {
  const keyHex = await sha256Hex(passphrase)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(nonce))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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
    // 1. Get a single-use, short-TTL nonce.
    const challengeRes = await fetch(
      `/api/auth/challenge?projectId=${encodeURIComponent(projectId)}`
    )
    if (!challengeRes.ok) return undefined
    const { nonce } = await challengeRes.json()
    if (typeof nonce !== 'string') return undefined

    // 2. Prove passphrase knowledge without disclosing the passphrase.
    const proof = await computeProof(passphrase, nonce)

    // 3. Exchange the proof for the 2h HMAC project token.
    const res = await fetch('/api/project-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, nonce, response: proof }),
    })
    if (!res.ok) return undefined
    const data = await res.json()
    if (typeof data?.token !== 'string') return undefined
    tokens.set(projectId, { token: data.token, expiresAt: data.expiresAt ?? Date.now() + 60_000 })
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
