/** List all sessions for the authenticated user */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getUserClient } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const { user, token } = authResult

  // P0: run AS the user so RLS enforces tenancy. The .eq('user_id') below is now
  // redundant defence-in-depth, not the security boundary.
  const supabase = getUserClient(token)
  const { data, error } = await supabase
    .from('sessions')
    .select('id, file_name, source_app, source_type, total_messages, processing_status, date_range_start, date_range_end, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data })
}
