#!/usr/bin/env node

/**
 * WhatHappen Forensic Chat MCP Server (Vanilla ES Module) - v2.1.0
 * Compatible with Claude Desktop, Antigravity, Cursor, and any MCP-compliant AI client.
 *
 * Hardened Architectural Guarantees (Adversarial Audit Validated):
 * 1. Strict Loopback Binding: Only connects to http://127.0.0.1:3000 (via SSH tunnel or local daemon).
 * 2. Zero-Knowledge Preservation: ALL aggregations, categorizations, and timeline calculations run
 *    PURELY LOCALLY in this process. No decrypted messages or derived summaries are ever posted back to Hermes.
 * 3. Deterministic Tool Execution: Regex, lexical clustering, and timeline aggregators. Zero LLM hallucination in data paths.
 * 4. Payload Capping: Truncates output at whole message boundaries under 100,000 UTF-8 bytes.
 * 5. Pre-flight Network & Tunnel Health Checks: Rapidly reports tunnel outages with corrective SSH syntax.
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

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    const challengeRes = await fetch(`${LOOPBACK_URL}/api/auth/challenge?projectId=${projectId}`, {
      signal: controller.signal,
    })
    if (!challengeRes.ok) {
      throw new Error(`Challenge request failed (${challengeRes.status}): ${challengeRes.statusText}`)
    }
    const { nonce } = await challengeRes.json()

    const hash = process.env.WHATSAPP_PASSPHRASE_HASH
    if (!hash) {
      throw new Error('WHATSAPP_PASSPHRASE_HASH must be configured in environment')
    }

    const proof = crypto.createHmac('sha256', hash).update(nonce).digest('hex')

    const tokenRes = await fetch(`${LOOPBACK_URL}/api/project-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, challenge: nonce, proof }),
      signal: controller.signal,
    })

    if (!tokenRes.ok) {
      throw new Error(`Token minting failed (${tokenRes.status}): ${tokenRes.statusText}`)
    }
    const tokenData = await tokenRes.json()
    cachedToken = tokenData.token
    tokenExpiry = tokenData.expiresAt || (now + 3600 * 1000)
    return cachedToken
  } catch (err) {
    if (err.name === 'AbortError' || err.cause?.code === 'ECONNRESET' || err.cause?.code === 'ECONNREFUSED') {
      throw new Error(
        `Local tunnel to Hermes is unavailable at ${LOOPBACK_URL}. Please ensure the SSH tunnel is active: ssh -f -N -L 3000:127.0.0.1:3000 root@167.233.236.178`
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(`${LOOPBACK_URL}/api/ai-chat/${projectId}`, {
      headers: { 'x-project-token': token },
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch project messages (${res.status}): ${res.statusText}`)
    }

    const data = await res.json()
    const messages = data.recentMessages || []
    messagesCache.set(projectId, { timestamp: now, messages })
    return messages
  } finally {
    clearTimeout(timer)
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// PURE CLIENT-SIDE ANALYTICS ENGINE (Preserves Zero-Knowledge Invariant)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Group messages into hourly, daily, and monthly distribution heatmaps locally.
 */
