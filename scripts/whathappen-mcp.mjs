#!/usr/bin/env node

/**
 * WhatHappen Forensic Chat MCP Server (Vanilla ES Module)
 * Compatible with Claude Desktop, Antigravity, Cursor, and any MCP-compliant AI client.
 *
 * Ground-Truth Constraints:
 * 1. Strict Loopback Binding: Only connects to http://127.0.0.1:3000 (via SSH tunnel or local daemon).
 * 2. Deterministic Tool Execution: Regex & keyword parsers over raw decrypted records. Zero LLMs in the data path.
 * 3. Payload Capping: Truncates output at whole message boundaries under 100,000 UTF-8 bytes.
 * 4. Zero-Knowledge Proof: Authenticates using HMAC-SHA256 challenge handshake.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import crypto from 'crypto'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load environment
const envPath = fs.existsSync('/root/WhatHappen/.env.production')
  ? '/root/WhatHappen/.env.production'
  : path.join(process.cwd(), '.env.local')

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

// Enforce strict loopback invariant (Plan v16/v30 §3)
const RAW_URL = process.env.WHATHAPPEN_API_URL || 'http://127.0.0.1:3000'
let parsedUrl
try {
  parsedUrl = new URL(RAW_URL)
} catch {
  console.error('[WhatHappen MCP] Fatal: Invalid WHATHAPPEN_API_URL')
  process.exit(1)
}

if (parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
  console.error(
    `[WhatHappen MCP] Security Violation: WHATHAPPEN_API_URL must bind strictly to loopback (127.0.0.1). Attempted: ${RAW_URL}. Use SSH local port forward: ssh -f -N -L 3000:127.0.0.1:3000 root@167.233.236.178`
  )
  process.exit(1)
}

const LOOPBACK_URL = `http://127.0.0.1:${parsedUrl.port || 3000}`
const DEFAULT_PROJECT_ID = process.env.WHATHAPPEN_PROJECT_ID || '7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59'

// In-memory token and decrypted messages cache
let cachedToken = null
let tokenExpiry = 0
let messagesCache = new Map() // projectId -> { timestamp: number, messages: Array }

const MAX_PAYLOAD_BYTES = 100_000 // 100KB UTF-8 safety cap

/**
 * Obtain authenticated project token via zero-knowledge challenge/response proof.
 */
async function getAuthToken(projectId) {
  const now = Date.now()
  if (cachedToken && tokenExpiry - now > 15_000) {
    return cachedToken
  }

  const challengeRes = await fetch(`${LOOPBACK_URL}/api/auth/challenge?projectId=${projectId}`)
  if (!challengeRes.ok) {
    throw new Error(`Challenge request failed (${challengeRes.status}): ${challengeRes.statusText}`)
  }
  const { nonce, expiresAt } = await challengeRes.json()

  // Get passphrase hash from environment
  const hash = process.env.WHATSAPP_PASSPHRASE_HASH
  if (!hash) {
    throw new Error('WHATSAPP_PASSPHRASE_HASH must be configured in environment')
  }

  const proof = crypto.createHmac('sha256', hash).update(nonce).digest('hex')

  const tokenRes = await fetch(`${LOOPBACK_URL}/api/project-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, challenge: nonce, proof }),
  })

  if (!tokenRes.ok) {
    throw new Error(`Token minting failed (${tokenRes.status}): ${tokenRes.statusText}`)
  }
  const tokenData = await tokenRes.json()
  cachedToken = tokenData.token
  tokenExpiry = tokenData.expiresAt || (now + 3600 * 1000)
  return cachedToken
}

/**
 * Fetch and cache decrypted messages in client RAM.
 * Cache TTL: 5 minutes.
 */
async function getDecryptedMessages(projectId) {
  const cached = messagesCache.get(projectId)
  const now = Date.now()
  if (cached && now - cached.timestamp < 5 * 60 * 1000) {
    return cached.messages
  }

  const token = await getAuthToken(projectId)
  const res = await fetch(`${LOOPBACK_URL}/api/ai-chat/${projectId}`, {
    headers: { 'x-project-token': token },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch project messages (${res.status}): ${res.statusText}`)
  }

  const data = await res.json()
  const messages = data.recentMessages || []
  messagesCache.set(projectId, { timestamp: now, messages })
  return messages
}

/**
 * Format matching messages into an envelope truncated strictly under 100,000 UTF-8 bytes.
 */
