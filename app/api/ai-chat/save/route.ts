import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { projectId, messages } = await request.json()

    if (!projectId || !messages) {
      return NextResponse.json({ error: 'Project ID and messages are required' }, { status: 400 })
    }

    // Save the conversation
    const conversationData = {
      project_id: projectId,
      messages: messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp).toISOString()
      }))
    }

    const { data, error } = await supabase
      .from('ai_conversations')
      .insert(conversationData)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      conversationId: data.id,
      message: 'Conversation saved successfully'
    })

  } catch (error) {
    console.error('Error saving AI conversation:', error)
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Get all conversations for this project
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const conversations = (data || []).map(conv => ({
      id: conv.id,
      projectId: conv.project_id,
      messages: conv.messages || [],
      createdAt: conv.created_at
    }))

    // Return the array directly to match component expectations
    return NextResponse.json(conversations)

  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
} 