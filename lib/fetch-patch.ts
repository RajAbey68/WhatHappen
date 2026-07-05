import { supabaseBrowser } from '@/lib/supabase-browser'

/**
 * Attaches the Supabase access token to same-origin /api requests.
 *
 * Runs at MODULE LOAD (the first time this is imported on the client), before
 * any React component mounts — so a child component's onMount fetch is already
 * intercepted. (Patching inside a useEffect would install too late: child
 * effects run before parent effects.) Guarded so Fast Refresh / repeated
 * imports can't wrap the wrapper and blow the stack.
 *
 * The token is ONLY added to our own origin's /api paths — never to a
 * third-party URL that merely contains "/api/", which would leak the JWT.
 */

declare global {
  interface Window {
    __whFetchPatched?: boolean
    __whOriginalFetch?: typeof window.fetch
  }
}

function isSameOriginApi(rawUrl: string): boolean {
  if (rawUrl.startsWith('/api/') || rawUrl === '/api') return true
  try {
    const u = new URL(rawUrl, window.location.origin)
    return (
      u.origin === window.location.origin &&
      (u.pathname.startsWith('/api/') || u.pathname === '/api')
    )
  } catch {
    return false
  }
}

if (typeof window !== 'undefined' && !window.__whFetchPatched) {
  window.__whFetchPatched = true
  const original = window.fetch.bind(window)
  window.__whOriginalFetch = original

  const patched: typeof window.fetch = async (input, init = {}) => {
    try {
      const raw =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (raw && isSameOriginApi(raw)) {
        const { data } = await supabaseBrowser.auth.getSession()
        const token = data.session?.access_token
        if (token) {
          if (input instanceof Request) {
            const headers = new Headers(input.headers)
            if (!headers.has('Authorization')) {
              headers.set('Authorization', `Bearer ${token}`)
            }
            input = new Request(input, { headers })
          } else {
            const headers = new Headers(init.headers)
            if (!headers.has('Authorization')) {
              headers.set('Authorization', `Bearer ${token}`)
            }
            init = { ...init, headers }
          }
        }
      }
    } catch {
      /* fall through to an unauthenticated request */
    }
    return original(input as RequestInfo | URL, init)
  }

  window.fetch = patched
}

export {}
