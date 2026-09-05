import { NextRequest, NextResponse } from 'next/server'
import { OpenAI } from 'openai'
import { getServiceClient } from '@/lib/auth'
import {
  requireProjectAccess,
  hasAnyProjectCredential,
  missingCredentialResponse,
} from '@/lib/api-auth'
import { decryptText } from '@/lib/crypto'
import { sessionizeMessages } from '@/lib/rag/sessionizer'
import { retrieveRelevantSessions } from '@/lib/rag/embedder'
import { lookupGoldenCache, expandQueryWithLexicon, getFewShotExemplars } from '@/lib/rag/learning'
import { OperationalTruthHarness } from '@/lib/forensics/truth-harness'

// Model is env-overridable; default upgraded off the dated gpt-3.5-turbo.
// NOTE (architecture): the house default stack is Claude via Supabase Edge
// Functions (see CLAUDE.md P7 cost tiering — OpenAI is tier-4). Routing this
// through that path is a separate, larger change tracked outside this file.
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
const MAX_MESSAGE_LENGTH = 4000
const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_CONTENT_LENGTH = 4000

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY
  if (key && key !== 'your_openai_api_key_here') {
    return new OpenAI({ apiKey: key })
  }
  return null
}

export async function POST(request: NextRequest) {
  // RAJ-780: reject credential-less callers BEFORE parsing the body.
  if (!hasAnyProjectCredential(request)) return missingCredentialResponse()

  try {
    const body = await request.json()
    const projectId = body.projectId
    const message = body.message || body.query
    const rawHistory = body.conversationHistory || body.context?.messages || []
    const passphrase = body.passphrase || process.env.PROJECT_PASSPHRASE

    if (typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message exceeds the ${MAX_MESSAGE_LENGTH}-character limit` },
        { status: 400 }
      )
    }
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // RAJ-780: answers questions over the project's decrypted messages. Was
    // entirely unauthenticated while using the service-role client.
    const authError = await requireProjectAccess(request, projectId)
    if (authError) return authError

    // conversationHistory is untrusted client input: coerce to an array,
    // keep only well-formed entries, cap the count and per-message length
    // (prevents 500s on bad shapes and unbounded token cost).
    const conversationHistory: ChatMessage[] = (Array.isArray(rawHistory) ? rawHistory : [])
      .filter(
        (msg: unknown): msg is { role?: unknown; content: unknown } =>
          typeof msg === 'object' && msg !== null && typeof (msg as { content?: unknown }).content === 'string'
      )
      .slice(-MAX_HISTORY_MESSAGES)
      .map((msg): ChatMessage => ({
        role: (msg as { role?: unknown }).role === 'user' ? 'user' : 'assistant',
        content: String((msg as { content: unknown }).content).slice(0, MAX_HISTORY_CONTENT_LENGTH),
      }))

    // Build context for AI from Supabase project data
    const supabase = getServiceClient()
    let projectContext = ''
    let projectDetails: any = null
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle()

      if (error) throw error

      if (data) {
        projectDetails = {
          id: data.id,
          name: data.name,
          description: data.description,
          messageCount: data.message_count,
          participants: data.participants,
          dateRange: data.date_range,
          analysis: data.analysis
        }
        projectContext = `
Chat Meta-Context:
- Project Name: ${projectDetails.name || 'Unknown'}
- Participants: ${projectDetails.participants?.join(', ') || 'Unknown'}
- Total Messages in Chat: ${projectDetails.messageCount || 0}
- Date Range: ${projectDetails.dateRange ? `${projectDetails.dateRange.start} to ${projectDetails.dateRange.end}` : 'Unknown'}
- Key Topics/Keywords: ${projectDetails.analysis?.keywords?.slice(0, 15).join(', ') || 'None identified'}
`
      }
    } catch (err) {
      console.warn('Could not fetch project details from database, using empty context:', err)
    }

    // Fetch actual chat messages context to allow content-specific questions
    let messagesContext = ''
    let decryptedMsgs: any[] = []
    try {
      // Fetch all messages for the project in batches to prevent PostgREST 1000-row cap
      let allChatMsgs: any[] = []
      let offset = 0
      const batchSize = 1000

      while (true) {
        const { data: chunk, error: chunkErr } = await supabase
          .from('messages')
          .select('sender, message, timestamp')
          .eq('project_id', projectId)
          .order('timestamp', { ascending: true })
          .range(offset, offset + batchSize - 1)

        if (chunkErr) {
          console.warn('Error fetching message chunk:', chunkErr)
          break
        }
        if (!chunk || chunk.length === 0) break
        allChatMsgs.push(...chunk)
        if (chunk.length < batchSize) break
        offset += batchSize
      }

      if (allChatMsgs.length > 0) {
        for (const m of allChatMsgs) {
          let decryptedMessage = m.message
          let decryptedSender = m.sender
          let isEncrypted = false

          if (passphrase) {
            try {
              const messageEnc = JSON.parse(m.message)
              if (messageEnc.ciphertext && messageEnc.salt && messageEnc.iv) {
                decryptedMessage = await decryptText(messageEnc.ciphertext, passphrase, messageEnc.salt, messageEnc.iv)
              }
            } catch (e) {}
            try {
              const senderEnc = JSON.parse(m.sender)
              if (senderEnc.ciphertext && senderEnc.salt && senderEnc.iv) {
                decryptedSender = await decryptText(senderEnc.ciphertext, passphrase, senderEnc.salt, senderEnc.iv)
              }
            } catch (e) {}
          } else {
            // Check if message is raw ciphertext JSON
            try {
              const parsed = JSON.parse(m.message)
              if (parsed && typeof parsed === 'object' && parsed.ciphertext && parsed.salt && parsed.iv) {
                isEncrypted = true
              }
            } catch (e) {}
          }

          // In zero-knowledge mode without a passphrase, omit ciphertext blobs to prevent leaking raw crypto payloads to the model
          if (!isEncrypted) {
            decryptedMsgs.push({ ...m, sender: decryptedSender, message: decryptedMessage })
          }
        }

        // Step 1: Learning RAG - Instant Golden Cache Lookup
        try {
          const cached = await lookupGoldenCache(projectId, message)
          if (cached) {
            return NextResponse.json({
              response: cached.verifiedResponse + '\n\n*(⚡ Instant Verified Recall from Golden Memory)*',
              model: 'golden-cache',
              source: 'learning-rag-cache',
              cached: true
            })
          }
        } catch (cacheErr) {
          console.warn('[Learning RAG] Golden cache lookup skipped:', cacheErr)
        }

        // Step 2: Learning RAG - Dynamic Query Expansion with Learned Operational Lexicon
        const expandedQuery = expandQueryWithLexicon(projectId, message)

        // Step 3: Sessionize all decrypted messages into conversational windows
        const sessions = sessionizeMessages(decryptedMsgs, {
          gapThresholdMinutes: 45,
          maxMessagesPerWindow: 35,
          overlapMessages: 8
        })

        // Step 4: Retrieve the most relevant sessions via intent + bge-m3 dense retrieval
        const queryLower = expandedQuery.toLowerCase()
        const monthKeywords = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
        const matchedMonths = monthKeywords.filter(m => queryLower.includes(m))
        const monthIndexMap: Record<string, number> = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
        }

        let relevantSessions: any[] = []

        // If specific months are queried, narrow candidate pool to those months
        let candidateSessions = sessions
        if (matchedMonths.length > 0) {
          const filtered = sessions.filter(s => {
            const startM = new Date(s.startTime).getMonth()
            const endM = new Date(s.endTime).getMonth()
            return matchedMonths.some(m => monthIndexMap[m] === startM || monthIndexMap[m] === endM)
          })
          if (filtered.length > 0) candidateSessions = filtered
        }

        // Rank and retrieve top 3 sessions via dense vector similarity
        try {
          const ranked = await retrieveRelevantSessions(projectId, candidateSessions.slice(-100), expandedQuery, 3)
          relevantSessions = ranked.map(r => r.session)
        } catch (embedErr) {
          console.warn('[RAG] Fallback to recency session windowing:', embedErr)
          relevantSessions = candidateSessions.slice(-3)
        }

        // Sort relevant sessions chronologically
        relevantSessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

        messagesContext = `\nRetrieved Conversational Session Windows (${relevantSessions.length} sessions, total ${relevantSessions.reduce((acc, s) => acc + s.messageCount, 0)} messages in direct evidence context):\n\n` +
          relevantSessions.map(s => s.formattedContent).join('\n\n')
      }
    } catch (msgErr) {
      console.warn('Could not fetch message contents for context:', msgErr)
    }

    const fewShotExemplars = getFewShotExemplars(projectId, 1)

    const systemPrompt = `You are a forensic analyst and operational truth evaluator for Ko Lake Villa WhatsApp communications.
You have access to the following verified conversational sessions:
${projectContext}
${messagesContext}
${fewShotExemplars}

STRICT CHAIN-OF-THOUGHT (CoT) OPERATIONAL HARNESS:
You must strictly format your entire response using the following 4 structured sections:

### 1. 🔍 Verbatim Evidence Citations
Extract and quote the exact relevant messages from the transcript supporting this query.
Format every single citation strictly as:
- [Exact Timestamp] Sender: "Exact verbatim message text"
Rules:
- NEVER paraphrase quotes.
- NEVER invent dates or sender names.
- If no direct message exists for an aspect, explicitly state: "No record found in retrieved context."

### 2. ⏳ Chronological Event Sequence
Reconstruct the precise timeline of events step-by-step in ascending order:
- Step 1: [Timestamp] Initial request, dispute, or operational event.
- Step 2: [Timestamp] Response, action taken, delay, or obstacle.
- Step 3: [Timestamp] Outcome, resolution, payment confirmation, or pending status.

### 3. 📊 Sentiment & Tone Evaluation
Evaluate the emotional and operational tone of the participants:
- Identified Tone: (e.g. Cooperative, Frustrated, Defensive, Stressed, Neutral).
- Supporting Evidence: Point directly to the specific words or phrases in Section 1 that prove this sentiment.

### 4. 📋 Grounded Operational Synthesis
Provide a concise, direct operational summary strictly derived from the quotes above. If no direct message quotes are retrieved (for instance if content is encrypted), synthesize your response strictly from the verified facts provided in Chat Meta-Context (e.g., recorded participants, message counts, date ranges, and topics) and clearly state that chat message bodies are encrypted.`

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ]

    // 100% LOCAL AIR-GAPPED INFERENCE ON HERMES-DEV
    // Zero external API calls for strict legal compliance, GDPR, and data privacy.
    const localOllamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat'
    const localModel = process.env.OLLAMA_MODEL || 'gemma3:4b'
    let success = false
    let responseText = ''

    try {
      // Use 180s timeout so CPU inference is never prematurely severed by Node fetch
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 180_000)

      const ollamaRes = await fetch(localOllamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: localModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
            { role: 'user', content: message }
          ],
          stream: false,
          options: {
            num_ctx: 4096, // Fast CPU prefill (~1,500 tokens in <12s)
            num_predict: 1200,
            temperature: 0.2
          }
        })
      })
      clearTimeout(timeoutId)

      if (ollamaRes.ok) {
        const ollamaData = await ollamaRes.json()
        if (ollamaData.message?.content) {
          responseText = ollamaData.message.content
          success = true
        }
      }
    } catch (ollamaErr) {
      console.error('Local Ollama execution error on Hermes:', ollamaErr)
    }

    if (!success) {
      // Sandbox / demo mode: no LLM is configured or all providers failed.
      // Answer ONLY from recorded project metadata and never fabricate names,
      // figures, sentiment, or financial findings.
      const lowerMessage = message.toLowerCase()
      const sandboxNote = '\n\n_Sandbox mode: no active AI model key available or all providers failed, so this is a metadata-only response._'

      if (lowerMessage.includes('how many messages') || lowerMessage.includes('message count')) {
        responseText = typeof projectDetails?.messageCount === 'number'
          ? `This project has **${projectDetails.messageCount.toLocaleString()} messages** recorded in its metadata.${sandboxNote}`
          : `The message count for this project has not been recorded yet.${sandboxNote}`
      } else if (lowerMessage.includes('participant') || lowerMessage.includes('who are')) {
        const participants: string[] = Array.isArray(projectDetails?.participants) ? projectDetails.participants : []
        responseText = participants.length > 0
          ? `The participants recorded for this project are: **${participants.join(', ')}**.${sandboxNote}`
          : `No participants have been recorded for this project yet.${sandboxNote}`
      } else if (lowerMessage.includes('keyword') || lowerMessage.includes('topic')) {
        const keywords: string[] = Array.isArray(projectDetails?.analysis?.keywords) ? projectDetails.analysis.keywords.slice(0, 15) : []
        responseText = keywords.length > 0
          ? `Key topics recorded for this project: **${keywords.join(', ')}**.${sandboxNote}`
          : `No topics or keywords have been recorded for this project yet.${sandboxNote}`
      } else {
        responseText = `I can answer from this project's recorded metadata — message count, participants, topics, and date range. I cannot analyse the content of specific messages (including financial or sentiment analysis) without a functional AI model.${sandboxNote}`
      }
    }

    // Operational Truth Verification Barrier:
    // Guarantees all citations are checked against raw corpus before leaving server
    let finalResponse = responseText
    if (success && decryptedMsgs.length > 0) {
      const { sanitizedText, audit } = OperationalTruthHarness.enforce(responseText, decryptedMsgs)
      finalResponse = sanitizedText
      if (!audit.compliant) {
        console.warn(`[Operational Truth] Redacted ${audit.hallucinatedCount} unverified citation(s) from response for project ${projectId}`)
      }
    }

    return NextResponse.json({
      response: finalResponse,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    // Log full detail server-side; do not leak internals to the client.
    console.error('AI Chat Query Error:', error)
    return NextResponse.json({ error: 'Failed to process AI query' }, { status: 500 })
  }
}
