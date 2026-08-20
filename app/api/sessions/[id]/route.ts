/**
 * GET /api/sessions/[id] — poll upload processing status.
 *
 * Browser clients cannot query the sessions table directly due to RLS policy
 * users_own_sessions (requires auth.uid() = user_id). This endpoint proxies
 * the read through authenticated backend, keyed on project token from RAJ-747.
 */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import {
  requireProjectAccess,
  isValidProjectId,
  hasAnyProjectCredential,
  missingCredentialResponse,
} from '@/lib/api-auth'

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Content-Type': 'application/json' } })

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!hasAnyProjectCredential(request)) return missingCredentialResponse()

  const sessionId = params.id
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return json({ error: 'Session ID is required' }, 400)
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  if (!isValidProjectId(projectId)) {
    return json({ error: 'A valid project ID is required' }, 400)
  }

  const authError = await requireProjectAccess(request, projectId)
  if (authError) return authError

  try {
    const supabase = getServiceClient()

    const { data: session, error: dbError } = await supabase
      .from('sessions')
      .select('id, processing_status, processing_error, total_messages, date_range_start, date_range_end, file_name, file_size_bytes, created_at')
      .eq('id', sessionId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (dbError) {
      console.error('[sessions/:id] read failed:', dbError.message)
      return json({ error: 'Failed to fetch session' }, 500)
    }

    if (!session) {
      return json({ error: 'Session not found' }, 404)
    }

    return json({ session })
  } catch (err: any) {
    console.error('[sessions/:id] error:', err?.message)
    return json({ error: 'Internal server error' }, 500)
  }
}
