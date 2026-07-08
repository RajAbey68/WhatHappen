import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'

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

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const supabase = getServiceClient()
  try {
    const { projectId } = params

    // Get project details
    const { data: dbProj, error: projError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projError || !dbProj) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = mapDbProject(dbProj) as any

    // Get recent messages for context
    const { data: dbMessages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (msgError) throw msgError

    const recentMessages = (dbMessages || []).map(msg => ({
      id: msg.id,
      sender: msg.sender,
      message: msg.message,
      timestamp: msg.timestamp,
      projectId: msg.project_id
    }))

    // Get AI conversation history
    const { data: dbConversations, error: convError } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (convError) throw convError

    const conversations = (dbConversations || []).map(conv => ({
      id: conv.id,
      projectId: conv.project_id,
      messages: conv.messages || [],
      createdAt: conv.created_at
    }))

    return NextResponse.json({
      project,
      recentMessages: recentMessages.slice(0, 20), // Limit for performance
      conversations,
      context: {
        messageCount: project.messageCount || 0,
        participants: project.participants || [],
        dateRange: project.dateRange,
        keywords: project.analysis?.keywords || [],
        insights: project.analysis?.insights || []
      }
    })

  } catch (error) {
    console.error('Error fetching project chat data:', error)
    return NextResponse.json({ error: 'Failed to fetch project data' }, { status: 500 })
  }
} 