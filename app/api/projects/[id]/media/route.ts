import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { requireProjectAccess } from '@/lib/api-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // RAJ-780: `requireAuth` alone only proved the caller was *some* authenticated
  // Supabase user — it never tied them to THIS project, so any signed-up account
  // could irreversibly purge another project's media from GCS. Must be
  // project-scoped.
  const authError = await requireProjectAccess(request, params.id)
  if (authError) return authError

  try {
    const { action } = await request.json()
    if (action !== 'purge') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const projectId = params.id
    const supabase = getServiceClient()

    // 1. Fetch all media file paths for this project
    const { data: queueItems, error: fetchError } = await supabase
      .from('media_processing_queue')
      .select('file_path')
      .eq('project_id', projectId)

    if (fetchError) throw fetchError

    // 2. Purge files from GCS if configured
    if (process.env.GCS_BUCKET && queueItems && queueItems.length > 0) {
      const { Storage } = await import('@google-cloud/storage')
      const storageOptions: any = {}
      if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
        storageOptions.projectId = process.env.GCP_PROJECT_ID || 'leadsync-489921'
        storageOptions.credentials = {
          client_email: process.env.GCP_CLIENT_EMAIL,
          private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }
      }
      const storage = new Storage(storageOptions)
      const bucket = storage.bucket(process.env.GCS_BUCKET)

      for (const item of queueItems) {
        if (item.file_path) {
          try {
            await bucket.file(item.file_path).delete()
          } catch (deleteErr: any) {
            console.warn(`[media-purge] Failed to delete GCS file: ${item.file_path}`, deleteErr.message)
          }
        }
      }
    }

    // 3. Delete media processing queue entries
    const { error: deleteError } = await supabase
      .from('media_processing_queue')
      .delete()
      .eq('project_id', projectId)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true, purgedCount: queueItems?.length || 0 })
  } catch (error: any) {
    console.error('[media-purge] Error purging media:', error)
    return NextResponse.json({ error: 'Failed to purge media' }, { status: 500 })
  }
}
