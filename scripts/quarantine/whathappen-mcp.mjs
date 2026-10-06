#!/usr/bin/env node

/**
 * WhatHappen MCP Server
 * Host: Hermes-Dev (167.233.236.178)
 * Transport: Stdio (Model Context Protocol)
 *
 * Provides AI agent runtimes (Hermes, Claude, Cursor) with secure, non-interactive,
 * authenticated access to WhatsApp projects, forensic analysis, and chat evidence.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import crypto from 'crypto';
import fs from 'fs';

const API_BASE = process.env.WHATHAPPEN_API_URL || 'http://127.0.0.1:3000';

// In-memory token cache keyed by projectId: { token: string, expiresAt: number }
const tokenCache = new Map();

function getPassphraseHash() {
  if (process.env.WHATSAPP_PASSPHRASE_HASH) {
    return process.env.WHATSAPP_PASSPHRASE_HASH.trim().toLowerCase();
  }
  try {
    const envContent = fs.readFileSync('/root/WhatHappen/.env.production', 'utf8');
    const match = envContent.match(/WHATSAPP_PASSPHRASE_HASH=([a-f0-9]+)/i);
    if (match) return match[1].trim().toLowerCase();
  } catch (e) {}
  return null;
}

async function getProjectToken(projectId) {
  const cached = tokenCache.get(projectId);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token;
  }

  const hash = getPassphraseHash();
  if (!hash) {
    throw new Error('WHATSAPP_PASSPHRASE_HASH is not configured on Hermes.');
  }

  // 1. Fetch challenge nonce
  const challengeRes = await fetch(`${API_BASE}/api/auth/challenge?projectId=${projectId}`);
  if (!challengeRes.ok) {
    const errText = await challengeRes.text();
    throw new Error(`Failed to obtain auth challenge (${challengeRes.status}): ${errText}`);
  }
  const { nonce } = await challengeRes.json();

  // 2. Compute HMAC proof
  const proof = crypto.createHmac('sha256', hash).update(nonce).digest('hex');

  // 3. Issue project token
  const tokenRes = await fetch(`${API_BASE}/api/project-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      challenge: nonce,
      proof,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to issue project token (${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  if (!tokenData.token) {
    throw new Error('No token returned in project-token response');
  }

  // Cache token for 1.5 hours (server TTL is 2 hours)
  tokenCache.set(projectId, {
    token: tokenData.token,
    expiresAt: Date.now() + 90 * 60 * 1000,
  });

  return tokenData.token;
}

const server = new Server(
  {
    name: 'whathappen-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Available Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'whathappen_list_projects',
        description: 'List all available WhatsApp chat forensic projects on Hermes with metadata, participant rosters, message counts, and timestamps.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'whathappen_query_chat',
        description: 'Ask questions or request forensic synthesis over the full WhatsApp chat history for a given project. Uses Gemini 2.5 Flash with full-corpus context.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The UUID of the project to analyze.',
            },
            query: {
              type: 'string',
              description: 'The forensic question, transaction query, or timeline inquiry.',
            },
          },
          required: ['projectId', 'query'],
        },
      },
      {
        name: 'whathappen_extract_financials',
        description: 'Extract payments, bank transfers, debt obligations, and monetary ledger events across project messages.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The UUID of the target project.',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'whathappen_get_timeline_analysis',
        description: 'Run chronological sequence analysis and sentiment breakdown on the project corpus.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The UUID of the target project.',
            },
            analysisType: {
              type: 'string',
              enum: ['timeline', 'sentiment', 'comprehensive'],
              description: 'Type of analysis to run.',
              default: 'comprehensive',
            },
          },
          required: ['projectId'],
        },
      },
    ],
  };
});

// Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'whathappen_list_projects') {
      const res = await fetch(`${API_BASE}/api/projects`);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'whathappen_query_chat') {
      const { projectId, query } = args;
      const token = await getProjectToken(projectId);

      const res = await fetch(`${API_BASE}/api/ai-chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-token': token,
        },
        body: JSON.stringify({
          projectId,
          message: query,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      return {
        content: [
          {
            type: 'text',
            text: data.response || JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'whathappen_extract_financials') {
      const { projectId } = args;
      const token = await getProjectToken(projectId);

      const res = await fetch(`${API_BASE}/api/analyze-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-token': token,
        },
        body: JSON.stringify({
          projectId,
          analysisType: 'financial',
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    if (name === 'whathappen_get_timeline_analysis') {
      const { projectId, analysisType = 'comprehensive' } = args;
      const token = await getProjectToken(projectId);

      const res = await fetch(`${API_BASE}/api/analyze-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-token': token,
        },
        body: JSON.stringify({
          projectId,
          analysisType,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool name: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${err.message}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('WhatHappen MCP Server running on Stdio');
}

main().catch((err) => {
  console.error('Fatal MCP startup error:', err);
  process.exit(1);
});
