import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Validate the Supabase JWT from the Authorization header.
 * Returns the authenticated user, or a 401 response if invalid.
 *
 * Usage in route handlers:
 *   const authResult = await requireAuth(request)
 *   if (authResult instanceof NextResponse) return authResult
 *   const { user } = authResult
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: { id: string; email?: string } } | NextResponse> {
  // Production never bypasses, whatever the flags say. lib/api-auth.ts was
  // hardened this way (isAuthBypassed); this file had its own separate bypass
  // that BYPASS_AUTH=true could still switch on in production. Found by the
  // independent GLM-4.6 four-eyes review of PR #8 on 2026-08-09.
  if (process.env.NODE_ENV !== 'production') {
    if (process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true') {
      return { user: { id: '00000000-0000-0000-0000-000000000000', email: 'dev@localhost' } }
    }
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  return { user: { id: data.user.id, email: data.user.email } }
}

/**
 * RAJ-783: Create a Supabase service client with automatic retry on HTTP 429.
 *
 * Uses the Supabase client's `fetch` option to intercept all REST/GraphQL calls
 * and retry with exponential backoff + Retry-After header parsing when
 * PostgREST returns 429 (rate limit exceeded — free projects cap at ~200 req/s).
 *
 * This prevents rate-limit errors from surfacing directly to end users;
 * instead the server transparently retries after a short backoff.
 */
export function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const maxAttempts = 3

  // Custom fetch wrapper with retry-on-429
  const resilientFetch: typeof fetch = async (input, init = {}) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    let response: Response

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      response = await fetch(input, init)

      if (response.ok) return response

      if (response.status === 429 && attempt < maxAttempts - 1) {
        const retryAfter = response.headers.get('retry-after')
        const delay = retryAfter
          ? Math.min(parseFloat(retryAfter) * 1000, 10_000)
          : Math.min(1000 * Math.pow(2, attempt), 10_000)

        console.warn(
          `[supabase-retry] 429 from ${urlStr}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxAttempts})`
        )

        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, delay))
        // Body may already be consumed; the fetch wrapper will re-send it
        continue
      }

      return response
    }

    // All retries exhausted — return the last response (still a 429)
    return response!
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: resilientFetch,
    },
  })
}