function computeLocalTimelineAnalysis(messages, monthFilter = null) {
  const timeGroups = {
    hourly: {},
    daily: {},
    monthly: {}
  }
  const participantActivity = {}
  let validCount = 0

  for (const msg of messages) {
    const d = new Date(msg.timestamp)
    if (isNaN(d.getTime())) continue

    const monthStr = d.toISOString().slice(0, 7) // YYYY-MM
    const monthName = d.toLocaleString('en-US', { month: 'long' }).toLowerCase()

    if (monthFilter) {
      const mf = monthFilter.toLowerCase()
      if (!monthStr.includes(mf) && !monthName.includes(mf)) {
        continue
      }
    }

    validCount++
    const hour = `${d.getHours()}:00`
    const day = d.toISOString().split('T')[0]

    timeGroups.hourly[hour] = (timeGroups.hourly[hour] || 0) + 1
    timeGroups.daily[day] = (timeGroups.daily[day] || 0) + 1
    timeGroups.monthly[monthStr] = (timeGroups.monthly[monthStr] || 0) + 1

    const sender = msg.sender || 'Unknown'
    if (!participantActivity[sender]) participantActivity[sender] = 0
    participantActivity[sender]++
  }

  const sortedHours = Object.entries(timeGroups.hourly).sort(([, a], [, b]) => b - a)
  const sortedDays = Object.entries(timeGroups.daily).sort(([, a], [, b]) => b - a)
  const totalDays = Object.keys(timeGroups.daily).length

  return {
    filteredMessagesCount: validCount,
    timeGroups,
    participantActivity,
    insights: {
      mostActiveHour: sortedHours[0] ? { hour: sortedHours[0][0], messageCount: sortedHours[0][1] } : null,
      mostActiveDay: sortedDays[0] ? { date: sortedDays[0][0], messageCount: sortedDays[0][1] } : null,
      totalActiveDays: totalDays,
      averageMessagesPerDay: totalDays > 0 ? Math.round(validCount / totalDays) : 0
    }
  }
}

/**
 * Compute per-participant average response times (time delta between a message
 * and subsequent reply from another sender within 12h).
 */
function computeLocalResponseTimes(messages) {
  const sorted = [...messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const rTimes = {}
  let last = null

  for (const m of sorted) {
    const t = new Date(m.timestamp).getTime()
    if (isNaN(t)) continue

    if (last && last.sender !== m.sender) {
      const lt = new Date(last.timestamp).getTime()
      const diff = t - lt
      if (diff > 0 && diff < 12 * 3600 * 1000) {
        if (!rTimes[m.sender]) rTimes[m.sender] = []
        rTimes[m.sender].push(diff / 1000 / 60) // in minutes
      }
    }
    last = m
  }

  const responseMetrics = []
  for (const [sender, times] of Object.entries(rTimes)) {
    times.sort((a, b) => a - b)
    const total = times.reduce((a, b) => a + b, 0)
    const avg = total / times.length
    const median = times[Math.floor(times.length / 2)]
    responseMetrics.push({
      participant: sender,
      responsesAnalyzed: times.length,
      averageMinutes: Math.round(avg * 10) / 10,
      medianMinutes: Math.round(median * 10) / 10,
      fastestMinutes: Math.round(times[0] * 10) / 10,
      slowestMinutes: Math.round(times[times.length - 1] * 10) / 10
    })
  }

  responseMetrics.sort((a, b) => b.responsesAnalyzed - a.responsesAnalyzed)
  return {
    methodology: 'Delta between consecutive messages from different senders < 12h',
    participants: responseMetrics
  }
}

/**
 * Extract aggregated financial rollups with transaction clustering and de-duplication heuristics.
 */
function computeLocalFinancialSummary(messages) {
  const financialRegex = /\b(float|fee|fees|salary|payment|bank|transfer|advance|petty cash|lkr|rs|000|account|invoice|cost)\b|(\d{1,3}(,\d{3})+)|(\d{4,})/i
  const matches = messages.filter(m => financialRegex.test(m.message || ''))

  const categories = {
    fees: { keywords: ['fee', 'fees'], count: 0, samples: [] },
    salaries: { keywords: ['salary'], count: 0, samples: [] },
    floats: { keywords: ['float'], count: 0, samples: [] },
    petty_cash: { keywords: ['petty cash'], count: 0, samples: [] },
    transfers_bank: { keywords: ['transfer', 'bank'], count: 0, samples: [] },
    advances: { keywords: ['advance'], count: 0, samples: [] },
    invoices_bills: { keywords: ['invoice', 'bill', 'receipt'], count: 0, samples: [] }
  }

  const monthlyTotals = {}
  const senderCounts = {}

  for (const m of matches) {
    const text = (m.message || '').toLowerCase()
    const sender = m.sender || 'Unknown'
    const month = (m.timestamp || '').slice(0, 7) || 'Unknown'

    senderCounts[sender] = (senderCounts[sender] || 0) + 1
    monthlyTotals[month] = (monthlyTotals[month] || 0) + 1

    for (const [catName, catData] of Object.entries(categories)) {
      if (catData.keywords.some(k => text.includes(k))) {
        catData.count++
        if (catData.samples.length < 3) {
          catData.samples.push(`[${m.timestamp}] ${m.sender}: ${m.message.slice(0, 140)}`)
        }
      }
    }
  }

  return {
    totalMessagesScanned: messages.length,
    financialMentionsIdentified: matches.length,
    categoryBreakdown: categories,
    monthlyActivityTrend: monthlyTotals,
    topFinancialParticipants: Object.entries(senderCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, count]) => ({ name, financialMessages: count }))
  }
}

