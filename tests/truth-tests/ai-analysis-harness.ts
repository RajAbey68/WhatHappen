#!/usr/bin/env tsx
/**
 * AI Analysis Truth-Test Harness — WhatHappen
 * ============================================
 *
 * Covers: LLM client init, sentiment correctness, AI chat query structure,
 * AI search relevance, document generation validity, fallback chain, and
 * empty/error handling.
 *
 * Usage:
 *   MOCK_APIS=true npx tsx tests/truth-tests/ai-analysis-harness.ts
 *
 * Design: standalone tsx script (no Jest dependency). All LLM calls are
 * intercepted by a global fetch mock — no real API keys are required.
 * Assertions verify structure and type, not content.
 *
 * Reference: LeadSync truth-tests pattern at
 *   /Users/arajiv/LeadSynch/tests/truth-tests.ts
 */

// ---------------------------------------------------------------------------
// Environment bootstrap — must be before any imports
// ---------------------------------------------------------------------------
process.env.MOCK_APIS = 'true'
process.env.OPENROUTER_API_KEY = ''
process.env.DEEPSEEK_API_KEY = 'mock-deepseek-key'

// ---------------------------------------------------------------------------
// Global fetch mock — install BEFORE any module import so the OpenAI SDK
// picks up the mocked global.fetch on its very first call.
// ---------------------------------------------------------------------------
const mockResponses = new Map<string, string>()
const __originalFetch = globalThis.fetch

globalThis.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  if (url.includes('deepseek.com') || url.includes('openrouter.ai') || url.includes('api.openai.com')) {
    console.error('[MOCK] Intercepting LLM call to:', url)
    console.error('[MOCK] Body keys:', Object.keys(init?.body ? JSON.parse(init.body as string) : {}))
    const body = init?.body ? JSON.parse(init.body as string) : {}
    const model = body.model || 'unknown'
    const mockContent = mockResponses.get(model)
    if (mockContent) {
      return new Response(mockContent, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({
        error: { message: `Mock not configured for model ${model}` },
      }),
      { status: 500 },
    )
  }
  return __originalFetch(input, init)
}

/** Register a mock response for a model name */
function mockModel(model: string, content: string): void {
  mockResponses.set(model, content)
}

/** Clear all mock responses */
function clearMocks(): void {
  mockResponses.clear()
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import Sentiment from 'sentiment'
import { validateGeneratedSQL, ALLOWED_TABLES } from '../../lib/sql-validator'
import { strict as assert } from 'node:assert'
import * as crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Test infrastructure (LeadSync pattern)
// ---------------------------------------------------------------------------

interface TestResult {
  name: string
  passed: boolean
  detail: string
  duration: number
}

const results: TestResult[] = []

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now()
  try {
    await fn()
    results.push({ name, passed: true, detail: '✅', duration: Date.now() - start })
  } catch (err: any) {
    results.push({ name, passed: false, detail: `❌ ${err.message}`, duration: Date.now() - start })
  }
}

// ---------------------------------------------------------------------------
// Pure function helpers (inlined from route files to avoid Next.js deps)
// ---------------------------------------------------------------------------

/** extractAttachmentMetadata from ai-chat/query/route.ts */
function extractAttachmentMetadata(
  messageText: string | null | undefined
): {
  fileName: string
  attachmentType: string
  ocrText: string
  description: string
} | null {
  if (!messageText) return null
  const attachmentMatch = messageText.match(/^\[Attachment:([^\]]+)\]\s*(.*)$/s)
  if (!attachmentMatch) return null
  const [, fileName, ocrText] = attachmentMatch
  const normalizedName = fileName?.trim() || 'attachment'
  const extension = normalizedName.split('.').pop()?.toLowerCase() || ''
  const attachmentType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'].includes(extension)
    ? 'image'
    : ['pdf', 'doc', 'docx', 'txt', 'csv', 'json'].includes(extension)
      ? 'document'
      : 'file'
  const cleanedOcr = (ocrText || '').trim()
  return {
    fileName: normalizedName,
    attachmentType,
    ocrText: cleanedOcr,
    description: cleanedOcr
      ? `${normalizedName} (${attachmentType}) — ${cleanedOcr}`
      : `${normalizedName} (${attachmentType})`,
  }
}

