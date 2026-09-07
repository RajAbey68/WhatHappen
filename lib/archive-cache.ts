import { getServiceClient } from '@/lib/auth'
import { decryptArchiveField } from '@/lib/archive-decryption'

export interface DecryptedMessage {
  id: string
  projectId: string
  conversationId: string | null
  replyToId: string | null
  sourceId: string | null
  sender: string
  message: string
  timestamp: string
}

export interface ArchiveSnapshot {
  projectId: string
  revision: string
  messages: DecryptedMessage[]
  totalMessages: number
  fetchedAt: number
  verifiedAt: number
}

interface CacheEntry {
  snapshot: ArchiveSnapshot
  timer: NodeJS.Timeout
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes TTL as mandated by DeepSeek v4 security review
const MAX_SNAPSHOT_MESSAGES = 50000
const MAX_PAGE_LIMIT = 500

const memoryCache = new Map<string, CacheEntry>()
const pendingLoads = new Map<string, Promise<ArchiveSnapshot>>()

/** Evict a project's decrypted cache immediately */
export function evictArchiveCache(projectId: string): void {
  const existing = memoryCache.get(projectId)
  if (existing) {
    clearTimeout(existing.timer)
    memoryCache.delete(projectId)
  }
}

/** Clear all in-memory archive caches */
export function clearAllArchiveCaches(): void {
  for (const entry of memoryCache.values()) {
    clearTimeout(entry.timer)
  }
  memoryCache.clear()
}

/**
 * Loads or returns a verified in-memory decrypted archive snapshot.
 * Bounded by a 5-minute idle TTL and verified against the DB revision hash.
 */
export async function getArchiveSnapshot(
  projectId: string,
  abortSignal?: AbortSignal
): Promise<ArchiveSnapshot> {
  const checkAbort = () => {
    if (abortSignal?.aborted) throw new Error('Operation aborted')
  }

  // Probe revision quickly using offset 0, limit 1
  const supabase = getServiceClient()
  const { data: probeData, error: probeError } = await supabase.rpc('mcp_archive_page', {
    p_project_id: projectId,
    p_offset: 0,
    p_limit: 1,
  })

  checkAbort()
  if (probeError || !probeData) {
    throw new Error('Could not access archive metadata')
  }

  const currentRevision = String(probeData.revision)
  const cached = memoryCache.get(projectId)

  if (cached && cached.snapshot.revision === currentRevision) {
    // Reset TTL timer on access
    clearTimeout(cached.timer)
    cached.timer = setTimeout(() => evictArchiveCache(projectId), CACHE_TTL_MS)
    cached.snapshot.verifiedAt = Date.now()
    return cached.snapshot
  }

  // Deduplicate concurrent load requests for the same project
  if (pendingLoads.has(projectId)) {
    return pendingLoads.get(projectId)!
  }

  const loadPromise = (async () => {
    try {
      const totalMessages = Number(probeData.totalMessages)
      if (!Number.isSafeInteger(totalMessages) || totalMessages < 0 || totalMessages > MAX_SNAPSHOT_MESSAGES) {
        throw new Error(`Archive size exceeds supported limit of ${MAX_SNAPSHOT_MESSAGES}`)
      }

      const messages: DecryptedMessage[] = []
      let offset = 0

      while (offset < totalMessages) {
        checkAbort()
        const limit = Math.min(MAX_PAGE_LIMIT, totalMessages - offset)
        const { data: pageData, error: pageError } = await supabase.rpc('mcp_archive_page', {
          p_project_id: projectId,
          p_offset: offset,
          p_limit: limit,
        })

        checkAbort()
        if (pageError || !pageData) {
          throw new Error('Failed to load archive page')
        }

        if (String(pageData.revision) !== currentRevision) {
          throw new Error('Archive revision changed during snapshot retrieval')
        }

        const rows = Array.isArray(pageData.rows) ? pageData.rows : []
        for (const row of rows) {
          checkAbort()
          messages.push({
            id: row.id,
            projectId,
            conversationId: typeof row.conversation_id === 'string' ? row.conversation_id : null,
            replyToId: typeof row.reply_to_id === 'string' ? row.reply_to_id : null,
            sourceId: typeof row.source_id === 'string' ? row.source_id : null,
            sender: await decryptArchiveField(row.sender),
            message: await decryptArchiveField(row.message),
            timestamp: row.timestamp,
          })
        }

        offset += rows.length
        if (rows.length === 0 && offset < totalMessages) {
          throw new Error('Incomplete archive retrieval')
        }
      }

      // Sort chronologically ascending
      messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))

      const snapshot: ArchiveSnapshot = {
        projectId,
        revision: currentRevision,
        messages,
        totalMessages,
        fetchedAt: Date.now(),
        verifiedAt: Date.now(),
      }

      // Clear any prior timer
      if (cached) clearTimeout(cached.timer)

      // Set 5-minute auto-eviction timer
      const timer = setTimeout(() => evictArchiveCache(projectId), CACHE_TTL_MS)
      memoryCache.set(projectId, { snapshot, timer })

      return snapshot
    } finally {
      pendingLoads.delete(projectId)
    }
  })()

  pendingLoads.set(projectId, loadPromise)
  return loadPromise
}
