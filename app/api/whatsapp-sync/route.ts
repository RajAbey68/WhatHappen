import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { PROJECT_TOKEN_HEADER, isAuthBypassed, isValidProjectId, requireProjectAccess } from '@/lib/api-auth'

export const maxDuration = 120
const SYNC_BATCH = 500

function authed(request: NextRequest) {
  return (
    isAuthBypassed() ||
    request.headers.has(PROJECT_TOKEN_HEADER) ||
    request.headers.get('authorization')?.startsWith('Bearer ')
  )
}

/**
 * GET ?projectId= — live-sync status: worker heartbeat, lockout state, groups,
 * and per-chat buffered counts. Project-scoped auth (same gate as in-app upload).
 */
export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId') ?? ''
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
  }
  if (!authed(request)) {
    return NextResponse.json({ error: 'Unauthorized: missing project access token' }, { status: 401 })
  }
  const denied = await requireProjectAccess(request, projectId)
  if (denied) return denied

  const supabase = getServiceClient()
  const [{ data: state }, { data: recent }] = await Promise.all([
    supabase.from('whatsapp_sync_state').select('session_id, phone, status, last_seen_at, groups, locked_out_until, updated_at'),
    supabase.from('whatsapp_live_buffer')
      .select('remote_jid, group_name, is_group, occurred_at')
      .order('occurred_at', { ascending: false })
      .limit(2000),
  ])

  const chats = new Map<string, { remoteJid: string; groupName: string | null; isGroup: boolean; buffered: number; latest: string | null }>()
  for (const r of recent ?? []) {
    const cur = chats.get(r.remote_jid) ?? { remoteJid: r.remote_jid, groupName: r.group_name, isGroup: r.is_group, buffered: 0, latest: null }
    cur.buffered++
    if (!cur.latest) cur.latest = r.occurred_at
    chats.set(r.remote_jid, cur)
  }

  return NextResponse.json({
    workers: state ?? [],
    chats: [...chats.values()].sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? '')),
  })
}

/**
 * POST { projectId, remoteJid, limit? } — flush buffered rows for one chat into
 * messages via idempotent upsert (default 100, max 500). Small-volume path;
 * large volumes use the zip export/upload flow.
 */
export async function POST(request: NextRequest) {
  if (!authed(request)) {
    return NextResponse.json({ error: 'Unauthorized: missing project access token' }, { status: 401 })
  }
  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { projectId, remoteJid, limit } = body ?? {}
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
  }
  if (typeof remoteJid !== 'string' || !remoteJid.includes('@')) {
    return NextResponse.json({ error: 'Invalid remoteJid' }, { status: 400 })
  }
  const denied = await requireProjectAccess(request, projectId)
  if (denied) return denied

  const take = Math.min(Math.max(Number(limit) || 100, 1), SYNC_BATCH)
  const supabase = getServiceClient()
  const { data: rows, error: readErr } = await supabase
    .from('whatsapp_live_buffer')
    .select('message_id, sender_name, text, occurred_at, is_group, group_name')
    .eq('remote_jid', remoteJid)
    .order('occurred_at', { ascending: true })
    .limit(take)
  if (readErr) return NextResponse.json({ error: 'Buffer read failed' }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ synced: 0, total: 0 })

  const { data: src } = await supabase
    .from('sources')
    .upsert({ project_id: projectId, remote_jid: remoteJid, name: rows[0].group_name ?? null, type: rows[0].is_group ? 'group' : 'dm' }, { onConflict: 'project_id, remote_jid' })
    .select('id')
    .maybeSingle()

  const batch = rows.map((r) => ({
    project_id: projectId,
    sender: r.sender_name.slice(0, 256),
    message: r.text.slice(0, 20000),
    timestamp: r.occurred_at,
    occurred_at: r.occurred_at,
    processed: true,
    remote_jid: remoteJid,
    message_id: r.message_id,
    source_id: src?.id ?? null,
  }))
  const { error: writeErr } = await supabase.from('messages').upsert(batch, { onConflict: 'project_id,message_id', ignoreDuplicates: true })
  if (writeErr) return NextResponse.json({ error: 'Sync write failed' }, { status: 500 })

  return NextResponse.json({ synced: batch.length, total: batch.length, remoteJid })
}