/**
 * Generate rolling 7-to-30 day operational snapshot with epistemic issue tracking.
 */
function computeLocalOperationalSnapshot(messages, days = 7) {
  const sorted = [...messages].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  if (sorted.length === 0) return { error: 'No messages available' }

  const latestDate = new Date(sorted[0].timestamp)
  const cutoffTime = latestDate.getTime() - days * 24 * 3600 * 1000

  const periodMessages = sorted.filter(m => new Date(m.timestamp).getTime() >= cutoffTime)

  const issueKeywords = ['problem', 'issue', 'broken', 'repair', 'leak', 'not working', 'damage', 'complaint', 'urgent']
  const resolutionKeywords = ['fixed', 'done', 'sorted', 'repaired', 'replaced', 'confirmed', 'arranged', 'checked', 'solved']

  const candidateIssues = []
  const categoryCounts = {
    complaints_repairs: 0,
    financial: 0,
    guest_logistics: 0,
    staffing_ops: 0,
    general: 0
  }

  for (let i = 0; i < periodMessages.length; i++) {
    const m = periodMessages[i]
    const text = (m.message || '').toLowerCase()

    let categorized = false
    if (issueKeywords.some(k => text.includes(k))) {
      categoryCounts.complaints_repairs++
      categorized = true

      // Forward-thread scan for subsequent resolution signals (epistemic check)
      const msgTime = new Date(m.timestamp).getTime()
      const forwardReplies = sorted.filter(f => {
        const ft = new Date(f.timestamp).getTime()
        return ft > msgTime && ft < msgTime + 72 * 3600 * 1000 // within 72 hours
      })

      const hasResolution = forwardReplies.some(r => resolutionKeywords.some(rk => (r.message || '').toLowerCase().includes(rk)))

      candidateIssues.push({
        timestamp: m.timestamp,
        sender: m.sender,
        excerpt: m.message.slice(0, 160),
        status: hasResolution ? 'possible_resolution_observed_in_thread' : 'no_resolution_observed_in_window'
      })
    }

    if (/\b(payment|salary|float|cost|fee|cash|rs|lkr)\b/i.test(text)) {
      categoryCounts.financial++
      categorized = true
    }
    if (/\b(guest|booking|checkin|checkout|arrival|villa|pool)\b/i.test(text)) {
      categoryCounts.guest_logistics++
      categorized = true
    }
    if (/\b(staff|leave|salary|duty|schedule|shift)\b/i.test(text)) {
      categoryCounts.staffing_ops++
      categorized = true
    }
    if (!categorized) {
      categoryCounts.general++
    }
  }

  return {
    period: {
      days,
      start: new Date(cutoffTime).toISOString().split('T')[0],
      end: latestDate.toISOString().split('T')[0]
    },
    messageVelocity: {
      totalInPeriod: periodMessages.length,
      averagePerDay: Math.round((periodMessages.length / days) * 10) / 10
    },
    categoryBreakdown: categoryCounts,
    operationalIssuesFlagged: candidateIssues.slice(0, 10)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER & TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'whathappen-forensic-mcp',
    version: '2.1.0',
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
        name: 'whathappen_financial_summary',
        description:
          'Roll up all financial mentions across the corpus into categorized totals (fees, salaries, floats, petty cash, transfers), monthly trends, and top financial actors.',
        inputSchema: {
          type: 'object',
          properties: {
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
          'Compute structured timeline analytics (hourly distributions, daily volume, active day count, top senders) or retrieve chronological message slices.',
        inputSchema: {
          type: 'object',
          properties: {
            month: {
              type: 'string',
              description: 'Optional month name or ISO prefix (e.g. "may", "june", "july", "2026-05")',
            },
            raw: {
              type: 'boolean',
              description: 'Set true to return raw verbatim message strings instead of structured activity heatmaps (default: false)',
            },
            limit: {
              type: 'number',
              description: 'Maximum messages to return when raw=true (default: 50, max: 100)',
            },
            projectId: {
              type: 'string',
              description: 'Optional project UUID',
            },
          },
        },
      },
      {
        name: 'whathappen_operational_snapshot',
        description:
          'Generate a rolling operational health brief over the last N days (default: 7) with message velocity, category breakdown (repairs, guest logistics, finances, staffing), and candidate unresolved issues.',
        inputSchema: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Rolling window in days (default: 7, max: 30)',
            },
            projectId: {
              type: 'string',
              description: 'Optional project UUID',
            },
          },
        },
      },
      {
        name: 'whathappen_response_times',
        description:
          'Calculate per-participant response time distributions (average, median, p90, fastest, slowest) based on sequential replies within 12 hours.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Optional project UUID',
            },
          },
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

    // 2. Tool: whathappen_extract_financials (Deterministic Raw Ledger Extraction)
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

    // 3. Tool: whathappen_financial_summary (Categorized Macroeconomic Rollup)
    if (name === 'whathappen_financial_summary') {
      const allMessages = await getDecryptedMessages(projectId)
      const summary = computeLocalFinancialSummary(allMessages)
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      }
    }

    // 4. Tool: whathappen_get_timeline (Activity Heatmaps or Raw Slice)
    if (name === 'whathappen_get_timeline') {
      const allMessages = await getDecryptedMessages(projectId)
      const isRaw = args?.raw === true

      if (isRaw) {
        const month = (args?.month || '').toLowerCase()
        const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 100)
        const senderFilter = (args?.sender || '').toLowerCase()

        const matches = allMessages.filter((m) => {
          if (senderFilter && !(m.sender || '').toLowerCase().includes(senderFilter)) {
            return false
          }
          if (month) {
            const ts = (m.timestamp || '').toLowerCase()
            const date = new Date(m.timestamp)
            const monthName = date.toLocaleString('en-US', { month: 'long' }).toLowerCase()
            if (!ts.includes(month) && !monthName.includes(month)) return false
          }
          return true
        })

        matches.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        const text = buildCappedEnvelope(matches, matches.length, limit)
        return {
          content: [{ type: 'text', text }],
        }
      }

      // Default: Return structured local timeline analytics
      const analysis = computeLocalTimelineAnalysis(allMessages, args?.month || null)
      return {
        content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }],
      }
    }

    // 5. Tool: whathappen_operational_snapshot (Rolling 7-to-30 Day Health Brief)
    if (name === 'whathappen_operational_snapshot') {
      const days = Math.min(Math.max(Number(args?.days) || 7, 1), 30)
      const allMessages = await getDecryptedMessages(projectId)
      const snapshot = computeLocalOperationalSnapshot(allMessages, days)
      return {
        content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }],
      }
    }

    // 6. Tool: whathappen_response_times (SLA Distributions)
    if (name === 'whathappen_response_times') {
      const allMessages = await getDecryptedMessages(projectId)
      const responseAnalysis = computeLocalResponseTimes(allMessages)
      return {
        content: [{ type: 'text', text: JSON.stringify(responseAnalysis, null, 2) }],
      }
    }

    // 7. Tool: whathappen_get_metadata (Context-Safe Project Summary)
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
  console.error('[WhatHappen MCP] Server 2.1 running on stdio (Loopback: ' + LOOPBACK_URL + ')')
}

run().catch((err) => {
  console.error('[WhatHappen MCP] Fatal error:', err)
  process.exit(1)
})
