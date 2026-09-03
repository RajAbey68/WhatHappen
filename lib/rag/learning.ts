import fs from 'fs'
import path from 'path'
import { getEmbedding, cosineSimilarity } from './embedder'

export interface LexiconEntry {
  term: string
  synonyms: string[]
  contextNote?: string
}

export interface GoldenQA {
  id: string
  projectId: string
  queryText: string
  verifiedResponse: string
  citedMessageIds: string[]
  embedding: number[]
  accuracyScore: number
  createdAt: string
}

export interface FeedbackRecord {
  id: string
  projectId: string
  rawQuery: string
  rawResponse: string
  feedbackType: 'confirmed' | 'corrected' | 'disputed'
  userNotes?: string
  createdAt: string
}

// Storage paths on disk (retained across process restarts)
const DATA_DIR = process.env.RAG_DATA_DIR || path.join(process.cwd(), 'data', 'rag')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function getLexiconPath(projectId: string): string {
  ensureDir()
  return path.join(DATA_DIR, `lexicon_${projectId}.json`)
}

function getGoldenQAPath(projectId: string): string {
  ensureDir()
  return path.join(DATA_DIR, `golden_qa_${projectId}.json`)
}

function getFeedbackPath(projectId: string): string {
  ensureDir()
  return path.join(DATA_DIR, `feedback_${projectId}.json`)
}

// Default baseline lexicon seeds for Ko Lake Villa operations
const BASELINE_LEXICON: LexiconEntry[] = [
  {
    term: 'float',
    synonyms: ['50k', '50,000', 'advance', 'raw materials', 'cash', 'petty cash', 'expenses'],
    contextNote: 'Operational cash float managed with Sudath / Channa'
  },
  {
    term: 'channa',
    synonyms: ['Sudath Manager Channa', 'Sudath', 'Channa Lawn Chamila', 'Channa STC'],
    contextNote: 'Key operations manager and contractor liaison'
  },
  {
    term: 'themiya',
    synonyms: ['Themiya. Crew Abhisheka', 'Themiya', 'Abhisheka'],
    contextNote: 'Crew member purchasing materials and operational support'
  },
  {
    term: 'payment',
    synonyms: ['salli', 'transfer', 'slip', 'receipt', 'dala', 'transferred', 'sent'],
    contextNote: 'Financial transactions and bank transfers'
  }
]

/**
 * Read the active operational lexicon for a project.
 */
export function getLexicon(projectId: string): LexiconEntry[] {
  const filePath = getLexiconPath(projectId)
  if (!fs.existsSync(filePath)) {
    // Seed baseline
    saveLexicon(projectId, BASELINE_LEXICON)
    return BASELINE_LEXICON
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    console.error('Failed to read lexicon:', e)
    return BASELINE_LEXICON
  }
}

/**
 * Save / update the operational lexicon for a project.
 */
export function saveLexicon(projectId: string, lexicon: LexiconEntry[]) {
  const filePath = getLexiconPath(projectId)
  fs.writeFileSync(filePath, JSON.stringify(lexicon, null, 2), 'utf8')
}

/**
 * Expand user query using learned operational lexicon.
 */
export function expandQueryWithLexicon(projectId: string, query: string): string {
  const lexicon = getLexicon(projectId)
  const lower = query.toLowerCase()
  const expansions: string[] = []

  for (const entry of lexicon) {
    const termMatches = lower.includes(entry.term.toLowerCase())
    const synonymMatches = entry.synonyms.some(s => lower.includes(s.toLowerCase()))

    if (termMatches || synonymMatches) {
      // Add relevant synonym terms to search context
      const newTerms = [entry.term, ...entry.synonyms].filter(t => !lower.includes(t.toLowerCase()))
      if (newTerms.length > 0) {
        expansions.push(...newTerms.slice(0, 4))
      }
    }
  }

  if (expansions.length > 0) {
    const uniqueExpansions = Array.from(new Set(expansions)).join(' ')
    return `${query} (Search context: ${uniqueExpansions})`
  }

  return query
}

