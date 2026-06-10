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
 * Create a Supabase client scoped to the authenticated user's session.
 * Uses the service role key for server-side operations (RLS enforced via user_id filters).
 */
export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
