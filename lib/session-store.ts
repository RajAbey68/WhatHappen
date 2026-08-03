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

/** Fetch (and cache) a short-lived project access token from the server. */
export async function ensureProjectToken(projectId: string): Promise<string | undefined> {
  const cached = getProjectToken(projectId)
  if (cached) return cached

  try {
    const res = await fetch('/api/project-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
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
