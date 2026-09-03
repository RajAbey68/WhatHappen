import { SessionWindow } from './sessionizer'

export interface EmbeddedSession {
  session: SessionWindow
  embedding: number[]
}

// In-memory embedding cache keyed by projectId
const vectorStoreCache = new Map<string, EmbeddedSession[]>()

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

  // Lazy index on first query or if session count changed
  if (!embedded || embedded.length !== sessions.length) {
    embedded = []
    console.log(`[RAG] Generating bge-m3 embeddings for ${sessions.length} session windows...`)

    // Embed in sequential batches to protect Hermes CPU
    for (let i = 0; i < sessions.length; i++) {
      const sess = sessions[i]
      try {
        const emb = await getEmbedding(sess.formattedContent)
        embedded.push({ session: sess, embedding: emb })
      } catch (e) {
        console.warn(`[RAG] Skipping session ${sess.sessionId} embedding error:`, e)
      }
    }
    vectorStoreCache.set(projectId, embedded)
    console.log(`[RAG] Successfully indexed ${embedded.length} sessions in RAM.`)
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
