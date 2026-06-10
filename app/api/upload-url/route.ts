/**
 * Issues a signed GCS URL for direct browser → Cloud Storage upload.
 * Validates file before issuing URL: size, extension, MIME type.
 * After upload, a Pub/Sub notification triggers the async parse job.
 */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { requireAuth, getServiceClient } from '@/lib/auth'
import { v4 as uuidv4 } from 'uuid'

const MAX_FILE_BYTES = 500 * 1024 * 1024 // 500 MB
const ALLOWED_EXTENSIONS = ['.txt', '.zip', '.pst', '.csv', '.json']
const ALLOWED_MIMES = new Set([
  'text/plain', 'application/zip', 'application/x-zip-compressed',
  'application/vnd.ms-outlook', 'text/csv', 'application/json',
  'application/octet-stream',
])

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const { user } = authResult

  const { fileName, fileSize, mimeType, sourceApp = 'whathappen' } = await request.json()

  if (!fileSize || fileSize > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File must be under ${MAX_FILE_BYTES / 1024 / 1024}MB` },
      { status: 413 }
    )
  }

  const ext = path.extname(fileName ?? '').toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `File type '${ext}' not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
      { status: 415 }
    )
  }

  if (mimeType && !ALLOWED_MIMES.has(mimeType)) {
    return NextResponse.json({ error: `Unexpected MIME type: ${mimeType}` }, { status: 415 })
  }

  const sessionId = uuidv4()
  const gcsPath = `uploads/${user.id}/${sessionId}/${fileName}`

  const supabase = getServiceClient()
  const { error: dbError } = await supabase.from('sessions').insert({
    id: sessionId,
    user_id: user.id,
    file_name: fileName,
    file_size_bytes: fileSize,
    source_app: sourceApp,
    source_type: inferSourceType(ext),
    processing_status: 'pending',
  })

  if (dbError) {
    console.error('[upload-url] DB insert failed:', dbError.message)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  if (process.env.GCS_BUCKET) {
    try {
      const { Storage } = await import('@google-cloud/storage')
      const storage = new Storage()
      const [signedUrl] = await storage
        .bucket(process.env.GCS_BUCKET)
        .file(gcsPath)
        .getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + 15 * 60 * 1000,
          contentType: mimeType ?? 'application/octet-stream',
        })
      return NextResponse.json({ sessionId, uploadUrl: signedUrl, gcsPath })
    } catch (err: any) {
      console.error('[upload-url] GCS signed URL failed:', err.message)
      return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
    }
  }

  // Local dev fallback
  return NextResponse.json({
    sessionId,
    uploadUrl: `/api/process-file?sessionId=${sessionId}`,
    gcsPath: null,
  })
}

function inferSourceType(ext: string): string {
  if (ext === '.pst') return 'email_pst'
  if (ext === '.csv') return 'email_csv'
  return 'whatsapp'
}