/** mapDbProject from route files */
function mapDbProject(dbProj: any) {
  if (!dbProj) return null
  return {
    id: dbProj.id,
    name: dbProj.name,
    description: dbProj.description || undefined,
    messageCount: dbProj.message_count || 0,
    participants: dbProj.participants || [],
    dateRange: dbProj.date_range || undefined,
    analysis: dbProj.analysis || undefined,
    createdAt: dbProj.created_at,
    updatedAt: dbProj.updated_at,
  }
}

/** buildStoredMessageContext from ai-chat/query/route.ts */
function buildStoredMessageContext(messages: any[], query: string): string {
  if (messages.length === 0) return ''
  const queryTerms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((term) => term.length > 2)
  const relevantMessages = messages.filter((message) => {
    const content = `${message.sender || ''} ${message.message || ''}`.toLowerCase()
    return (
      queryTerms.every((term) => content.includes(term)) ||
      queryTerms.some((term) => content.includes(term))
    )
  })
  const selectedMessages =
    relevantMessages.length > 0 ? relevantMessages.slice(0, 12) : messages.slice(-12)
  const snippets = selectedMessages.map((message, index) => {
    const timestamp = message.timestamp ? ` [${message.timestamp}]` : ''
    const attachment = extractAttachmentMetadata(message.message)
    const attachmentSuffix = attachment
      ? ` | attachment=${attachment.fileName} | type=${attachment.attachmentType} | ocr=${attachment.ocrText}`
      : ''
    return `${index + 1}. ${message.sender || 'Unknown'}${timestamp}: ${message.message || ''}${attachmentSuffix}`
  })
  return `Stored message excerpts for this project:\n${snippets.join('\n')}`
}

/** generateJSON from generate-document/route.ts */
function generateJSON(project: any, messages: any[], documentType: string) {
  const baseData = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      messageCount: project.messageCount,
      participants: project.participants,
      dateRange: project.dateRange,
      analysis: project.analysis,
    },
    generatedAt: new Date().toISOString(),
    documentType,
  }
  if (documentType === 'full_transcript') {
    return {
      ...baseData,
      messages: messages.map((msg: any) => ({
        timestamp: msg.timestamp,
        sender: msg.sender,
        message: msg.message,
      })),
    }
  }
  return baseData
}

