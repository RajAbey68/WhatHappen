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
 * 1. Authorization uses the passphrase-proven project token (RAJ-747), the
 *    app's actual auth mechanism, via `requireProjectAccess`.
 * 2. The hot tier is Supabase Storage. The object path is recorded EXPLICITLY on
 *    the session row — `process-file` previously RECONSTRUCTED a GCS path from
 *    user_id/sessionId/file_name, which cannot address the new bucket.
 * 3. The response still returns `sessionId`, because the client destructures it
 *    (`components/file-upload.tsx`) and then polls `sessions` with it. An
 *    earlier version of this fix omitted it: the file uploaded successfully,
 *    was never processed, and the UI failed with the same symptom the fix was
 *    meant to remove. Four-eyes review caught it. The response shape is a
 *    contract; there is now a test asserting exactly the keys the client reads.
 *
 * The bucket MUST be private. A public bucket would bypass the API entirely and
 * re-open the anonymous exposure the RAJ-780 work closed.
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
import { createSupabaseStorageAdapter } from '@asimov/ingest'
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import path from 'path'

/** Hard ceiling on a single upload. */
const MAX_FILE_BYTES = 500 * 1024 * 1024

/** Fallback retention window when the project has no explicit setting. */
const DEFAULT_ARCHIVE_DAYS = 7

/** Bound the filename so it cannot bloat the object key or the DB row. */
const MAX_FILENAME_LENGTH = 200

const ALLOWED_EXTENSIONS = [
  '.txt', '.zip', '.pst', '.csv', '.json', '.pdf', '.docx',
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
  '.opus', '.m4a', '.mp3', '.wav', '.ogg'
]

/**
 * `sessions.user_id` is NOT NULL, but this app has no user accounts. Derive a
 * stable per-project id so the constraint holds without inventing a fake person
 * or weakening the schema. Same project → same id, so rows stay groupable.
 */
const PROJECT_OWNER_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const ownerIdForProject = (projectId: string) => uuidv5(projectId, PROJECT_OWNER_NAMESPACE)

function inferSourceType(ext: string): string {
  if (ext === '.pst') return 'email_pst'
  if (ext === '.csv') return 'email_csv'
  return 'whatsapp'
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Content-Type': 'application/json' } })

export async function POST(request: NextRequest) {
  // RAJ-780: reject credential-less callers BEFORE parsing the body, so an
  // anonymous request cannot make the server parse an arbitrary payload first.
  if (!hasAnyProjectCredential(request)) return missingCredentialResponse()

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const { projectId, fileName, fileSize, mimeType, sourceApp } = body ?? {}

  if (!isValidProjectId(projectId)) {
    return json({ error: 'A valid project ID is required' }, 400)
  }

  const authError = await requireProjectAccess(request, projectId)
  if (authError) return authError

  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return json({ error: 'A valid fileSize is required' }, 400)
  }
  if (fileSize > MAX_FILE_BYTES) {
    return json({ error: `File must be under ${MAX_FILE_BYTES / 1024 / 1024} MB` }, 413)
  }

  if (typeof fileName !== 'string' || fileName.length === 0) {
    return json({ error: 'A fileName is required' }, 400)
  }
  if (fileName.length > MAX_FILENAME_LENGTH) {
    return json({ error: `fileName must be under ${MAX_FILENAME_LENGTH} characters` }, 400)
  }

  const ext = path.extname(fileName).toLowerCase()
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

    const sessionId = uuidv4()
    // Scope by project so a bucket listing can never span matters. The
    // sessionId segment guarantees uniqueness.
    //
    // Sanitisation: strip every character that could act as a path separator,
    // then collapse dot-runs and leading dots. Removing '/' alone already makes
    // traversal impossible, but a name that still reads as '..' invites
    // misinterpretation by anything downstream that re-splits the key, and
    // leading dots produce hidden files on extraction.
    const safeName =
      fileName
        .replace(/[^A-Za-z0-9._-]/g, '_')
        .replace(/\.{2,}/g, '.')
        .replace(/^\.+/, '') || 'upload'
    const objectPath = `${projectId}/${sessionId}/${safeName}`

    const signed = await storage.createSignedUploadUrl(objectPath, {
      contentType: typeof mimeType === 'string' ? mimeType : undefined,
    })

    // Per-project retention, falling back to the env default. Read from the
    // project row so the UI control is authoritative — an earlier version read
    // only process.env, which made archive_days silently inert.
    const { data: project } = await supabase
      .from('projects')
      .select('archive_days')
      .eq('id', projectId)
      .maybeSingle()

    const archiveDays =
      typeof project?.archive_days === 'number'
        ? project.archive_days
        : Number.isFinite(Number(process.env.ARCHIVE_DAYS))
          ? Number(process.env.ARCHIVE_DAYS)
          : DEFAULT_ARCHIVE_DAYS

    const archiveAt = new Date(Date.now() + archiveDays * 24 * 60 * 60 * 1000).toISOString()

    // The session row is what the client polls and what process-file reads.
    const { error: sessionError } = await supabase.from('sessions').insert({
      id: sessionId,
      user_id: ownerIdForProject(projectId),
      project_id: projectId,
      file_name: fileName,
      file_size_bytes: fileSize,
      source_app: typeof sourceApp === 'string' ? sourceApp : 'whathappen',
      source_type: inferSourceType(ext),
      processing_status: 'pending',
      storage_path: objectPath,
      storage_provider: 'supabase',
    })

    if (sessionError) {
      console.error('[upload-url] failed to create session:', sessionError.message)
      return json({ error: 'Failed to create session' }, 500)
    }

    // status stays 'pending' until process-file confirms the bytes landed, so
    // the retention sweep never archives an object that was never uploaded.
    const { error: dbError } = await supabase.from('media_objects').insert({
      project_id: projectId,
      storage_path: objectPath,
      storage_provider: 'supabase',
      file_name: fileName,
      file_size_bytes: fileSize,
      mime_type: mimeType ?? null,
      expires_at: archiveAt,
      status: 'pending',
    })

    if (dbError) {
      // CodeRabbit, 2026-08-10: the sessions row is written first, so bailing
      // here left a 'pending' session pointing at a storage_path that no
      // media_objects row tracks. The retention sweep keys off media_objects,
      // so that object would have had no expiry owner and would sit in the
      // evidence bucket forever. Roll the session back before returning.
      console.error('[upload-url] failed to record media object:', dbError.message)
      const { error: rollbackError } = await supabase.from('sessions').delete().eq('id', sessionId)
      if (rollbackError) {
        console.error(
          '[upload-url] ORPHANED SESSION — media_objects insert failed and the session row could not be removed:',
          sessionId,
          rollbackError.message
        )
      }
      return json({ error: 'Failed to record upload' }, 500)
    }

    return json({
      // `sessionId` and `uploadUrl` are the two keys the client destructures.
      // Do not rename or drop them without updating components/file-upload.tsx.
      sessionId,
      uploadUrl: signed.url,
      path: objectPath,
      provider: storage.name,
      // Retention date, NOT the URL expiry. Named explicitly so the two are not
      // confused at the call site.
      archiveAt,
    })
  } catch (err: any) {
    console.error('[upload-url] signed URL minting failed:', err?.message)
    return json({ error: 'Failed to create upload URL' }, 500)
  }
}