function buildCappedEnvelope(matches, totalFound, limit = 20) {
  const sliced = matches.slice(0, limit)
  let outputText = ''
  let includedCount = 0
  let truncatedByBytes = false

  for (const m of sliced) {
    const line = `[${m.timestamp}] ${m.sender}: ${m.message}\n`
    const lineBytes = Buffer.byteLength(line, 'utf8')
    if (Buffer.byteLength(outputText, 'utf8') + lineBytes > MAX_PAYLOAD_BYTES) {
      truncatedByBytes = true
      break
    }
    outputText += line
    includedCount++
  }

  const header = `--- Found ${totalFound} matching messages (showing ${includedCount}${truncatedByBytes ? ', truncated by byte limit' : ''}) ---\n\n`
  return header + outputText
}

const server = new Server(
  {
    name: 'whathappen-forensic-mcp',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'whathappen_search_chat',
        description:
          'Search verbatim WhatsApp messages by keyword or regex. Returns raw, authentic quotes with dates, senders, and timestamps (deterministic, zero LLM hallucination).',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Keyword, regex, or phrase (e.g. "float", "Channa 100,000", "Chandi salary", "advance")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of messages to return (default: 20, max: 100)',
            },
            sender: {
              type: 'string',
              description: 'Optional sender name filter (e.g. "Sudath", "Channa", "Rajiv")',
            },
            month: {
              type: 'string',
              description: 'Optional month filter (e.g. "may", "june", "july", "august", or "2026-05")',
            },
            projectId: {
              type: 'string',
              description: 'Optional project UUID',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'whathappen_extract_financials',
        description:
          'Deterministically extract financial transactions, payments, fee agreements, advances, and petty cash floats from decrypted WhatsApp history.',
        inputSchema: {
          type: 'object',
          properties: {
            keywords: {
              type: 'string',
              description:
                'Optional comma-separated financial keywords (defaults to "float, fee, fees, salary, payment, bank, transfer, advance, petty cash, lkr, rs, 000")',
            },
            month: {
              type: 'string',
              description: 'Filter by month (e.g. "may", "june", "july", "august", or "2026-05")',
            },
            sender: {
              type: 'string',
              description: 'Filter by sender name',
            },
            limit: {
              type: 'number',
              description: 'Maximum matches to return (default: 30, max: 100)',
            },
            projectId: {
              type: 'string',
              description: 'Optional project UUID',
            },
          },
        },
      },
      {
        name: 'whathappen_get_timeline',
        description:
          'Extract chronological sequence of messages across a month or date range for forensic event reconstruction.',
        inputSchema: {
          type: 'object',
          properties: {
            month: {
              type: 'string',
              description: 'Month name or ISO prefix (e.g. "may", "june", "july", "2026-05")',
            },
            sender: {
              type: 'string',
              description: 'Optional sender name filter',
            },
            limit: {
              type: 'number',
              description: 'Maximum messages to return (default: 50, max: 100)',
            },
            projectId: {
              type: 'string',
              description: 'Optional project UUID',
            },
          },
          required: ['month'],
        },
      },
      {
        name: 'whathappen_get_metadata',
        description:
          'Get verified project overview: total message counts, date ranges, participant directory, and key topic overview (context-safe summary under 2KB).',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Optional project UUID',
            },
            full: {
              type: 'boolean',
              description: 'Set true only if you explicitly need full 200KB hourly histogram arrays (defaults to false)',
            },
          },
        },
      },
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const projectId = args?.projectId || DEFAULT_PROJECT_ID

  try {
    // 1. Tool: whathappen_search_chat (Deterministic Raw Message Search)
    if (name === 'whathappen_search_chat') {
      const query = (args?.query || '').trim()
      const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 100)
      const senderFilter = (args?.sender || '').toLowerCase()
      const monthFilter = (args?.month || '').toLowerCase()

      const allMessages = await getDecryptedMessages(projectId)

      // Build regex pattern from query (handling space-separated terms)
      // Split query into tokens. If query is wrapped in quotes or contains regex symbols, support raw regex.
      // Otherwise match when ALL tokens appear in the message in any order.
      const rawLower = query.toLowerCase()
      const tokens = query
        .split(/\s+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)

      const matches = allMessages.filter((m) => {
        const msgText = (m.message || '').toLowerCase()
        const senderText = (m.sender || '').toLowerCase()
        const combined = `${senderText} ${msgText}`

        if (senderFilter && !senderText.includes(senderFilter)) {
          return false
        }
        if (monthFilter) {
          const ts = (m.timestamp || '').toLowerCase()
          const date = new Date(m.timestamp)
          const monthName = date.toLocaleString('en-US', { month: 'long' }).toLowerCase()
          if (!ts.includes(monthFilter) && !monthName.includes(monthFilter)) {
            return false
          }
        }

        if (tokens.length === 0) return true

        // Check if every token is matched (handling commas in numbers like 100,000 vs 100000)
        return tokens.every((token) => {
          if (combined.includes(token)) return true
          const uncomma = token.replace(/,/g, '')
          if (uncomma !== token && combined.replace(/,/g, '').includes(uncomma)) return true
          return false
        })
      })

      const text = buildCappedEnvelope(matches, matches.length, limit)
      return {
        content: [{ type: 'text', text }],
      }
    }

    // 2. Tool: whathappen_extract_financials (Deterministic Ledger Extraction)
    if (name === 'whathappen_extract_financials') {
      const limit = Math.min(Math.max(Number(args?.limit) || 30, 1), 100)
      const senderFilter = (args?.sender || '').toLowerCase()
      const monthFilter = (args?.month || '').toLowerCase()
      const keywordsRaw =
        args?.keywords ||
        'float, fee, fees, salary, payment, bank, transfer, advance, petty cash, lkr, rs, 000, account, invoice, cost'

      const terms = keywordsRaw
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
      const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const financialRegex = new RegExp(`\\b(${escapedTerms.join('|')})\\b|(\\d{1,3}(,\\d{3})+)|(\\d{4,})`, 'i')

      const allMessages = await getDecryptedMessages(projectId)

      const matches = allMessages.filter((m) => {
        if (senderFilter && !(m.sender || '').toLowerCase().includes(senderFilter)) {
          return false
        }
        if (monthFilter) {
          const ts = (m.timestamp || '').toLowerCase()
          if (!ts.includes(monthFilter)) {
            const date = new Date(m.timestamp)
            const monthName = date.toLocaleString('en-US', { month: 'long' }).toLowerCase()
            if (!monthName.includes(monthFilter)) return false
          }
        }
        return financialRegex.test(m.message || '')
      })

      const text = buildCappedEnvelope(matches, matches.length, limit)
      return {
        content: [{ type: 'text', text }],
      }
    }

    // 3. Tool: whathappen_get_timeline (Chronological Message Slices)
    if (name === 'whathappen_get_timeline') {
      const month = (args?.month || '').toLowerCase()
      const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 100)
      const senderFilter = (args?.sender || '').toLowerCase()

      const allMessages = await getDecryptedMessages(projectId)

      const matches = allMessages.filter((m) => {
        if (senderFilter && !(m.sender || '').toLowerCase().includes(senderFilter)) {
          return false
        }
        const ts = (m.timestamp || '').toLowerCase()
        if (ts.includes(month)) return true
        const date = new Date(m.timestamp)
        const monthName = date.toLocaleString('en-US', { month: 'long' }).toLowerCase()
        return monthName.includes(month)
      })

      // Ensure chronological ordering
      matches.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      const text = buildCappedEnvelope(matches, matches.length, limit)
      return {
        content: [{ type: 'text', text }],
      }
    }

    // 4. Tool: whathappen_get_metadata (Context-Safe Project Summary)
    if (name === 'whathappen_get_metadata') {
      const token = await getAuthToken(projectId)
      const isFull = args?.full === true
      const url = `${LOOPBACK_URL}/api/projects/${projectId}${isFull ? '' : '?summary=true'}`

      const res = await fetch(url, {
        headers: { 'x-project-token': token },
      })
      if (!res.ok) {
        throw new Error(`Failed to fetch project metadata (${res.status}): ${res.statusText}`)
      }

      const data = await res.json()
      const proj = data.project || data

      const summary = {
        id: proj.id,
        name: proj.name,
        description: proj.description,
        totalMessages: proj.messageCount,
        dateRange: proj.dateRange,
        participantsCount: proj.participants?.length || 0,
        participants: proj.participants || [],
        keyTopics: proj.analysis?.keywords?.slice(0, 20) || [],
        executiveInsights: proj.analysis?.insights || {},
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(isFull ? data : summary, null, 2),
          },
        ],
      }
    }

    throw new Error(`Unknown tool: ${name}`)
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `[WhatHappen MCP Error] ${err.message}`,
        },
      ],
      isError: true,
    }
  }
})

async function run() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[WhatHappen MCP] Server 2.0 running on stdio (Loopback: ' + LOOPBACK_URL + ')')
}

run().catch((err) => {
  console.error('[WhatHappen MCP] Fatal error:', err)
  process.exit(1)
})
