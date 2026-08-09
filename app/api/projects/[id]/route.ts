import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { requireProjectAccess } from '@/lib/api-auth'
import { supabase as anonSupabase } from '@/lib/supabase'

function mapDbProject(dbProj: any) {
  if (!dbProj) return null
  return {
    id: dbProj.id,
    name: dbProj.name,
    description: dbProj.description || undefined,
    messageCount: dbProj.message_count || 0,
    participants: dbProj.participants || [],
    dateRange: dbProj.date_range || undefined,
    analysis: dbProj.analysis || undefined,
    createdAt: dbProj.created_at,
    updatedAt: dbProj.updated_at
  }
}

function mapClientToDbProject(body: any) {
  const data: any = {}
  if (body.name !== undefined) data.name = body.name
  if (body.description !== undefined) data.description = body.description
  if (body.messageCount !== undefined) data.message_count = body.messageCount
  if (body.message_count !== undefined) data.message_count = body.message_count
  if (body.participants !== undefined) data.participants = body.participants
  if (body.dateRange !== undefined) data.date_range = body.dateRange
  if (body.date_range !== undefined) data.date_range = body.date_range
  if (body.analysis !== undefined) data.analysis = body.analysis
  return data
}

// GET - Fetch single project details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // RAJ-780: was unauthenticated while using the service-role client.
  const authError = await requireProjectAccess(request, params.id)
  if (authError) return authError

  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ project: mapDbProject(data) })
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

// PUT - Update project details
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // RAJ-780: arbitrary project mutation was unauthenticated.
  const authError = await requireProjectAccess(request, params.id)
  if (authError) return authError

  try {
    const body = await request.json()
    const updateData = {
      ...mapClientToDbProject(body),
      updated_at: new Date().toISOString()
    }

    const supabase = getServiceClient()
    const { error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ 
      message: 'Project updated successfully',
      id: params.id
    })
  } catch (error) {
    console.error('Error updating project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

// DELETE - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // RAJ-780: destructive and irreversible (purges GCS media and cascades the
  // project row). Was unauthenticated while using the service-role client.
  const authError = await requireProjectAccess(request, params.id)
  if (authError) return authError

  try {
    const projectId = params.id
    const supabase = getServiceClient()

    // 1. Purge media from GCS before deleting project record
    try {
      const { data: queueItems } = await supabase
        .from('media_processing_queue')
        .select('file_path')
        .eq('project_id', projectId)

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
              console.warn(`[media-purge] GCS delete failed for ${item.file_path}:`, deleteErr.message)
            }
          }
        }
      }
    } catch (purgeError: any) {
      console.error('[delete-project] Media purge failed:', purgeError.message)
    }

    // 2. Delete project from Supabase database (cascades to messages, media queue etc)
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (error) throw error

    return NextResponse.json({ message: 'Project deleted successfully' })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}