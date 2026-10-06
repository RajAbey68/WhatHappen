import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getServiceClient } from '@/lib/auth'
import { PROJECT_TOKEN_HEADER, isAuthBypassed, isValidProjectId, requireProjectAccess } from '@/lib/api-auth'

export const maxDuration = 300
const PAGE = 1000
const MAX_ROWS = 50000

/**
 * POST { projectId, format: 'zip'|'json'|'csv', remoteJid? } — export project
 * messages for large volumes. zip contains chat.txt (WhatsApp export format,
 * re-importable via the existing upload flow) + metadata.json.
 */
export async function POST(request: NextRequest) {
  if (!isAuthBypassed() && !request.headers.has(PROJECT_TOKEN_HEADER) && !request.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: missing project access token' }, { status: 401 })
  }
  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { projectId, format, remoteJid } = body ?? {}
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
  }
  if (!['zip', 'json', 'csv'].includes(format)) {
    return NextResponse.json({ error: "format must be 'zip'|'json'|'csv'" }, { status: 400 })
  }
  const denied = await requireProjectAccess(request, projectId)
  if (denied) return denied

  const supabase = getServiceClient()
  const rows: Array<{ sender: string; message: string; timestamp: string | null; occurred_at: string | null; remote_jid: string | null; message_id: string | null }> = []
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let q = supabase.from('messages').select('sender, message, timestamp, occurred_at, remote_jid, message_id').eq('project_id', projectId).order('occurred_at', { ascending: true }).range(offset, offset + PAGE - 1)
    if (typeof remoteJid === 'string' && remoteJid) q = q.eq('remote_jid', remoteJid)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: 'Export read failed' }, { status: 500 })
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }

  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'json') {
    return new NextResponse(JSON.stringify({ projectId, exportedAt: new Date().toISOString(), count: rows.length, messages: rows }), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="whathappen-${stamp}.json"` },
    })
  }
  if (format === 'csv') {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = ['sender,message,timestamp,remote_jid,message_id', ...rows.map((r) => [esc(r.sender), esc(r.message), esc(r.occurred_at ?? r.timestamp), esc(r.remote_jid), esc(r.message_id)].join(','))].join('\n')
    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="whathappen-${stamp}.csv"` },
    })
  }

  const chat = rows.map((r) => {
    const ts = r.occurred_at ?? r.timestamp ?? ''
    const single = r.message.replace(/\n/g, ' ')
    return `[${ts}] ${r.sender}: ${single}`
  }).join('\n')
  const zip = new JSZip()
  zip.file('chat.txt', chat)
  zip.file('metadata.json', JSON.stringify({ projectId, exportedAt: new Date().toISOString(), count: rows.length, remoteJid: remoteJid ?? null }, null, 2))
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return new NextResponse(buf as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="whathappen-${stamp}.zip"` },
  })
}
