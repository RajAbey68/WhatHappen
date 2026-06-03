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

// GET - List all projects
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      
    if (error) throw error
    
    const projects = (data || []).map(mapDbProject)
    return NextResponse.json(projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

// POST - Create new project
export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const { name, description } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Project name is required' }, { status: 400 })
    }

    const projectData = {
      name: name.trim(),
      description: description ? description.trim() : null,
      message_count: 0,
      participants: [],
      date_range: null,
      analysis: null
    }

    const { data, error } = await supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      success: true,
      project: mapDbProject(data)
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json({ success: false, error: 'Failed to create project' }, { status: 500 })
  }
} 