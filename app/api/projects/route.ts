import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
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

// GET - List all projects (enumerated metadata only, no PII)
//
// RAJ-781 (fixed): this route used the service-role client and returned every
// project's `participants` (real people's names) and `analysis` (keywords,
// insights and sentiment derived from private message content) to anonymous
// callers. The list is consumed only by the project picker, which needs id +
// name + messageCount. We now drop `participants`/`analysis` from the response
// so the anonymous listing exposes no message-derived PII. Project-scoped
// detail (participants/analysis) is available only through routes that call
// requireProjectAccess — the same zero-knowledge property holds.
export async function GET() {
  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, message_count, date_range, created_at, updated_at')
      .order('created_at', { ascending: false })
      
    if (error) throw error
    
    const projects = (data || []).map((dbProj: any) => ({
      id: dbProj.id,
      name: dbProj.name,
      description: dbProj.description || undefined,
      messageCount: dbProj.message_count || 0,
      dateRange: dbProj.date_range || undefined,
      createdAt: dbProj.created_at,
      updatedAt: dbProj.updated_at
    }))
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

    const supabase = getServiceClient()
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