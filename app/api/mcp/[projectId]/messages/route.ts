import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { isValidProjectId, verifyProjectToken, PROJECT_TOKEN_HEADER } from '@/lib/api-auth'
import { decryptArchiveField } from '@/lib/archive-decryption'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

/** Authenticated trusted-backend plaintext export; never accepts request keys.
 * Requires the revision/RPC migration: no weaker fallback for legacy databases.
 */
export async function GET(request: NextRequest, { params }: { params: { projectId: string } }) {
  const { projectId } = params
  if (!isValidProjectId(projectId)) return reply({ error: 'Invalid project ID' }, 400)
  if (!verifyProjectToken(request.headers.get(PROJECT_TOKEN_HEADER), projectId)) return reply({ error: 'Unauthorized' }, 401)
  const query = new URL(request.url).searchParams
  const limitText = query.get('limit') ?? '500'
  if (!/^\d+$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 500) return reply({ error: 'limit must be 1–500' }, 400)
  const limit = Number(limitText)
  let offset = 0
  let expectedRevision: string | null = null
  const cursor = query.get('cursor')
  if (cursor !== null) {
    try {
      if (cursor.length > 2048) throw new Error()
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
      if (decoded.projectId !== projectId || decoded.limit !== limit || !Number.isSafeInteger(decoded.offset) || decoded.offset < 1 || decoded.offset > 2147483647 || typeof decoded.revision !== 'string' || !/^\d+$/.test(decoded.revision)) throw new Error()
      offset = decoded.offset; expectedRevision = decoded.revision
    } catch { return reply({ error: 'Invalid cursor' }, 400) }
  }
  try {
    const { data, error } = await getServiceClient().rpc('mcp_archive_page', { p_project_id: projectId, p_offset: offset, p_limit: limit })
    if (error) {
      if (['PGRST202', '42883', '42703'].includes(error.code)) return reply({ error: 'MCP archive revision migration required', code: 'MIGRATION_REQUIRED' }, 503)
      return reply({ error: 'Archive read failed' }, 503)
    }
    if (!data) return reply({ error: 'Project not found' }, 404)
    if (typeof data.revision !== 'string' || !/^\d+$/.test(data.revision) || !Number.isSafeInteger(data.totalMessages) || data.totalMessages < 0 || !Array.isArray(data.rows) || data.rows.length > limit) return reply({ error: 'Invalid archive snapshot' }, 503)
    if (expectedRevision !== null && expectedRevision !== data.revision) return reply({ error: 'Archive changed; restart pagination', code: 'REVISION_CHANGED' }, 409)
    if (offset > data.totalMessages || data.rows.length !== Math.min(limit, data.totalMessages - offset)) return reply({ error: 'Incomplete archive page' }, 503)
    let messages
    try {
      messages = await Promise.all(data.rows.map(async (row: any) => ({
        id: row.id, projectId,
        conversationId: typeof row.conversation_id === 'string' ? row.conversation_id : null,
        replyToId: typeof row.reply_to_id === 'string' ? row.reply_to_id : null,
        sender: await decryptArchiveField(row.sender), message: await decryptArchiveField(row.message),
        timestamp: row.timestamp, sourceId: typeof row.source_id === 'string' ? row.source_id : null,
      })))
    } catch { return reply({ error: 'Archive decryption unavailable or failed' }, 422) }
    const nextOffset = offset + messages.length
    const complete = nextOffset === data.totalMessages
    const nextCursor = complete ? null : Buffer.from(JSON.stringify({ projectId, limit, offset: nextOffset, revision: data.revision })).toString('base64url')
    return reply({ messages, nextCursor, revision: data.revision, complete, totalMessages: data.totalMessages, archiveLatestMessage: data.archiveLatestMessage ?? null })
  } catch { return reply({ error: 'Archive read failed' }, 503) }
}
