/**
 * POST /api/ingest/enqueue — the gateway's entire role in a large upload.
 *
 * Cloud Run authorizes, classifies, and writes one row. It never downloads the
 * object, never unzips anything, and never holds a large file in memory. The
 * hermes-dev worker claims the row and does the work, with no request-timeout
 * ceiling and 97 GB of scratch.
 *
 * The route classification is written to the row at enqueue time rather than
 * recomputed by the worker. One decision, made once, visible to both the badge
 * the user sees and the code that acts on it.
 */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/api-auth'
import { getServiceClient } from '@/lib/auth'
import { classifyUpload } from '@/lib/ingest/classify'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (body: unknown, status: number) => NextResponse.json(body, { status })

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const projectId = String(body.projectId ?? '')
  const storagePath = String(body.storagePath ?? '')
  const fileName = String(body.fileName ?? '')
  const sizeBytes = Number(body.sizeBytes)
  const sessionId = body.sessionId ? String(body.sessionId) : null

  if (!UUID_RE.test(projectId)) return json({ error: 'A valid projectId is required' }, 400)
  if (!storagePath) return json({ error: 'storagePath is required' }, 400)
  if (!fileName) return json({ error: 'fileName is required' }, 400)
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return json({ error: 'A valid sizeBytes is required' }, 400)
  }

  // Authorize against the projectId the caller named. The service-role client
  // below bypasses RLS, so this is the only gate.
  const authError = await requireProjectAccess(request, projectId)
  if (authError) return authError

  const classification = classifyUpload({ fileName, sizeBytes })
  if (classification.route === 'UNSUPPORTED') {
    // Refuse before writing a row. A queued job for a file nothing can read is
    // a job that fails later and looks like a system fault.
    return json(
      { error: classification.reason ?? 'Unsupported file', route: classification.route },
      415
    )
  }

  const row = {
    project_id: projectId,
    session_id: sessionId,
    storage_path: storagePath,
    file_name: fileName,
    size_bytes: sizeBytes,
    route: classification.route,
    status: 'queued',
    total_batches: classification.batches,
    completed_batches: 0,
  }

  const { data, error } = await getServiceClient()
    .from('ingest_jobs')
    .insert(row)
    .select()
    .single()

  if (error || !data) {
    console.error('[ingest/enqueue] failed to write job row:', error?.message)
    return json({ error: 'Failed to enqueue' }, 500)
  }

  return json(
    {
      // The keys the client polls on. Do not rename without updating the
      // upload component — that contract drift killed this feature once.
      jobId: data.id,
      status: data.status,
      route: classification.route,
      label: classification.label,
      batches: classification.batches,
      runsOn: classification.runsOn,
    },
    202
  )
}
