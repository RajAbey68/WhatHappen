import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { PROJECT_TOKEN_HEADER, isAuthBypassed, isValidProjectId, requireProjectAccess } from '@/lib/api-auth'
import { MAX_OUTBOUND_CHARS, toJid } from '@/lib/whatsapp-live/jid'

/**
 * POST { projectId, to, text } — queue an outbound task message on the sync
 * number. The live-sync worker drains the outbox via its open Baileys session.
 * Rows wait safely when no session is open (worker only sends when connected).
 */
export async function POST(request: NextRequest) {
  if (!isAuthBypassed() && !request.headers.has(PROJECT_TOKEN_HEADER) && !request.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: missing project access token' }, { status: 401 })
  }
  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { projectId, to, text } = body ?? {}
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
  }
  const jid = toJid(to);
  if (!jid) {
    return NextResponse.json({ error: 'Invalid destination: use E.164 digits or a WhatsApp JID' }, { status: 400 })
  }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_OUTBOUND_CHARS) {
    return NextResponse.json({ error: `text must be 1-${MAX_OUTBOUND_CHARS} chars` }, { status: 400 })
  }
  const denied = await requireProjectAccess(request, projectId)
  if (denied) return denied

  const supabase = getServiceClient()
  const { data, error } = await supabase.from('whatsapp_outbox').insert({
    project_id: projectId,
    to_jid: jid,
    text: text.trim(),
  }).select('id, status')
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row) return NextResponse.json({ error: 'Queue write failed' }, { status: 500 })
  return NextResponse.json({ ok: true, id: row.id, status: row.status, to: jid })
}

/**
 * GET ?projectId= — recent outbox rows (pending counts + delivery state).
 */
export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId') ?? ''
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
  }
  if (!isAuthBypassed() && !request.headers.has(PROJECT_TOKEN_HEADER) && !request.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: missing project access token' }, { status: 401 })
  }
  const denied = await requireProjectAccess(request, projectId)
  if (denied) return denied

  const supabase = getServiceClient()
  const { data, error } = await supabase.from('whatsapp_outbox')
    .select('id, to_jid, text, status, attempts, last_error, created_at, sent_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: 'Outbox read failed' }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}