/**
 * Read the Golden Q&A Cache for a project.
 */
export function getGoldenQAList(projectId: string): GoldenQA[] {
  const filePath = getGoldenQAPath(projectId)
  if (!fs.existsSync(filePath)) return []
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    console.error('Failed to read golden QA cache:', e)
    return []
  }
}

/**
 * Save a newly verified Golden Q&A entry.
 */
export async function commitGoldenQA(
  projectId: string,
  queryText: string,
  verifiedResponse: string,
  citedMessageIds: string[] = []
): Promise<GoldenQA> {
  const list = getGoldenQAList(projectId)
  const embedding = await getEmbedding(queryText)

  const newEntry: GoldenQA = {
    id: `gqa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    projectId,
    queryText,
    verifiedResponse,
    citedMessageIds,
    embedding,
    accuracyScore: 1.0,
    createdAt: new Date().toISOString()
  }

  list.push(newEntry)
  fs.writeFileSync(getGoldenQAPath(projectId), JSON.stringify(list, null, 2), 'utf8')
  return newEntry
}

/**
 * Instant cache lookup: check if a verified answer already exists with >=0.92 cosine similarity.
 */
export async function lookupGoldenCache(
  projectId: string,
  queryText: string,
  similarityThreshold: number = 0.92
): Promise<GoldenQA | null> {
  const list = getGoldenQAList(projectId)
  if (list.length === 0) return null

  const queryEmbedding = await getEmbedding(queryText)
  let bestMatch: GoldenQA | null = null
  let highestScore = 0

  for (const item of list) {
    if (!item.embedding || item.embedding.length === 0) continue
    const score = cosineSimilarity(queryEmbedding, item.embedding)
    if (score > highestScore) {
      highestScore = score
      bestMatch = item
    }
  }

  if (highestScore >= similarityThreshold && bestMatch) {
    console.log(`[Learning RAG] Instant Golden Cache HIT! Score: ${highestScore.toFixed(3)} for query: "${queryText}"`)
    return bestMatch
  }

  return null
}

/**
 * Pull the most relevant 1-2 verified Golden Q&A exemplars to inject as few-shot demonstrations.
 */
export function getFewShotExemplars(projectId: string, maxExemplars: number = 1): string {
  const list = getGoldenQAList(projectId)
  if (list.length === 0) return ''

  const selected = list.slice(-maxExemplars)
  let exemplarStr = '\n### VERIFIED GOLDEN FEW-SHOT DEMONSTRATIONS (Follow this exact reasoning standard):\n'

  for (let i = 0; i < selected.length; i++) {
    const item = selected[i]
    exemplarStr += `Example ${i + 1} Question: "${item.queryText}"\n`
    exemplarStr += `Example ${i + 1} Verified Output:\n${item.verifiedResponse}\n\n`
  }

  return exemplarStr
}

/**
 * Log user feedback (confirmation or correction).
 */
export function logFeedback(
  projectId: string,
  record: Omit<FeedbackRecord, 'id' | 'createdAt'>
): FeedbackRecord {
  ensureDir()
  const filePath = getFeedbackPath(projectId)
  const list: FeedbackRecord[] = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : []

  const newRecord: FeedbackRecord = {
    ...record,
    id: `fb_${Date.now()}`,
    createdAt: new Date().toISOString()
  }

  list.push(newRecord)
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8')
  return newRecord
}

/**
 * Invalidate all golden Q&A entries for a project (e.g. when new messages are uploaded).
 */
export function invalidateGoldenCache(projectId: string): void {
  try {
    const filePath = getGoldenQAPath(projectId)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`[Learning RAG] Invalidated Golden Q&A cache for project ${projectId}`)
    }
  } catch (err) {
    console.warn(`[Learning RAG] Failed to delete Golden Q&A cache for ${projectId}:`, err)
  }
}