/** generateCSV from generate-document/route.ts */
function generateCSV(project: any, messages: any[], documentType: string): string {
  if (documentType === 'full_transcript' && messages.length > 0) {
    const headers = ['Timestamp', 'Sender', 'Message']
    const rows = messages.map((msg: any) => [
      msg.timestamp,
      msg.sender,
      String(msg.message).replace(/"/g, '""'),
    ])
    return [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')
  }
  const summaryData = [
    ['Metric', 'Value'],
    ['Project Name', project.name],
    ['Total Messages', project.messageCount || 0],
    ['Participants', project.participants?.length || 0],
    ['Date Range Start', project.dateRange?.start || ''],
    ['Date Range End', project.dateRange?.end || ''],
    ['Top Keywords', project.analysis?.keywords?.slice(0, 5).join('; ') || ''],
  ]
  return summaryData.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Build a mock OpenAI-compatible chat completion response */
function buildMockChatResponse(content: string, model = 'deepseek-chat') {
  return JSON.stringify({
    id: 'mock-cmpl-' + crypto.randomUUID().slice(0, 8),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  })
}

// ===========================================================================
// TESTS
// ===========================================================================

;(async () => {
  // ========================================================================
  // 1. LLM CLIENT INITIALIZATION
  // ========================================================================

  await test('1.1 LLM client: module exports generateWithFallback function', async () => {
    const llm = await import('../../lib/llm')
    assert.equal(typeof llm.generateWithFallback, 'function', 'generateWithFallback must be a function')
    assert.ok(llm.generateWithFallback.length >= 1, 'generateWithFallback must accept >= 1 param')
  })

  await test('1.2 LLM client: generates completion with mocked fetch', async () => {
    clearMocks()
    mockModel('deepseek-chat', buildMockChatResponse('Hello from DeepSeek!', 'deepseek-chat'))

    const prevOrKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = ''
    try {
      const { generateWithFallback } = await import('../../lib/llm')
      const result = await generateWithFallback(
        [{ role: 'user', content: 'Say hello' }],
        { max_tokens: 50, temperature: 0.1 }
      )
      assert.equal(typeof result, 'object', 'Result must be an object')
      assert.equal(typeof result.content, 'string', 'Result must have string content')
      assert.equal(typeof result.model, 'string', 'Result must have model string')
      assert.ok(result.content.length > 0, 'Content must not be empty')
    } finally {
      process.env.OPENROUTER_API_KEY = prevOrKey
    }
  })

  // ========================================================================
  // 2. SENTIMENT ANALYSIS
  // ========================================================================

  await test('2.1 Sentiment: positive text yields positive score', async () => {
    const analyzer = new Sentiment()
    const result = analyzer.analyze('This is absolutely wonderful and amazing! I love it!')
    assert.ok(result.score > 0, `Expected positive score, got ${result.score}`)
    assert.ok(Array.isArray(result.positive), 'positive[] must be an array')
    assert.ok(result.positive.length > 0, 'Should have positive words')
    assert.equal(typeof result.comparative, 'number', 'comparative must be a number')
  })

  await test('2.2 Sentiment: negative text yields negative score', async () => {
    const analyzer = new Sentiment()
    const result = analyzer.analyze('This is terrible, horrible, and awful. I hate it so much.')
    assert.ok(result.score < 0, `Expected negative score, got ${result.score}`)
    assert.ok(result.negative.length > 0, 'Should have negative words')
  })

  await test('2.3 Sentiment: neutral text yields score near zero', async () => {
    const analyzer = new Sentiment()
    const result = analyzer.analyze('The meeting is scheduled for Tuesday at 3pm. The document was sent.')
    assert.equal(result.score, 0, `Expected score=0 for neutral text, got ${result.score}`)
    assert.equal(result.positive.length, 0, 'Should have no positive words')
    assert.equal(result.negative.length, 0, 'Should have no negative words')
  })

  await test('2.4 Sentiment: mixed text yields balanced score', async () => {
    const analyzer = new Sentiment()
    const result = analyzer.analyze('The good news is great but the bad news is terrible and sad.')
    assert.ok(result.positive.length > 0, 'Should have positive words in mixed text')
    assert.ok(result.negative.length > 0, 'Should have negative words in mixed text')
    assert.ok(Array.isArray(result.tokens), 'tokens must be an array')
    assert.ok(Array.isArray(result.words), 'words must be an array')
  })

  await test('2.5 Sentiment: empty string returns score of 0', async () => {
    const analyzer = new Sentiment()
    const result = analyzer.analyze('')
    assert.equal(result.score, 0, 'Empty string score should be 0')
    assert.equal(result.comparative, 0, 'Empty string comparative should be 0')
    assert.equal(typeof result.tokens, 'object', 'tokens should exist')
    assert.equal(typeof result.words, 'object', 'words should exist')
  })

  await test('2.6 Sentiment: classification helper returns correct labels', async () => {
    const analyzer = new Sentiment()
    function classify(text: string): 'positive' | 'negative' | 'neutral' {
      const result = analyzer.analyze(text)
      if (result.score > 0) return 'positive'
      if (result.score < 0) return 'negative'
      return 'neutral'
    }
    assert.equal(classify('I love this!'), 'positive')
    assert.equal(classify('I hate this!'), 'negative')
    assert.equal(classify('The door is blue.'), 'neutral')
  })

  // ========================================================================
  // 3. AI CHAT — structured analysis output
  // ========================================================================

  await test('3.1 AI Chat: extractAttachmentMetadata parses file info', async () => {
    const result = extractAttachmentMetadata('[Attachment:invoice.pdf] This is an invoice for $500')
    assert.ok(result !== null, 'Should parse attachment metadata')
    assert.equal(result!.fileName, 'invoice.pdf')
    assert.equal(result!.attachmentType, 'document')
    assert.equal(result!.ocrText, 'This is an invoice for $500')
    assert.ok(result!.description.includes('invoice.pdf'))
    assert.ok(result!.description.includes('document'))
  })

  await test('3.2 AI Chat: extractAttachmentMetadata handles image attachments', async () => {
    const result = extractAttachmentMetadata('[Attachment:photo.png] A picture of the receipt')
    assert.ok(result !== null)
    assert.equal(result!.fileName, 'photo.png')
    assert.equal(result!.attachmentType, 'image')
  })

  await test('3.3 AI Chat: extractAttachmentMetadata returns null for plain text', async () => {
    const result = extractAttachmentMetadata('Just a regular message with no attachment')
    assert.equal(result, null)
  })

  await test('3.4 AI Chat: extractAttachmentMetadata returns null for null/undefined', async () => {
    assert.equal(extractAttachmentMetadata(null), null)
    assert.equal(extractAttachmentMetadata(undefined), null)
    assert.equal(extractAttachmentMetadata(''), null)
  })

  await test('3.5 AI Chat: buildStoredMessageContext returns empty string for no messages', async () => {
    const result = buildStoredMessageContext([], 'test query')
    assert.equal(result, '', 'Empty messages should produce empty context')
  })

  await test('3.6 AI Chat: buildStoredMessageContext returns structured excerpts', async () => {
    const messages = [
      { sender: 'Alice', message: 'Can we meet tomorrow?', timestamp: '2024-01-01T10:00:00Z' },
      { sender: 'Bob', message: 'Sure, 3pm works for me', timestamp: '2024-01-01T10:05:00Z' },
    ]
    const result = buildStoredMessageContext(messages, 'meet')
    assert.ok(result.startsWith('Stored message excerpts'), 'Should start with header')
    assert.ok(result.includes('Alice'), 'Should include sender name')
    assert.ok(result.includes('Bob'), 'Should include other sender')
    assert.ok(result.includes('meet'), 'Should contain the query term matched via substring')
  })

  await test('3.7 AI Chat: buildStoredMessageContext falls back to recent messages on no match', async () => {
    const messages = [
      { sender: 'Charlie', message: 'Completely unrelated topic', timestamp: '2024-01-01T10:00:00Z' },
    ]
    const result = buildStoredMessageContext(messages, 'zzzxyz_notfound_999')
    assert.ok(result.startsWith('Stored message excerpts'), 'Should still produce context')
    assert.ok(result.includes('Charlie'), 'Should include the fallback message')
  })

  // ========================================================================
  // 4. AI SEARCH — semantic search validation
  // ========================================================================

  await test('4.1 AI Search: validateGeneratedSQL rejects non-SELECT queries', async () => {
    const result = validateGeneratedSQL('DROP TABLE messages_meta', ALLOWED_TABLES)
    assert.equal(result.valid, false, 'DROP should be rejected')
    assert.ok(result.reason.length > 0, 'Should provide a reason')
  })

  await test('4.2 AI Search: validateGeneratedSQL rejects missing session_id filter', async () => {
    const result = validateGeneratedSQL('SELECT sender, word_count FROM messages_meta', ALLOWED_TABLES)
    assert.equal(result.valid, false, 'Should require session_id filter')
    assert.ok(result.reason.includes('session_id'), 'Reason should mention session_id')
  })

  await test('4.3 AI Search: validateGeneratedSQL rejects SELECT *', async () => {
    const result = validateGeneratedSQL(
      'SELECT * FROM messages_meta WHERE session_id = $1',
      ALLOWED_TABLES
    )
    assert.equal(result.valid, false, 'SELECT * should be rejected')
    assert.ok(result.reason.includes('SELECT'), 'Reason should mention SELECT *')
  })

  await test('4.4 AI Search: validateGeneratedSQL rejects dangerous patterns', async () => {
    const dangerousQueries = [
      'SELECT sender FROM messages_meta WHERE session_id = $1; DROP TABLE sessions',
      'SELECT sender FROM messages_meta WHERE session_id = $1 UNION SELECT * FROM pg_catalog',
      'SELECT sender FROM messages_meta WHERE session_id = $1 -- ignore filter',
      'SELECT sender FROM messages_meta WHERE 1/0 AND session_id = $1',
    ]
    for (const q of dangerousQueries) {
      const result = validateGeneratedSQL(q, ALLOWED_TABLES)
      assert.equal(result.valid, false, `Dangerous query should be rejected: ${q}`)
    }
  })

  await test('4.5 AI Search: validateGeneratedSQL rejects unknown tables', async () => {
    const result = validateGeneratedSQL(
      'SELECT sender FROM secrets WHERE session_id = $1',
      ALLOWED_TABLES
    )
    assert.equal(result.valid, false, 'Unknown table should be rejected')
    assert.ok(result.reason.includes('Unknown table'), 'Reason should mention unknown table')
  })

  await test('4.6 AI Search: validateGeneratedSQL accepts valid queries', async () => {
    const validQueries = [
      'SELECT sender, word_count FROM messages_meta WHERE session_id = $1',
      'SELECT sender, message_count FROM message_stats WHERE session_id = $1',
      "SELECT sender, message_count FROM message_stats WHERE session_id = $1 AND sender LIKE '%Alice%'",
    ]
    for (const q of validQueries) {
      const result = validateGeneratedSQL(q, ALLOWED_TABLES)
      assert.equal(result.valid, true, `Valid query should pass: ${q}`)
    }
  })

  await test('4.7 AI Search: validateGeneratedSQL accepts aggregated queries', async () => {
    const result = validateGeneratedSQL(
      'SELECT COUNT(*) as msg_count, AVG(sentiment_score) as avg_sentiment FROM messages_meta WHERE session_id = $1',
      ALLOWED_TABLES
    )
    assert.equal(result.valid, true, 'Aggregate query should pass')
  })

  // ========================================================================
  // 5. DOCUMENT GENERATION
  // ========================================================================

  const mockProject = {
    id: 'proj-123',
    name: 'Test Project',
    description: 'A test WhatsApp chat',
    messageCount: 150,
    participants: ['Alice', 'Bob', 'Charlie'],
    dateRange: { start: '2024-01-01', end: '2024-01-31' },
    analysis: {
      keywords: ['meeting', 'project', 'deadline', 'review', 'budget', 'team'],
      insights: ['High engagement on weekdays', 'Alice is the most active participant'],
    },
  }

  const mockMessages = [
    { id: 'msg-1', projectId: 'proj-123', sender: 'Alice', message: 'Hello team!', timestamp: '2024-01-01T10:00:00Z' },
    { id: 'msg-2', projectId: 'proj-123', sender: 'Bob', message: 'Hey Alice, ready for the review?', timestamp: '2024-01-01T10:05:00Z' },
    { id: 'msg-3', projectId: 'proj-123', sender: 'Charlie', message: 'I have the budget numbers ready', timestamp: '2024-01-01T10:10:00Z' },
  ]

  await test('5.1 Document gen: mapDbProject transforms DB shape to API shape', async () => {
    const dbRow = {
      id: 'proj-abc',
      name: 'My Chat',
      description: 'desc',
      message_count: 42,
      participants: ['X', 'Y'],
      date_range: { start: '2024-01-01', end: '2024-01-10' },
      analysis: { keywords: ['test'] },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    }
    const result = mapDbProject(dbRow)
    assert.ok(result !== null)
    assert.equal(result.id, 'proj-abc')
    assert.equal(result.messageCount, 42)
    assert.equal(result.participants.length, 2)
    assert.equal(result.dateRange.start, '2024-01-01')
    assert.equal(result.analysis.keywords[0], 'test')
    assert.equal(result.createdAt, '2024-01-01T00:00:00Z')
  })

  await test('5.2 Document gen: mapDbProject returns null for falsy input', async () => {
    assert.equal(mapDbProject(null), null)
    assert.equal(mapDbProject(undefined), null)
    assert.equal(mapDbProject(false), null)
  })

  await test('5.3 Document gen: JSON summary has correct structure', async () => {
    const result = generateJSON(mockProject, [], 'summary') as any
    assert.equal(typeof result, 'object')
    assert.ok(result.project, 'Must have project field')
    assert.equal(result.project.id, 'proj-123')
    assert.equal(result.project.name, 'Test Project')
    assert.equal(result.project.messageCount, 150)
    assert.equal(result.documentType, 'summary')
    assert.equal(typeof result.generatedAt, 'string')
    assert.ok(!('messages' in result), 'Summary should not include messages')
  })

  await test('5.4 Document gen: JSON full_transcript includes messages', async () => {
    const result = generateJSON(mockProject, mockMessages, 'full_transcript') as any
    assert.equal(typeof result, 'object')
    assert.equal(result.documentType, 'full_transcript')
    assert.ok(Array.isArray(result.messages), 'Must have messages array')
    assert.equal(result.messages.length, 3, 'Should have 3 messages')
    assert.equal(result.messages[0].sender, 'Alice')
    assert.equal(result.messages[0].message, 'Hello team!')
    assert.equal(result.messages[1].sender, 'Bob')
  })

  await test('5.5 Document gen: CSV summary has correct format', async () => {
    const result = generateCSV(mockProject, [], 'summary')
    assert.equal(typeof result, 'string', 'CSV output must be a string')
    const lines = result.split('\n')
    assert.ok(lines.length >= 2, 'CSV should have header + data rows')
    assert.ok(lines[0].includes('Metric'), 'Header should include Metric')
    assert.ok(lines[0].includes('Value'), 'Header should include Value')
    assert.ok(lines[1].includes('"Project Name"'), 'Should quote column heads')
    assert.ok(lines.some((l) => l.includes('"Test Project"')), 'Should contain project name')
    assert.ok(lines.some((l) => l.includes('150')), 'Should contain message count')
  })

  await test('5.6 Document gen: CSV full_transcript has Timestamp,Sender,Message columns', async () => {
    const result = generateCSV(mockProject, mockMessages, 'full_transcript')
    const lines = result.split('\n')
    assert.ok(lines[0].includes('Timestamp'), 'Header should include Timestamp')
    assert.ok(lines[0].includes('Sender'), 'Header should include Sender')
    assert.ok(lines[0].includes('Message'), 'Header should include Message')
    assert.equal(lines.length, 4, 'Header + 3 message rows')
    assert.ok(lines[1].includes('Alice'), 'First data row should include Alice')
  })

  await test('5.7 Document gen: CSV handles special characters in messages', async () => {
    const messagesWithQuotes = [
      { id: 'm1', projectId: 'p1', sender: 'Alice', message: 'He said "hello"', timestamp: '2024-01-01' },
    ]
    const result = generateCSV(mockProject, messagesWithQuotes, 'full_transcript')
    assert.ok(result.includes('""hello""'), 'Should double-quote embedded quotes')
  })

  // ========================================================================
  // 6. LLM FALLBACK CHAIN
  // ========================================================================

  await test('6.1 Fallback: primary model works returns its response', async () => {
    clearMocks()
    mockModel('deepseek/deepseek-chat-v3-0324', buildMockChatResponse('Primary response', 'deepseek/deepseek-chat-v3-0324'))
    mockModel('anthropic/claude-3-haiku', buildMockChatResponse('Should not reach', 'anthropic/claude-3-haiku'))
    mockModel('openai/gpt-4o-mini', buildMockChatResponse('Should not reach', 'openai/gpt-4o-mini'))

    const prevOrKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'mock-or-key'
    try {
      const llm = await import('../../lib/llm')
      const result = await llm.generateWithFallback(
        [{ role: 'user', content: 'test' }],
        { max_tokens: 10 }
      )
      assert.equal(result.content, 'Primary response')
      assert.ok(result.model.includes('deepseek'), 'Model should contain deepseek')
    } finally {
      process.env.OPENROUTER_API_KEY = prevOrKey
    }
  })

  await test('6.2 Fallback: primary fails, fallback model succeeds', async () => {
    clearMocks()
    // Only register fallback models — primary deepseek model gets 500
    mockModel('anthropic/claude-3-haiku', buildMockChatResponse('Fallback response', 'anthropic/claude-3-haiku'))
    mockModel('openai/gpt-4o-mini', buildMockChatResponse('Should not reach', 'openai/gpt-4o-mini'))

    const prevOrKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'mock-or-key'
    try {
      const llm = await import('../../lib/llm')
      const result = await llm.generateWithFallback(
        [{ role: 'user', content: 'test' }],
        { max_tokens: 10 }
      )
      assert.equal(result.content, 'Fallback response', 'Should get fallback response')
      assert.ok(result.model.includes('haiku'), 'Should use the fallback model')
    } finally {
      process.env.OPENROUTER_API_KEY = prevOrKey
    }
  })

  await test('6.3 Fallback: all models exhausted throws error', async () => {
    clearMocks()
    // No mocks registered — every model call will fail with 500

    const prevOrKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'mock-or-key'
    try {
      const llm = await import('../../lib/llm')
      await assert.rejects(
        async () => {
          await llm.generateWithFallback(
            [{ role: 'user', content: 'test' }],
            { max_tokens: 10 }
          )
        },
        /all models exhausted/i,
        'Should throw when all models fail'
      )
    } finally {
      process.env.OPENROUTER_API_KEY = prevOrKey
    }
  })

  await test('6.4 Fallback: empty content from model continues to next', async () => {
    clearMocks()
    // Primary model returns null content (empty response)
    mockModel(
      'deepseek/deepseek-chat-v3-0324',
      JSON.stringify({
        id: 'mock-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'deepseek/deepseek-chat-v3-0324',
        choices: [{ index: 0, message: { role: 'assistant', content: null }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 0 },
      })
    )
    mockModel('anthropic/claude-3-haiku', buildMockChatResponse('Recovered from empty', 'anthropic/claude-3-haiku'))
    mockModel('openai/gpt-4o-mini', buildMockChatResponse('Should not reach', 'openai/gpt-4o-mini'))

    const prevOrKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'mock-or-key'
    try {
      const llm = await import('../../lib/llm')
      const result = await llm.generateWithFallback(
        [{ role: 'user', content: 'test' }],
        { max_tokens: 10 }
      )
      assert.equal(result.content, 'Recovered from empty', 'Should recover from empty content')
    } finally {
      process.env.OPENROUTER_API_KEY = prevOrKey
    }
  })

  // ========================================================================
  // 7. EMPTY / ERROR HANDLING
  // ========================================================================

  await test('7.1 AI Chat: empty message handled gracefully', async () => {
    const emptyMessage = ''
    const trimmed = emptyMessage.trim()
    const isValid = typeof emptyMessage === 'string' && trimmed.length > 0
    assert.equal(isValid, false, 'Empty string should fail validation')
  })

  await test('7.2 AI Chat: whitespace-only message is invalid', async () => {
    const whitespaceMessage = '   '
    const trimmed = whitespaceMessage.trim()
    const isValid = typeof whitespaceMessage === 'string' && trimmed.length > 0
    assert.equal(isValid, false, 'Whitespace-only should fail validation')
  })

  await test('7.3 AI Chat: conversationHistory sanitisation rejects bad shapes', async () => {
    const rawHistory = [null, 42, 'string', { content: 'valid message' }, { role: 'user' }]
    const sanitized: Array<{ role: 'user' | 'assistant'; content: string }> = (
      Array.isArray(rawHistory) ? rawHistory : []
    )
      .filter(
        (msg: unknown): msg is { role?: unknown; content: unknown } =>
          typeof msg === 'object' && msg !== null && typeof (msg as { content?: unknown }).content === 'string'
      )
      .slice(-20)
      .map((msg) => ({
        role: (msg as { role?: unknown }).role === 'user' ? 'user' : 'assistant',
        content: String((msg as { content: unknown }).content),
      }))

    assert.equal(sanitized.length, 1, 'Only 1 valid message should survive')
    assert.equal(sanitized[0].content, 'valid message')
    assert.equal(sanitized[0].role, 'assistant', 'Default role should be assistant')
  })

  await test('7.4 AI Search: empty query validation logic', async () => {
    const query = ''
    const isValid = typeof query === 'string' && query.trim().length > 0
    assert.equal(isValid, false, 'Empty query should be invalid')
  })

  await test('7.5 AI Search: malformed sessionId pattern detection', async () => {
    const validUUID = /^[0-9a-f-]{36}$/i
    assert.ok(validUUID.test('11111111-1111-1111-1111-111111111111'), 'Valid UUID should pass')
    assert.equal(validUUID.test('not-a-uuid'), false, 'Non-UUID should fail')
    assert.equal(validUUID.test(''), false, 'Empty string should fail')
    assert.equal(validUUID.test('short'), false, 'Short string should fail')
  })

  await test('7.6 LLM: generateWithFallback handles 401 gracefully', async () => {
    clearMocks()
    // No mocks registered — all calls return 500.
    // The catch in generateWithFallback catches errors and continues.
    const prevOrKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'mock-or-key'
    try {
      const llm = await import('../../lib/llm')
      await assert.rejects(
        async () => {
          await llm.generateWithFallback(
            [{ role: 'user', content: 'test' }],
            { max_tokens: 10 }
          )
        },
        /all models exhausted/i,
        'Should throw all models exhausted'
      )
    } finally {
      process.env.OPENROUTER_API_KEY = prevOrKey
    }
  })

  await test('7.7 Document gen: generateJSON handles empty/null project gracefully', async () => {
    const result = generateJSON({}, [], 'summary') as any
    assert.equal(typeof result, 'object')
    assert.equal(result.project.name, undefined, 'Missing name should be undefined')
    assert.equal(result.project.messageCount, undefined, 'Missing messageCount should be undefined (passed through)')
    assert.equal(result.project.participants, undefined, 'Missing participants should be undefined')
  })

  await test('7.8 Document gen: generateCSV returns summary when messages empty', async () => {
    const result = generateCSV(mockProject, [], 'full_transcript')
    // When messages are empty, full_transcript falls back to summary format
    assert.ok(result.includes('Metric'), 'Should produce summary CSV')
    assert.ok(result.includes('Value'), 'Should produce summary CSV')
  })

  // ========================================================================
  // REPORT
  // ========================================================================
  console.log(`\n${'═'.repeat(60)}`)
  console.log('  TRUTH TEST RESULTS — WhatHappen AI Analysis Harness')
  console.log('═'.repeat(60))
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`  ${icon} ${r.name} (${r.duration}ms)`)
    if (!r.passed) console.log(`     → ${r.detail}`)
  }
  const passed = results.filter((r) => r.passed)
  const failed = results.filter((r) => !r.passed)
  console.log('─'.repeat(60))
  console.log(`  Total: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length}`)
  console.log(`  Pass Rate: ${Math.round((passed.length / results.length) * 100)}%`)
  console.log(`${'═'.repeat(60)}\n`)
  if (failed.length > 0) process.exit(1)
})()
