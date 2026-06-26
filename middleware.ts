import { NextRequest, NextResponse } from 'next/server'

/**
 * SEC-2 — Default-deny authentication gate.
 *
 * Every route under /api/* requires a Bearer credential BY DEFAULT. A route
 * becomes public only by being added to PUBLIC_API_PATHS — you opt OUT, never
 * in. This removes the entire class of "someone forgot to add requireAuth"
 * bugs that produced SEC-1 (9 of 12 routes were unauthenticated).
 *
 * Scope: this middleware checks that a credential is PRESENT (cheap and
 * edge-safe). Full Supabase JWT validation still happens at the route level in
 * lib/auth.ts -> requireAuth(). Belt: middleware. Braces: requireAuth.
 *
 * BREAKING CHANGE: the frontend must now send
 *   Authorization: Bearer <supabase access token>
 * on every /api call. Legacy routes that were previously callable anonymously
 * will return 401 until the client is updated. That is intentional — those
 * routes were a public data-exposure path (SEC-1). Do NOT auto-deploy this
 * without shipping the matching frontend change.
 */

// Paths under /api that are intentionally public. Keep empty unless a route
// MUST be reachable without auth, and document why next to each entry.
const PUBLIC_API_PATHS: string[] = [
  // '/api/health',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_API_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only guard the API surface.
  if (!pathname.startsWith('/api/')) return NextResponse.next()
  if (isPublic(pathname)) return NextResponse.next()

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
