import { getServiceClient } from '@/lib/auth'
import { decryptText } from '@/lib/crypto'
import { sessionizeMessages, SessionWindow, RawChatMessage } from './sessionizer'
import { BM25Index } from './bm25'

interface CachedProjectData {
  sessions: SessionWindow[]
  decryptedMsgs: RawChatMessage[]
  bm25Index: BM25Index
  cachedAt: number
}

// In-memory cache holding decrypted sessions and BM25 index
const projectSessionCache = new Map<string, CachedProjectData>()

// 15-minute TTL on in-memory cache
const CACHE_TTL_MS = 15 * 60 * 1000

/**
 * Invalidate cache when new messages are uploaded or re-ingested
 */
export function invalidateProjectSessionCache(projectId: string): void {
  projectSessionCache.delete(projectId)
}

/**
 * Get or load sessions and pre-computed BM25 index with zero-redundancy fetching.
 */
export async function getOrLoadProjectSessions(
  projectId: string,
  passphrase?: string
): Promise<{ sessions: SessionWindow[]; decryptedMsgs: RawChatMessage[]; bm25Index: BM25Index }> {
  const existing = projectSessionCache.get(projectId)
  const now = Date.now()

  if (existing && (now - existing.cachedAt) < CACHE_TTL_MS) {
    return {
      sessions: existing.sessions,
      decryptedMsgs: existing.decryptedMsgs,
      bm25Index: existing.bm25Index
    }
  }

  const supabase = getServiceClient()
  let allChatMsgs: any[] = []
  let offset = 0
  const batchSize = 1000

  // Fetch in batches to prevent PostgREST row limits
  while (true) {
    const { data: chunk, error: chunkErr } = await supabase
      .from('messages')
      .select('sender, message, timestamp')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (chunkErr) {
      console.warn('[SessionCache] Error fetching message chunk:', chunkErr)
      break
    }
    if (!chunk || chunk.length === 0) break
    allChatMsgs.push(...chunk)
    if (chunk.length < batchSize) break
    offset += batchSize
  }

  const decryptedMsgs: RawChatMessage[] = []

  for (const m of allChatMsgs) {
    let decryptedMessage = m.message
    let decryptedSender = m.sender
    let isEncrypted = false

    if (passphrase) {
      try {
        const messageEnc = JSON.parse(m.message)
        if (messageEnc.ciphertext && messageEnc.salt && messageEnc.iv) {
          decryptedMessage = await decryptText(messageEnc.ciphertext, passphrase, messageEnc.salt, messageEnc.iv)
        }
      } catch (e) {}
      try {
        const senderEnc = JSON.parse(m.sender)
        if (senderEnc.ciphertext && senderEnc.salt && senderEnc.iv) {
          decryptedSender = await decryptText(senderEnc.ciphertext, passphrase, senderEnc.salt, senderEnc.iv)
        }
      } catch (e) {}
    } else {
      try {
        const parsed = JSON.parse(m.message)
        if (parsed && typeof parsed === 'object' && parsed.ciphertext && parsed.salt && parsed.iv) {
          isEncrypted = true
        }
      } catch (e) {}
    }

    if (!isEncrypted) {
      decryptedMsgs.push({
        sender: decryptedSender,
        message: decryptedMessage,
        timestamp: m.timestamp
      })
    }
  }

  // Sessionize
  const sessions = sessionizeMessages(decryptedMsgs, {
    gapThresholdMinutes: 45,
    maxMessagesPerWindow: 35,
    overlapMessages: 8
  })

  // Pre-build BM25 Inverted Index once
  const bm25Index = new BM25Index()
  if (sessions.length > 0) {
    bm25Index.buildIndex(sessions)
  }

  const cachedData: CachedProjectData = {
    sessions,
    decryptedMsgs,
    bm25Index,
    cachedAt: now
  }

  projectSessionCache.set(projectId, cachedData)
  return { sessions, decryptedMsgs, bm25Index }
}
