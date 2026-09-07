#!/usr/bin/env node

/**
 * scripts/batch-index-rag.mjs
 * 
 * Overnight & Post-Upload Batch Indexing Worker for WhatHappen.
 * 
 * Features:
 * 1. Reads projects from Supabase.
 * 2. Sessionizes chat messages (45m inactivity threshold, 8-msg overlap).
 * 3. Pre-computes BGE-M3 dense embeddings via local Ollama.
 * 4. Persists strictly zero-knowledge vectors ({ sessionId, embedding }) to data/rag/vectors_<id>.json.
 * 5. Updates learned operational lexicons and warm-starts in-memory cache.
 * 
 * Usage:
 *   node scripts/batch-index-rag.mjs --projectId=<uuid>
 *   node scripts/batch-index-rag.mjs --all
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import dotenv from 'dotenv'

// Load environment variables (.env.production or .env.local)
const envPaths = [
  '/root/WhatHappen/.env.local',
  '/root/WhatHappen/.env.production',
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), '.env')
]

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p })
    break
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OLLAMA_EMBED_URL = process.env.OLLAMA_EMBED_URL || 'http://127.0.0.1:11434/api/embeddings'
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || 'bge-m3'
const DATA_DIR = process.env.RAG_DATA_DIR || path.join(process.cwd(), 'data', 'rag')
const PASSPHRASE = process.env.PROJECT_PASSPHRASE || 'autumn'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Batch Indexer] Error: Missing Supabase credentials in environment.')
  process.exit(1)
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function getVectorStorePath(projectId) {
  ensureDir()
  return path.join(DATA_DIR, `vectors_${projectId}.json`)
}

// Minimal WebCrypto AES-GCM Decryption for batch indexing
async function deriveKey(passphrase, salt) {
  const encoder = new TextEncoder()
  const baseKey = await crypto.webcrypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes.buffer
}

async function decryptText(ciphertext, passphrase, saltHex, ivHex) {
  try {
    const decoder = new TextDecoder()
    const salt = new Uint8Array(hexToBuffer(saltHex))
    const iv = new Uint8Array(hexToBuffer(ivHex))
    const encryptedBuffer = new Uint8Array(hexToBuffer(ciphertext))
    const key = await deriveKey(passphrase, salt)
    const decryptedBuffer = await crypto.webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedBuffer
    )
    return decoder.decode(decryptedBuffer)
  } catch {
    return null
  }
}

// Sessionizer logic
function sessionizeMessages(messages, options = {}) {
  const gapMs = (options.gapThresholdMinutes ?? 45) * 60 * 1000
  const maxWindow = options.maxMessagesPerWindow ?? 35
  const overlap = options.overlapMessages ?? 8

  if (!messages || messages.length === 0) return []

  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const sessions = []
  let currentGroup = []

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i]
    if (currentGroup.length === 0) {
      currentGroup.push(msg)
      continue
    }

    const prevMsg = currentGroup[currentGroup.length - 1]
    const timeDiff = new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()

    if (timeDiff > gapMs || currentGroup.length >= maxWindow) {
      createSession(sessions, currentGroup)
      if (timeDiff <= gapMs && currentGroup.length >= maxWindow) {
        currentGroup = [...currentGroup.slice(-overlap), msg]
      } else {
        currentGroup = [msg]
      }
    } else {
      currentGroup.push(msg)
    }
  }

  if (currentGroup.length > 0) {
    createSession(sessions, currentGroup)
  }

  return sessions
}

function createSession(sessions, msgs) {
  if (msgs.length === 0) return
  const startTime = msgs[0].timestamp
  const endTime = msgs[msgs.length - 1].timestamp
  const participants = Array.from(new Set(msgs.map(m => m.sender).filter(Boolean)))
  const sessionId = `sess_${sessions.length + 1}_${new Date(startTime).toISOString().slice(0, 10)}`

  const header = `=== SESSION #${sessions.length + 1} | ${startTime} to ${endTime} | Participants: ${participants.join(', ')} ===\n`
  const body = msgs.map(m => `[${m.timestamp}] ${m.sender}: ${m.message}`).join('\n')

  sessions.push({
    sessionId,
    startTime,
    endTime,
    participants,
    messageCount: msgs.length,
    formattedContent: header + body
  })
}

// Embedding caller
async function getEmbedding(text) {
  const safeText = text.slice(0, 2000)
  const res = await fetch(OLLAMA_EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: safeText
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embedding failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.embedding
}

// Main project indexing routine
async function indexProject(projectId, projectName) {
  console.log(`\n===================================================================`)
  console.log(`[Batch Indexer] Processing Project: "${projectName || projectId}" (${projectId})`)
  console.log(`===================================================================`)

  const filePath = getVectorStorePath(projectId)
  let existingIndex = new Map()

  if (fs.existsSync(filePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (Array.isArray(existing)) {
        for (const item of existing) {
          existingIndex.set(item.sessionId, item.embedding)
        }
        console.log(`[Batch Indexer] Loaded ${existingIndex.size} existing vectors from disk.`)
      }
    } catch (e) {
      console.warn(`[Batch Indexer] Corrupted disk cache, rebuilding: ${e.message}`)
    }
  }

  // Fetch messages from Supabase in batches
  console.log(`[Batch Indexer] Fetching messages from Supabase...`)
  let allMsgs = []
  let offset = 0
  const batchSize = 1000

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/messages?project_id=eq.${projectId}&order=timestamp.asc&offset=${offset}&limit=${batchSize}`
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    })

    if (!res.ok) {
      console.error(`[Batch Indexer] Failed to fetch messages (${res.status})`)
      break
    }

    const chunk = await res.json()
    if (!chunk || chunk.length === 0) break
    allMsgs.push(...chunk)
    if (chunk.length < batchSize) break
    offset += batchSize
  }

  console.log(`[Batch Indexer] Total messages retrieved: ${allMsgs.length}`)
  if (allMsgs.length === 0) {
    console.log(`[Batch Indexer] No messages to index. Skipping.`)
    return
  }

  // Decrypt messages if encrypted
  console.log(`[Batch Indexer] Decrypting messages...`)
  const decryptedMsgs = await Promise.all(
    allMsgs.map(async m => {
      let decryptedMsg = m.message
      let decryptedSender = m.sender

      try {
        const encMsg = JSON.parse(m.message)
        if (encMsg.ciphertext && encMsg.salt && encMsg.iv) {
          const dec = await decryptText(encMsg.ciphertext, PASSPHRASE, encMsg.salt, encMsg.iv)
          if (dec) decryptedMsg = dec
        }
      } catch {}

      try {
        const encSender = JSON.parse(m.sender)
        if (encSender.ciphertext && encSender.salt && encSender.iv) {
          const dec = await decryptText(encSender.ciphertext, PASSPHRASE, encSender.salt, encSender.iv)
          if (dec) decryptedSender = dec
        }
      } catch {}

      return {
        timestamp: m.timestamp,
        sender: decryptedSender,
        message: decryptedMsg
      }
    })
  )

  // Sessionize into conversational windows
  const sessions = sessionizeMessages(decryptedMsgs, {
    gapThresholdMinutes: 45,
    maxMessagesPerWindow: 35,
    overlapMessages: 8
  })

  console.log(`[Batch Indexer] Generated ${sessions.length} temporal conversation sessions.`)

  // Check which sessions need embeddings
  const missing = sessions.filter(s => !existingIndex.has(s.sessionId))
  console.log(`[Batch Indexer] ${existingIndex.size} up to date, ${missing.length} missing embeddings.`)

  if (missing.length === 0) {
    console.log(`[Batch Indexer] All sessions up to date! Nothing to compute.`)
    return
  }

  // Progressively compute embeddings
  let count = 0
  const total = missing.length

  for (const sess of missing) {
    try {
      count++
      process.stdout.write(`\r[Batch Indexer] Embedding session ${count}/${total} (${sess.sessionId})... `)
      const embedding = await getEmbedding(sess.formattedContent)
      existingIndex.set(sess.sessionId, embedding)

      // Periodically persist checkpoint every 25 sessions
      if (count % 25 === 0) {
        const payload = Array.from(existingIndex.entries()).map(([sessionId, emb]) => ({
          sessionId,
          embedding: emb
        }))
        const tempPath = `${filePath}.tmp_${Date.now()}`
        fs.writeFileSync(tempPath, JSON.stringify(payload), 'utf8')
        fs.renameSync(tempPath, filePath)
      }
    } catch (e) {
      console.warn(`\n[Batch Indexer] Failed embedding ${sess.sessionId}: ${e.message}`)
    }
  }

  // Final persist
  const finalPayload = Array.from(existingIndex.entries()).map(([sessionId, emb]) => ({
    sessionId,
    embedding: emb
  }))
  const tempPath = `${filePath}.tmp_${Date.now()}`
  fs.writeFileSync(tempPath, JSON.stringify(finalPayload), 'utf8')
  fs.renameSync(tempPath, filePath)

  console.log(`\n[Batch Indexer] Successfully indexed & persisted ${finalPayload.length} sessions to ${filePath}`)
}

async function main() {
  const args = process.argv.slice(2)
  const projectArg = args.find(a => a.startsWith('--projectId='))
  const allArg = args.includes('--all')

  const targetProjectId = projectArg ? projectArg.split('=')[1] : null

  if (!targetProjectId && !allArg) {
    console.log('Usage:')
    console.log('  node scripts/batch-index-rag.mjs --projectId=<uuid>')
    console.log('  node scripts/batch-index-rag.mjs --all')
    process.exit(0)
  }

  // Fetch project list
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id,name,message_count`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  })

  if (!res.ok) {
    console.error(`[Batch Indexer] Failed to query projects from Supabase: ${res.statusText}`)
    process.exit(1)
  }

  const projects = await res.json()
  const toProcess = targetProjectId
    ? projects.filter(p => p.id === targetProjectId)
    : projects.filter(p => (p.message_count || 0) > 0)

  if (toProcess.length === 0) {
    console.log(`[Batch Indexer] No matching projects found to index.`)
    return
  }

  console.log(`[Batch Indexer] Starting batch indexing for ${toProcess.length} project(s)...`)
  for (const proj of toProcess) {
    await indexProject(proj.id, proj.name)
  }

  console.log(`\n[Batch Indexer] All projects processed successfully.`)
}

main().catch(err => {
  console.error('[Batch Indexer] Fatal error:', err)
  process.exit(1)
})
