import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
  try {
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
  try {
    const body = await request.json()
    const updateData = {
      ...mapClientToDbProject(body),
      updated_at: new Date().toISOString()
    }

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
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ message: 'Project deleted successfully' })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}