/**
 * GET /api/ingest/[id]/status — what the progress display polls.
 *
 * Project-scoped: the job row carries its project_id, and the caller must hold
 * a credential for that same project. Without this check a job id would be an
 * IDOR into another project's filenames and progress.
 */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/api-auth'
import { getServiceClient } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = String(params?.id ?? '')
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: 'A valid job id is required' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data: job, error } = await supabase
    .from('ingest_jobs')
    .select(
      'id, project_id, file_name, size_bytes, route, status, total_batches, completed_batches, messages_written, error, created_at, updated_at'
    )
    .eq('id', jobId)
    .maybeSingle()

  if (error) {
    console.error('[ingest/status] lookup failed:', error.message)
    return NextResponse.json({ error: 'Failed to read job' }, { status: 500 })
  }
  // Same 404 whether the job is absent or belongs to someone else, so the
  // endpoint cannot be used to probe which job ids exist.
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const authError = await requireProjectAccess(request, job.project_id)
  if (authError) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const percent =
    job.total_batches > 0
      ? Math.round((job.completed_batches / job.total_batches) * 100)
      : 0

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    route: job.route,
    fileName: job.file_name,
    sizeBytes: job.size_bytes,
    batches: { total: job.total_batches, completed: job.completed_batches, percent },
    messagesWritten: job.messages_written,
    error: job.error ?? undefined,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  })
}
