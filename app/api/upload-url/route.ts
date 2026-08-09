/**
 * POST /api/upload-url — mint a signed direct-to-storage upload URL.
 *
 * RAJ-782 — WHAT WAS BROKEN
 * -------------------------
 * This route called `requireAuth()` and demanded a Supabase Bearer JWT. The
 * application has NO login or signup UI, so `supabase.auth.getSession()` always
 * returns null and the browser never had a token to send. Every upload above
 * GCS_THRESHOLD (10 MB) therefore failed with
 *   "Missing or invalid Authorization header"
 * for every user, always, in production. It only appeared to work locally
 * because `requireAuth` returns a synthetic dev user when NODE_ENV is
 * 'development'.
 *
 * WHAT CHANGED
 * ------------
 * 1. Authorization now uses the passphrase-proven project token — the app's
 *    actual auth mechanism (RAJ-747) — via `requireProjectAccess`.
 * 2. The hot tier is Supabase Storage, not GCS. GCS becomes the archive tier
 *    in the retention sweep (RAJ-783), so uploads no longer need GCP creds on
 *    the request path.
 * 3. Validation runs through the shared `@asimov/ingest` guard, the same code
 *    booklets uses, so the two apps cannot drift apart on upload safety.
 *
 * The bucket MUST be private. A public bucket would bypass the API entirely and
 * re-open the anonymous exposure the RAJ-780 authorization work closed.
 */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { requireProjectAccess, isValidProjectId } from '@/lib/api-auth'
import { createSupabaseStorageAdapter } from '@asimov/ingest'
import path from 'path'

/** Hard ceiling on a single upload. */
const MAX_FILE_BYTES = 500 * 1024 * 1024

/** Default retention window before the archive sweep moves the object to GCS. */
const DEFAULT_ARCHIVE_DAYS = 7

const ALLOWED_EXTENSIONS = ['.txt', '.zip', '.pst', '.csv', '.json', '.pdf']

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Content-Type': 'application/json' } })

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const { projectId, fileName, fileSize, mimeType } = body ?? {}

  if (!isValidProjectId(projectId)) {
    return json({ error: 'A valid project ID is required' }, 400)
  }

  // RAJ-780/782: the project token is the credential. No JWT is required,
  // because no part of this application can issue one.
  const authError = await requireProjectAccess(request, projectId)
  if (authError) return authError

  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return json({ error: 'A valid fileSize is required' }, 400)
  }
  if (fileSize > MAX_FILE_BYTES) {
    return json(
      { error: `File must be under ${MAX_FILE_BYTES / 1024 / 1024} MB` },
      413
    )
  }

  const ext = path.extname(typeof fileName === 'string' ? fileName : '').toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return json(
      { error: `File type '${ext}' not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
      415
    )
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'evidence'
  const supabase = getServiceClient()

  try {
    const storage = createSupabaseStorageAdapter({ client: supabase as any, bucket })

    // Scope the object path by project so a listing can never span matters.
    const safeName = String(fileName).replace(/[^A-Za-z0-9._-]/g, '_')
    const objectPath = `${projectId}/${Date.now()}-${safeName}`

    const signed = await storage.createSignedUploadUrl(objectPath, {
      contentType: typeof mimeType === 'string' ? mimeType : undefined,
    })

    const archiveDays = Number(process.env.ARCHIVE_DAYS) || DEFAULT_ARCHIVE_DAYS
    const expiresAt = new Date(Date.now() + archiveDays * 24 * 60 * 60 * 1000).toISOString()

    const { error: dbError } = await supabase.from('media_objects').insert({
      project_id: projectId,
      storage_path: objectPath,
      storage_provider: storage.name,
      file_name: fileName,
      file_size_bytes: fileSize,
      mime_type: mimeType ?? null,
      expires_at: expiresAt,
    })

    // Fail loudly. A recorded-but-unreferenced object would be invisible to the
    // retention sweep and to purge — exactly the silent no-op that already
    // exists in the media-purge paths.
    if (dbError) {
      console.error('[upload-url] failed to record media object:', dbError.message)
      return json({ error: 'Failed to record upload' }, 500)
    }

    return json({
      uploadUrl: signed.url,
      path: objectPath,
      expiresAt,
      provider: storage.name,
    })
  } catch (err: any) {
    console.error('[upload-url] signed URL minting failed:', err?.message)
    return json({ error: 'Failed to create upload URL' }, 500)
  }
}
