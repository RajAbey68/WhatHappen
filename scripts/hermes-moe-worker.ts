/**
 * WhatHappen MoE Swarm Daemon
 * 
 * Runs as an event-driven worker listening on BuzzBar:
 * - Listens to `#whathappen-ingest` (`253b4da8-6c1f-4eb1-938e-09287721f2ac`) for `com.whathappen.chat.ready`
 * - Runs the 3 expert agents (ForensicAnalyst, RelationshipMediator, ChronologyMapper) in parallel
 * - Publishes completion events to `#whathappen-analytics` (`48346229-5842-49ca-986b-0de3a957a4ac`)
 * 
 * Zero-Plaintext Bus Invariant:
 * Events NEVER carry raw message text or decrypted content over the bus.
 * Only opaque session IDs and cryptographic hash references are transmitted.
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as crypto from 'crypto'

dotenv.config({ path: path.resolve(__dirname, '../.env.production') })
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { createClient } from '@supabase/supabase-js'
import { BuzzClient, CloudEvent, createMoeJobEvent } from '../lib/swarm/BuzzClient'
import { ForensicAnalyst } from '../lib/swarm/experts/ForensicAnalyst'
import { RelationshipMediator } from '../lib/swarm/experts/RelationshipMediator'
import { ChronologyMapper } from '../lib/swarm/experts/ChronologyMapper'
import { SwarmDossier } from '../lib/swarm/types'
import { ChatMessage } from '../lib/swarm/SwarmManager'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[MoE Swarm] Fatal: Missing Supabase service credentials.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

export class MoeSwarmDaemon {
  private buzzClient: BuzzClient
  private isRunning = false

  constructor() {
    this.buzzClient = new BuzzClient({
      nsec: process.env.BUZZBAR_NSEC,
    })
  }

  public async start(): Promise<void> {
    if (this.isRunning) return
    console.log('[MoE Swarm] Starting MoE Swarm Daemon on BuzzBar...')
    await this.buzzClient.connect()

    // Subscribe to chat ready events on ingest channel
    await this.buzzClient.subscribe('ingest', async (event: CloudEvent) => {
      if (event.type === 'com.whathappen.chat.ready') {
        const { sessionId, projectId } = event.data || {}
        if (sessionId && projectId) {
          await this.processSession(sessionId, projectId)
        }
      }
    })

    this.isRunning = true
    console.log('[MoE Swarm] ✅ Listening for chat.ready events on #whathappen-ingest')
  }

  public async stop(): Promise<void> {
    this.isRunning = false
    this.buzzClient.disconnect()
    console.log('[MoE Swarm] Daemon stopped.')
  }

  public async processSession(sessionId: string, projectId: string): Promise<SwarmDossier | null> {
    console.log(`[MoE Swarm] ⚡ Initiating MoE Swarm for session ${sessionId} (project ${projectId})`)

    // Publish starting event to #whathappen-analytics (opaque identifiers only)
    await this.buzzClient.publish('analytics', createMoeJobEvent(
      sessionId,
      'swarm.started',
      'running',
      { projectId, timestamp: new Date().toISOString() }
    ))

    try {
      // 1. Fetch raw messages from Supabase (server-side enclave)
      const { data: messagesData, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('message_date', { ascending: true })
        .limit(1000)

      if (msgError || !messagesData || messagesData.length === 0) {
        console.warn(`[MoE Swarm] No messages found for session ${sessionId}`)
        return null
      }

      const chatMessages: ChatMessage[] = messagesData.map((m: any) => ({
        sender: m.sender || 'Unknown',
        message: m.content || '',
        timestamp: m.message_date || new Date().toISOString(),
      }))

      // 2. Execute 3 expert agents in parallel
      console.log(`[MoE Swarm] Executing 3-agent swarm across ${chatMessages.length} messages...`)
      const [financialLedger, sentimentArc, chronology] = await Promise.all([
        ForensicAnalyst.analyze(chatMessages),
        RelationshipMediator.analyze(chatMessages),
        ChronologyMapper.analyze(chatMessages),
      ])

      // 3. Synthesize master executive summary
      const summaryMarkdown = `## Executive Swarm Analysis Dossier
- **Total Financial Mentions:** ${financialLedger.length}
- **Friction Points Detected:** ${sentimentArc.length}
- **Key Milestones Identified:** ${chronology.length}

### Forensic Financial Highlights
${financialLedger.slice(0, 5).map(f => `- **${f.currency} ${f.amount}** (${f.transactionType}) cited: *"${f.sourceCitation}"*`).join('\n') || 'None detected.'}

### Communication Dynamics
${sentimentArc.slice(0, 5).map(s => `- Friction [${s.frictionScore}/10] (${s.tone}): *"${s.sourceCitation}"*`).join('\n') || 'Stable communication.'}

### Timeline Sequence
${chronology.slice(0, 5).map(c => `- **${c.normalizedIsoDate}**: ${c.eventDescription} (*${c.temporalOrderingCertainty}*)`).join('\n') || 'Linear sequence.'}
`

      const batchHash = crypto.createHash('sha256')
        .update(JSON.stringify(messagesData.map(m => m.id)))
        .digest('hex')

      const dossier: SwarmDossier = {
        projectId,
        sessionId,
        batchHash,
        generatedAt: new Date().toISOString(),
        modelVersions: {
          forensic: 'gemini-2.5-flash',
          sentiment: 'gemini-2.5-flash',
          chronology: 'gemini-2.5-flash',
        },
        tier1: {
          sourceArtifactHash: batchHash,
          totalMessages: chatMessages.length,
        },
        tier2: {
          participantIdentities: Array.from(new Set(chatMessages.map(m => m.sender))),
          startTimeIso: chatMessages[0]?.timestamp || new Date().toISOString(),
          endTimeIso: chatMessages[chatMessages.length - 1]?.timestamp || new Date().toISOString(),
        },
        tier3: {
          financialLedger,
          sentimentArc,
          chronology,
          executiveSynthesisMarkdown: summaryMarkdown,
        },
      }

      // 4. Save dossier to reports/sessions table in Supabase
      await supabase
        .from('sessions')
        .update({
          summary: summaryMarkdown,
          metadata: {
            moe_dossier: {
              batchHash,
              financialCount: financialLedger.length,
              frictionCount: sentimentArc.length,
              milestoneCount: chronology.length,
            }
          }
        })
        .eq('id', sessionId)

      // 5. Publish completion CloudEvent to #whathappen-analytics (PAYLOAD-FREE)
      await this.buzzClient.publish('analytics', createMoeJobEvent(
        sessionId,
        'swarm.completed',
        'success',
        {
          projectId,
          batchHash,
          financialCount: financialLedger.length,
          frictionCount: sentimentArc.length,
          milestoneCount: chronology.length,
          timestamp: new Date().toISOString()
        }
      ))

      console.log(`[MoE Swarm] ✅ Successfully synthesized and published dossier for session ${sessionId}`)
      return dossier
    } catch (err: any) {
      console.error(`[MoE Swarm] Swarm execution failed for session ${sessionId}:`, err.message)
      await this.buzzClient.publish('analytics', createMoeJobEvent(
        sessionId,
        'swarm.failed',
        'error',
        { projectId, error: err.message }
      ))
      return null
    }
  }
}

// Standalone execution entrypoint when run via CLI or PM2
if (require.main === module) {
  const daemon = new MoeSwarmDaemon()
  daemon.start().catch(err => {
    console.error('[MoE Swarm] Failed to start daemon:', err)
    process.exit(1)
  })

  process.on('SIGTERM', async () => {
    await daemon.stop()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    await daemon.stop()
    process.exit(0)
  })
}
