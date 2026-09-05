import { SessionWindow } from './sessionizer'

export interface BM25Doc {
  id: string
  tokens: string[]
  length: number
}

/**
 * Lightweight in-memory BM25 (Okapi) ranking engine for WhatsApp session windows.
 * Delivers sub-5ms keyword and entity search without waiting for CPU vector embedding.
 */
export class BM25Index {
  private k1: number
  private b: number
  private docCount: number = 0
  private avgDocLength: number = 0
  private docLengths: Map<string, number> = new Map()
  private invertedIndex: Map<string, Map<string, number>> = new Map() // term -> (docId -> termFreq)
  private idfCache: Map<string, number> = new Map()

  constructor(k1: number = 1.2, b: number = 0.75) {
    this.k1 = k1
    this.b = b
  }

  public static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u0D80-\u0DFF]/g, ' ') // Support Latin + Sinhala unicode range
      .split(/\s+/)
      .filter(t => t.length > 1)
  }

  public buildIndex(sessions: SessionWindow[]): void {
    this.docCount = sessions.length
    if (this.docCount === 0) return

    let totalLength = 0
    this.invertedIndex.clear()
    this.docLengths.clear()
    this.idfCache.clear()

    for (const session of sessions) {
      const tokens = BM25Index.tokenize(session.formattedContent)
      const docLength = tokens.length
      this.docLengths.set(session.sessionId, docLength)
      totalLength += docLength

      const termFreqs = new Map<string, number>()
      for (const token of tokens) {
        termFreqs.set(token, (termFreqs.get(token) || 0) + 1)
      }

      for (const [term, freq] of termFreqs.entries()) {
        if (!this.invertedIndex.has(term)) {
          this.invertedIndex.set(term, new Map())
        }
        this.invertedIndex.get(term)!.set(session.sessionId, freq)
      }
    }

    this.avgDocLength = totalLength / this.docCount

    // Precompute IDF for terms in index
    for (const [term, docMap] of this.invertedIndex.entries()) {
      const n = docMap.size
      // Standard Okapi IDF with floor
      const idf = Math.log(1 + (this.docCount - n + 0.5) / (n + 0.5))
      this.idfCache.set(term, Math.max(idf, 0.01))
    }
  }

  public search(query: string, topK: number = 10): { sessionId: string; score: number }[] {
    if (this.docCount === 0) return []

    const queryTokens = BM25Index.tokenize(query)
    const scores = new Map<string, number>()

    for (const token of queryTokens) {
      const docPostings = this.invertedIndex.get(token)
      if (!docPostings) continue

      const idf = this.idfCache.get(token) || 0.01

      for (const [sessionId, tf] of docPostings.entries()) {
        const docLen = this.docLengths.get(sessionId) || this.avgDocLength
        const numerator = tf * (this.k1 + 1)
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength))
        const termScore = idf * (numerator / denominator)

        scores.set(sessionId, (scores.get(sessionId) || 0) + termScore)
      }
    }

    const results = Array.from(scores.entries()).map(([sessionId, score]) => ({
      sessionId,
      score
    }))

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }
}
