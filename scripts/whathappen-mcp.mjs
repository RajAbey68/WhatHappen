#!/usr/bin/env node

/**
 * WhatHappen Forensic Chat MCP Server (Vanilla ES Module)
 * Compatible with Claude Desktop, Antigravity, Cursor, and any MCP-compliant AI client.
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

// Load environment from .env.production or .env.local
const envPath = fs.existsSync('/root/WhatHappen/.env.production')
  ? '/root/WhatHappen/.env.production'
  : path.join(process.cwd(), '.env.local')

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const HERMES_URL = process.env.WHATHAPPEN_API_URL || 'http://127.0.0.1:3000'
const DEFAULT_PROJECT_ID = process.env.WHATHAPPEN_PROJECT_ID || '7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59'

// Helper to get authenticated project token
async function getAuthToken(projectId) {
  const challengeRes = await fetch(`${HERMES_URL}/api/auth/challenge?projectId=${projectId}`)
  if (!challengeRes.ok) throw new Error(`Challenge failed: ${challengeRes.statusText}`)
  const { nonce } = await challengeRes.json()

  const hash = process.env.WHATSAPP_PASSPHRASE_HASH
  if (!hash) {
    throw new Error('WHATSAPP_PASSPHRASE_HASH must be configured in the environment')
  }
  const proof = crypto.createHmac('sha256', hash).update(nonce).digest('hex')

  const tokenRes = await fetch(`${HERMES_URL}/api/project-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, challenge: nonce, proof })
  })

  if (!tokenRes.ok) throw new Error(`Token minting failed: ${tokenRes.statusText}`)
  const { token } = await tokenRes.json()
  return token
}

const server = new Server(
  {
    name: 'whathappen-mcp-server',
    version: '1.0.0',
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
        description: 'Semantic and keyword search over decrypted WhatsApp chat sessions. Returns verbatim timestamped messages and participants.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term or question (e.g., "50,000 float", "Channa repair", "July 31 raw materials")' },
            projectId: { type: 'string', description: 'Optional project UUID (defaults to Ko Lake Conversations)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'whathappen_get_timeline',
        description: 'Extract chronological messages within a specific date range or month (e.g., July 2026, August 2026).',
        inputSchema: {
          type: 'object',
          properties: {
            month: { type: 'string', description: 'Month name to extract (e.g., "july", "august")' },
            sender: { type: 'string', description: 'Optional sender name filter (e.g., "Channa", "Sudath", "Themiya")' },
            projectId: { type: 'string', description: 'Optional project UUID' },
          },
          required: ['month'],
        },
      },
      {
        name: 'whathappen_get_metadata',
        description: 'Get project metadata, total message counts, date ranges, and verified participant list.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Optional project UUID' },
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
    const token = await getAuthToken(projectId)

    if (name === 'whathappen_search_chat') {
      const query = args?.query
      const res = await fetch(`${HERMES_URL}/api/ai-chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-token': token,
        },
        body: JSON.stringify({ projectId, message: query }),
      })

      const data = await res.json()
      return {
        content: [
          {
            type: 'text',
            text: data.response || JSON.stringify(data, null, 2),
          },
        ],
      }
    }

    if (name === 'whathappen_get_timeline') {
      const month = args?.month
      const sender = args?.sender || ''
      const prompt = `Show me all messages and timeline events for ${month} 2026 ${sender ? `involving ${sender}` : ''}`

      const res = await fetch(`${HERMES_URL}/api/ai-chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-token': token,
        },
        body: JSON.stringify({ projectId, message: prompt }),
      })

      const data = await res.json()
      return {
        content: [
          {
            type: 'text',
            text: data.response || JSON.stringify(data, null, 2),
          },
        ],
      }
    }

    if (name === 'whathappen_get_metadata') {
      const res = await fetch(`${HERMES_URL}/api/projects/${projectId}`, {
        headers: { 'x-project-token': token },
      })
      const data = await res.json()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
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
          text: `Error executing tool ${name}: ${err.message}`,
        },
      ],
      isError: true,
    }
  }
})

async function run() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[WhatHappen MCP] Server running on stdio')
}

run().catch((err) => {
  console.error('[WhatHappen MCP] Fatal error:', err)
  process.exit(1)
})
