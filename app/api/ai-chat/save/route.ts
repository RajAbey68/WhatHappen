import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { requireProjectAccess, safeParseTimestamp } from '@/lib/api-auth'

/** Only these message fields are ever persisted (RAJ-738). */
const ALLOWED_ROLES = new Set(['user', 'assistant', 'system'])
const MAX_MESSAGES = 500
const MAX_CONTENT_LENGTH = 20000

type SanitizedMessage = { role: string; content: string; timestamp: string }

/**
 * Whitelist + validate a client-supplied message. Returns null when the
 * message is malformed so the caller can reject the whole request.
 */
function sanitizeMessage(msg: any): SanitizedMessage | null {
  if (!msg || typeof msg !== 'object') return null
  if (typeof msg.role !== 'string' || !ALLOWED_ROLES.has(msg.role)) return null
  if (typeof msg.content !== 'string' || msg.content.length > MAX_CONTENT_LENGTH) return null

  // RAJ-745: reject malformed timestamps rather than storing "Invalid Date".
  const timestamp = safeParseTimestamp(msg.timestamp)
  if (!timestamp) return null

  return { role: msg.role, content: msg.content, timestamp }
}

export async function POST(request: NextRequest) {
  const supabase = getServiceClient()
  try {
    const { projectId, messages } = await request.json()

    if (!projectId || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Project ID and messages are required' }, { status: 400 })
    }

    // RAJ-738: authorize the caller server-side before any write.
    const authError = await requireProjectAccess(request, projectId)
    if (authError) return authError

    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { error: `messages must contain between 1 and ${MAX_MESSAGES} entries` },
        { status: 400 }
      )
    }

    // RAJ-738/745: whitelist fields and validate timestamps.
    const sanitized: SanitizedMessage[] = []
    for (const msg of messages) {
      const clean = sanitizeMessage(msg)
      if (!clean) {
        return NextResponse.json({ error: 'Invalid message payload' }, { status: 400 })
      }
      sanitized.push(clean)
    }

    // Save the conversation (only whitelisted fields)
    const conversationData = {
      project_id: projectId,
      messages: sanitized
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
  const supabase = getServiceClient()
  try {
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // RAJ-738: reads are project-scoped too.
    const authError = await requireProjectAccess(request, projectId)
    if (authError) return authError

    // Get all conversations for this project
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const conversations = (data || []).map((conv: any) => ({
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