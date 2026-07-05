import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export interface AuthedUser {
  id: string
  email?: string
}

export interface AuthResult {
  user: AuthedUser
  /** The caller's Supabase access token — use with getUserClient() so RLS applies. */
  token: string
}

/**
 * Validate the Supabase JWT from the Authorization header.
 * Returns { user, token }, or a 401 response if invalid.
 *
 * Usage in route handlers:
 *   const authResult = await requireAuth(request)
 *   if (authResult instanceof NextResponse) return authResult
 *   const { user, token } = authResult
 *   const supabase = getUserClient(token)   // RLS-enforced, runs AS the user
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthResult | NextResponse> {
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

  return { user: { id: data.user.id, email: data.user.email }, token }
}

/**
 * P0 (SEC-1): Supabase client that runs AS the authenticated user.
 *
 * It uses the ANON key plus the caller's Bearer token, so every query executes
 * under the user's identity and Row-Level Security (auth.uid() = user_id) is
 * enforced by Postgres. This REPLACES the old getServiceClient(), which used the
 * service-role key and BYPASSED RLS — making tenant isolation depend on a
 * hand-written `.eq('user_id', ...)` on every query (one miss = cross-tenant breach).
 *
 * Do NOT reintroduce a service-role client for user data. RLS is the control.
 */
export function getUserClient(token: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}
