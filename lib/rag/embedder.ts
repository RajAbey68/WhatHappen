import fs from 'fs'
import path from 'path'
import { SessionWindow } from './sessionizer'

export interface EmbeddedSession {
  session: SessionWindow
  embedding: number[]
}

// Minimal disk schema for zero-knowledge vector persistence (RAJ-951)
// Never writes session message content, participants, or plaintext to disk.
export interface PersistedVectorEntry {
  sessionId: string
  embedding: number[]
}

// Data directory for persistent vector storage
const DATA_DIR = process.env.RAG_DATA_DIR || path.join(process.cwd(), 'data', 'rag')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function getVectorStorePath(projectId: string): string {
  ensureDir()
  return path.join(DATA_DIR, `vectors_${projectId}.json`)
}

// In-memory embedding cache keyed by projectId
const vectorStoreCache = new Map<string, EmbeddedSession[]>()

/**
 * Load vector store from disk and re-hydrate with current in-memory sessions (RAJ-951).
 * Avoids keeping plaintext on disk while retaining instant vector warm-starts.
 */
function loadVectorStoreFromDisk(projectId: string, currentSessions: SessionWindow[]): EmbeddedSession[] | null {
  try {
    const filePath = getVectorStorePath(projectId)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const sessionMap = new Map<string, SessionWindow>()
        for (const s of currentSessions) {
          sessionMap.set(s.sessionId, s)
        }

        const rehydrated: EmbeddedSession[] = []
        for (const item of parsed) {
          // Handle both old schema (with .session object) and new zero-knowledge schema
          const sId = item.sessionId || item.session?.sessionId
          const matchedSession = sessionMap.get(sId)
          if (matchedSession && Array.isArray(item.embedding)) {
            rehydrated.push({ session: matchedSession, embedding: item.embedding })
          }
        }

        if (rehydrated.length > 0) {
          console.log(`[RAG] Re-hydrated ${rehydrated.length} zero-knowledge vector embeddings from disk for project ${projectId}`)
          return rehydrated
        }
      }
    }
  } catch (err) {
    console.warn(`[RAG] Failed to load disk vector cache for project ${projectId}:`, err)
  }
  return null
}

/**
 * Save vector store to disk atomically with ZERO plaintext (RAJ-951).
 * Stores only sessionId + embedding vector.
 */
function saveVectorStoreToDisk(projectId: string, data: EmbeddedSession[]): void {
  try {
    const filePath = getVectorStorePath(projectId)
    const tempPath = `${filePath}.tmp_${Date.now()}`
    const diskPayload: PersistedVectorEntry[] = data.map(item => ({
      sessionId: item.session.sessionId,
      embedding: item.embedding
    }))
    fs.writeFileSync(tempPath, JSON.stringify(diskPayload), 'utf8')
    fs.renameSync(tempPath, filePath)
    console.log(`[RAG] Persisted ${diskPayload.length} zero-knowledge vectors (no plaintext) to disk at ${filePath}`)
  } catch (err) {
    console.warn(`[RAG] Failed to write vector cache to disk for project ${projectId}:`, err)
  }
}

/**
 * Invalidate vector cache for a project (e.g. after new messages are uploaded).
 */
export function invalidateVectorCache(projectId: string): void {
  vectorStoreCache.delete(projectId)
  try {
    const filePath = getVectorStorePath(projectId)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`[RAG] Invalidated disk vector cache for project ${projectId}`)
    }
  } catch (err) {
    console.warn(`[RAG] Failed to delete disk vector cache for ${projectId}:`, err)
  }
}

/**
 * Compute embeddings using bge-m3 on local Ollama daemon on Hermes-Dev.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const ollamaUrl = process.env.OLLAMA_EMBED_URL || 'http://127.0.0.1:11434/api/embeddings'
  const model = process.env.OLLAMA_EMBED_MODEL || 'bge-m3'

  // Cap text to 2,000 characters to strictly respect Ollama bge-m3 context limits
  const safeText = text.slice(0, 2000)

  const res = await fetch(ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: safeText
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Local Ollama embedding failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error('Invalid embedding response from Ollama')
  }

  return data.embedding
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * Search the in-memory vector store for the most relevant session windows.
 */
export async function retrieveRelevantSessions(
  projectId: string,
  sessions: SessionWindow[],
  query: string,
  topK: number = 6
): Promise<{ session: SessionWindow; score: number }[]> {
  let embedded = vectorStoreCache.get(projectId)

  // 1. Try warm start from disk if memory is cold (re-hydrating from passed sessions)
  if (!embedded) {
    const diskStore = loadVectorStoreFromDisk(projectId, sessions)
    if (diskStore && diskStore.length > 0) {
      embedded = diskStore
      vectorStoreCache.set(projectId, embedded)
    }
  }

  if (!embedded) {
    embedded = []
  }

  // 2. Identify which sessions need embeddings
  const existingSessionIds = new Set(embedded.map(e => e.session.sessionId))
  const missingSessions = sessions.filter(s => !existingSessionIds.has(s.sessionId))

  // If missing sessions exist, embed candidate window (prioritize most recent up to 20 to avoid CPU stalls)
  if (missingSessions.length > 0) {
    const toEmbed = missingSessions.slice(-25)
    console.log(`[RAG] Progressively embedding ${toEmbed.length} new sessions for project ${projectId}...`)

    for (const sess of toEmbed) {
      try {
        const emb = await getEmbedding(sess.formattedContent)
        embedded.push({ session: sess, embedding: emb })
        existingSessionIds.add(sess.sessionId)
      } catch (e) {
        console.warn(`[RAG] Skipping session ${sess.sessionId} embedding error:`, e)
      }
    }

    // Persist incrementally to disk
    vectorStoreCache.set(projectId, embedded)
    saveVectorStoreToDisk(projectId, embedded)
    console.log(`[RAG] Incremental index now holds ${embedded.length} persisted sessions.`)
  }

  // Embed query
  const queryEmbedding = await getEmbedding(query)

  // Rank sessions
  const scored = embedded.map(item => ({
    session: item.session,
    score: cosineSimilarity(queryEmbedding, item.embedding)
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}
