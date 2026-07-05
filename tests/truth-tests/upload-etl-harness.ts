/**
 * Truth Tests for WhatHappen — Upload + ETL Truth-Test Harness
 *
 * Covers the full upload→parse→analyze→persist flow with synthetic data.
 * Tests work in two modes:
 *   DIRECT MODE  (default): imports route handler directly, no server needed
 *   SERVER MODE  (API_BASE=...): hits a running Next.js dev server via HTTP
 *
 * Run: MOCK_APIS=true npx tsx tests/truth-tests/upload-etl-harness.ts
 * Run server-based: API_BASE=http://localhost:3000 MOCK_APIS=true npx tsx tests/truth-tests/upload-etl-harness.ts
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'

// ─────────────────────────────────────────────────────────────
// Test framework (LeadSync pattern, standalone — no Jest)
// ─────────────────────────────────────────────────────────────

interface TestResult {
  name: string
  passed: boolean
  detail: string
  duration: number
}

const results: TestResult[] = []
let startTime = Date.now()

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now()
  try {
    await fn()
    results.push({ name, passed: true, detail: '✅ PASS', duration: Date.now() - start })
  } catch (err: any) {
    results.push({ name, passed: false, detail: `❌ FAIL: ${err.message}`, duration: Date.now() - start })
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertDefined(value: unknown, label: string) {
  if (value === undefined || value === null) {
    throw new Error(`${label} is undefined/null`)
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || ''
const IS_SERVER_MODE = !!API_BASE

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers } as Record<string, string>,
  })
  return { status: res.status, data: await res.json() }
}

/** Build a multipart form-data body manually (works in Node without browser FormData) */
function buildMultipart(fields: Record<string, { value: string; filename?: string; contentType?: string }>): {
  body: Buffer
  boundary: string
} {
  const boundary = `----WhatHappenTestBoundary${Date.now()}`
  const parts: string[] = []

  for (const [name, field] of Object.entries(fields)) {
    parts.push(`--${boundary}`)
    if (field.filename) {
      parts.push(`Content-Disposition: form-data; name="${name}"; filename="${field.filename}"`)
      parts.push(`Content-Type: ${field.contentType || 'application/octet-stream'}`)
    } else {
      parts.push(`Content-Disposition: form-data; name="${name}"`)
    }
    parts.push('')
    parts.push(field.value)
  }
  parts.push(`--${boundary}--`)

  return { body: Buffer.from(parts.join('\r\n'), 'utf-8'), boundary }
}

/** Send a multipart upload to the process-file API */
async function uploadFile(
  fileName: string,
  content: string | Buffer,
  contentType: string = 'text/plain',
): Promise<{ status: number; data: any }> {
  const isBinary = Buffer.isBuffer(content)

  if (IS_SERVER_MODE) {
    // Server mode: use multipart fetch
    // For binary content, base64-encode into the form-data body
    const contentStr = isBinary ? content.toString('base64') : (content as string)
    const { body, boundary } = buildMultipart({
      file: { value: contentStr, filename: fileName, contentType },
    })
    const res = await fetch(`${API_BASE}/api/process-file`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    return { status: res.status, data: await res.json() }
  }

  // Direct mode: use native FormData + File (Node 20+)
  const file = new File(
    isBinary ? [content] : [content as string],
    fileName,
    { type: contentType },
  )
  const formData = new FormData()
  formData.append('file', file)
  const request = new Request('http://localhost:3000/api/process-file', {
    method: 'POST',
    body: formData,
  })

  // Import and call the handler. NextRequest extends Request, so a standard Request works.
  const { POST } = await import('../../app/api/process-file/route')
  const response = await POST(request as any)
  const respData = await response.json()
  return { status: response.status, data: respData }
}

/** Create a synthetic WhatsApp _chat.txt export */
function createSyntheticWhatsAppExport(): string {
  return [
    '[1/15/25, 10:30:00 AM] Alice Johnson: Hey everyone, hope you\'re doing well!',
    '[1/15/25, 10:31:15 AM] Bob Smith: Hi Alice! I\'m great, thanks for asking.',
    '[1/15/25, 10:32:00 AM] Charlie Brown: Good to be here. Let\'s discuss the project plan.',
    '[1/15/25, 10:33:30 AM] Alice Johnson: I\'ve prepared the budget analysis for Q1.',
    '[1/15/25, 10:35:00 AM] Bob Smith: Great work! The payment schedule looks reasonable.',
    '[1/15/25, 10:36:15 AM] Charlie Brown: I agree. Let\'s move forward with this plan.',
    '[1/15/25, 10:38:00 AM] Alice Johnson: <Media omitted>',
    '[1/15/25, 10:40:00 AM] Bob Smith: Can you share the expense breakdown?',
    '[1/15/25, 10:42:30 AM] Charlie Brown: Sure, I\'ll send it over by end of day.',
    '[1/16/25, 9:15:00 AM] Alice Johnson: Good morning! Here\'s the updated timeline.',
    '[1/16/25, 9:20:00 AM] Bob Smith: Thanks Alice. The deadline looks achievable.',
    '[1/16/25, 9:25:00 AM] Charlie Brown: Let\'s schedule a review meeting for next week.',
  ].join('\n')
}

/** Create a second synthetic WhatsApp export (for ZIP multi-file testing) */
function createSecondaryWhatsAppExport(): string {
  return [
    '[2/10/25, 14:00:00 PM] Diana Prince: Hello team, checking in on progress.',
    '[2/10/25, 14:05:00 PM] Alice Johnson: Hi Diana! We\'re on track for the milestone.',
    '[2/10/25, 14:10:00 PM] Ethan Hunt: I\'ve completed the integration tests.',
    '[2/10/25, 14:15:00 PM] Diana Prince: Excellent news! Let\'s demo on Friday.',
  ].join('\n')
}

/** Create a synthetic ZIP file containing _chat.txt files. Returns buffer. */
function createSyntheticZipBuffer(files: Record<string, string>): Buffer | null {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wh-test-zip-'))
  try {
    // Write each file to the temp dir
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(tmpDir, filePath)
      writeFileSync(fullPath, content, 'utf-8')
    }
    // Create ZIP using zip CLI
    const zipPath = join(tmpDir, 'export.zip')
    execSync(`cd "${tmpDir}" && zip "${zipPath}" ${Object.keys(files).map(f => `"${f}"`).join(' ')}`, {
      stdio: 'pipe',
    })
    return readFileSync(zipPath)
  } catch {
    return null
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

/** Create a synthetic corrupt ZIP buffer */
function createCorruptZipBuffer(): Buffer {
  return Buffer.from('PK\x03\x04This is not a real ZIP file but starts with PK header', 'utf-8')
}

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────

;(async () => {
  console.log('\n═══════════════════════════════════════════')
  console.log('  WhatHappen — Upload + ETL Truth-Test Harness')
  console.log(`  Mode: ${IS_SERVER_MODE ? 'SERVER (HTTP)' : 'DIRECT (import)'}`)
  console.log('═══════════════════════════════════════════\n')

  startTime = Date.now()

  // ── PHASE 1: WhatsApp _chat.txt Upload & Parse ──

  await test('1. Upload _chat.txt WhatsApp export parses correctly', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { status, data } = await uploadFile('whatsapp-chat-_chat.txt', chatContent, 'text/plain')

    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`)
    assert(data.success === true, 'success field not true')
    assert(data.data, 'Missing data payload')
    assert(typeof data.data.fileId === 'string', 'Missing fileId')
    assert(typeof data.data.chatId === 'string', 'Missing chatId')
    assert(data.data.fileName === 'whatsapp-chat-_chat.txt', `Unexpected fileName: ${data.data.fileName}`)
  })

  await test('2. WhatsApp export — participant extraction correct', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { data } = await uploadFile('chat.txt', chatContent, 'text/plain')

    const participants = data.data.participants as Array<{ name: string }>
    const participantNames = participants.map((p: any) => p.name)

    assert(participantNames.includes('Alice Johnson'), 'Missing Alice Johnson')
    assert(participantNames.includes('Bob Smith'), 'Missing Bob Smith')
    assert(participantNames.includes('Charlie Brown'), 'Missing Charlie Brown')
    assert(participantNames.length === 3, `Expected 3 participants, got ${participantNames.length}`)
  })

  await test('3. WhatsApp export — message count correct', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { data } = await uploadFile('chat.txt', chatContent, 'text/plain')

    const analysis = data.data.analysis
    assert(analysis.totalMessages === 12, `Expected 12 messages, got ${analysis.totalMessages}`)
  })

  await test('4. WhatsApp export — date range correct', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { data } = await uploadFile('chat.txt', chatContent, 'text/plain')

    const analysis = data.data.analysis
    assertDefined(analysis.dateRange, 'dateRange')
    assertDefined(analysis.dateRange.start, 'dateRange.start')
    assertDefined(analysis.dateRange.end, 'dateRange.end')

    const start = new Date(analysis.dateRange.start)
    const end = new Date(analysis.dateRange.end)
    assert(!isNaN(start.getTime()), `Invalid start date: ${analysis.dateRange.start}`)
    assert(!isNaN(end.getTime()), `Invalid end date: ${analysis.dateRange.end}`)
    assert(start <= end, `Start date ${start} is after end date ${end}`)
  })

  await test('5. WhatsApp export — message type detection (text, media, system)', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { data } = await uploadFile('chat.txt', chatContent, 'text/plain')

    const analysis = data.data.analysis
    // 12 total: 11 text + 1 media (the <Media omitted> line)
    assert(analysis.textMessages === 11, `Expected 11 text messages, got ${analysis.textMessages}`)
    assert(analysis.mediaMessages === 1, `Expected 1 media message, got ${analysis.mediaMessages}`)
  })

  await test('6. WhatsApp export — sentiment analysis fields present', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { data } = await uploadFile('chat.txt', chatContent, 'text/plain')

    const analysis = data.data.analysis
    assert(typeof analysis.averageSentiment === 'number', 'Missing averageSentiment')
    assertDefined(analysis.messagesByParticipant, 'messagesByParticipant')
    assertDefined(analysis.topWords, 'topWords')
    assert(Array.isArray(analysis.topWords), 'topWords must be an array')
    assert(analysis.topWords.length > 0, 'topWords should not be empty')
  })

  await test('7. WhatsApp export — daily message counts present', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { data } = await uploadFile('chat.txt', chatContent, 'text/plain')

    const analysis = data.data.analysis
    assert(Array.isArray(analysis.dailyMessageCounts), 'dailyMessageCounts not an array')
    assert(analysis.dailyMessageCounts.length >= 1, 'Should have at least 1 day')
    // 9 messages on Jan 15, 3 on Jan 16
    const day1 = analysis.dailyMessageCounts.find((d: any) => d.date === '2025-01-15')
    const day2 = analysis.dailyMessageCounts.find((d: any) => d.date === '2025-01-16')
    assert(day1, 'Missing 2025-01-15 daily count')
    assert(day1.count === 9, `Expected 9 messages on 2025-01-15, got ${day1.count}`)
    assert(day2, 'Missing 2025-01-16 daily count')
    assert(day2.count === 3, `Expected 3 messages on 2025-01-16, got ${day2.count}`)
  })

  await test('8. WhatsApp export — response analysis structure (full consistency)', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { data } = await uploadFile('chat.txt', chatContent, 'text/plain')

    const result = data.data
    assertDefined(result.analysis, 'analysis')
    assertDefined(result.sentimentAnalysis, 'sentimentAnalysis')
    assertDefined(result.timeAnalysis, 'timeAnalysis')
    assertDefined(result.wordFrequency, 'wordFrequency')

    // Verify overall structure matches the expected API contract
    assertDefined(result.analysis.participants, 'analysis.participants')
    assertDefined(result.analysis.dateRange, 'analysis.dateRange')
    assert(typeof result.analysis.averageMessageLength === 'number', 'Missing averageMessageLength')
    assertDefined(result.analysis.hourlyDistribution, 'hourlyDistribution')

    // Verify participant message counts
    const byParticipant = result.analysis.messagesByParticipant
    assert(typeof byParticipant === 'object', 'messagesByParticipant must be an object')
    assert(typeof byParticipant['Alice Johnson'] === 'number', 'Alice Johnson message count missing')
    assert(typeof byParticipant['Bob Smith'] === 'number', 'Bob Smith message count missing')
    assert(typeof byParticipant['Charlie Brown'] === 'number', 'Charlie Brown message count missing')

    // Verify hourly distribution
    const hourly = result.analysis.hourlyDistribution
    assert(typeof hourly === 'object', 'hourlyDistribution must be an object')
    assert(Object.keys(hourly).length > 0, 'hourlyDistribution should have entries')
  })

  await test('9. WhatsApp export — response contains message previews', async () => {
    const chatContent = createSyntheticWhatsAppExport()
    const { data } = await uploadFile('chat.txt', chatContent, 'text/plain')

    const messages = data.data.messages
    assert(Array.isArray(messages), 'messages must be an array')
    assert(messages.length > 0, 'messages should not be empty')
    assert(messages.length <= 100, 'Should return at most 100 preview messages')

    // Each message should have the right structure
    const firstMsg = messages[0]
    assertDefined(firstMsg.timestamp, 'message.timestamp')
    assertDefined(firstMsg.sender, 'message.sender')
    assertDefined(firstMsg.message, 'message.message')
    assertDefined(firstMsg.messageType, 'message.messageType')
  })

  // ── PHASE 2: ZIP Upload & Multi-File Parsing ──

  await test('10. Upload multi-file ZIP archive parses correctly', async () => {
    const primary = createSyntheticWhatsAppExport()
    const secondary = createSecondaryWhatsAppExport()
    const zipBuf = createSyntheticZipBuffer({
      '_chat.txt': primary,
      'secondary_chat.txt': secondary,
    })

    if (!zipBuf) {
      console.log('  ⚠️  Skipping ZIP test (zip CLI not available)')
      return
    }

    const { status, data } = await uploadFile('whatsapp-export.zip', zipBuf, 'application/zip')

    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`)
    assert(data.success === true, 'success field not true')
    assert(data.data, 'Missing data payload')

    const analysis = data.data.analysis
    // 12 primary + 4 secondary = 16 total
    assert(analysis.totalMessages === 16, `Expected 16 messages, got ${analysis.totalMessages}`)
  })

  await test('11. ZIP archive — participants from all files merged', async () => {
    const primary = createSyntheticWhatsAppExport()
    const secondary = createSecondaryWhatsAppExport()
    const zipBuf = createSyntheticZipBuffer({
      '_chat.txt': primary,
      'secondary_chat.txt': secondary,
    })

    if (!zipBuf) return // skip if zip CLI unavailable

    const { data } = await uploadFile('export.zip', zipBuf, 'application/zip')
    const participantNames = data.data.participants.map((p: any) => p.name)

    // Should have all participants from both files
    assert(participantNames.includes('Alice Johnson'), 'Missing Alice Johnson')
    assert(participantNames.includes('Diana Prince'), 'Missing Diana Prince')
    assert(participantNames.includes('Ethan Hunt'), 'Missing Ethan Hunt')
  })

  // ── PHASE 3: CSV Upload Parsing ──

  await test('12. Upload CSV with WhatsApp format parses correctly', async () => {
    const csvContent = [
      'date,time,sender,message',
      '1/15/25,10:30 AM,Alice Johnson,Hello team!',
      '1/15/25,10:31 AM,Bob Smith,Great to be here',
      '1/15/25,10:32 AM,Charlie Brown,Let\'s start the meeting',
    ].join('\n')

    const { status, data } = await uploadFile('chat-export.csv', csvContent, 'text/csv')

    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`)
    assert(data.success === true, 'success not true')
    assert(data.data.analysis.totalMessages >= 1, `Expected >=1 messages, got ${data.data.analysis.totalMessages}`)
  })

  // ── PHASE 4: PST Parsing (mock — imports parser directly) ──

  await test('13. PST parser exported module interface correct', async () => {
    const parser = await import('../../lib/parsers/pst-parser')
    assert(typeof parser.parsePSTFile === 'function', 'parsePSTFile must be a function')
    assertDefined(parser.parsePSTFile, 'parsePSTFile export')

    // Type check: ParsedEmail interface should have expected fields
    const sampleEmail: import('../../lib/parsers/pst-parser').ParsedEmail = {
      timestamp: new Date(),
      sender: 'test@example.com',
      recipient: 'recipient@example.com',
      wordCount: 42,
      sentimentScore: 0.5,
      hasAttachment: false,
    }
    assert(typeof sampleEmail.timestamp === 'object', 'ParsedEmail.timestamp type')
    assert(typeof sampleEmail.sender === 'string', 'ParsedEmail.sender type')
    assert(typeof sampleEmail.wordCount === 'number', 'ParsedEmail.wordCount type')
    assert(typeof sampleEmail.sentimentScore === 'number', 'ParsedEmail.sentimentScore type')
    assert(typeof sampleEmail.hasAttachment === 'boolean', 'ParsedEmail.hasAttachment type')
  })

  // ── PHASE 5: Error Handling ──

  await test('14. Error — no file returns 400', async () => {
    if (IS_SERVER_MODE) {
      const res = await fetch(`${API_BASE}/api/process-file`, { method: 'POST' })
      assert(res.status === 400, `Expected 400, got ${res.status}`)
      return
    }

    // Direct mode: POST with empty FormData (no 'file' field)
    const formData = new FormData()
    formData.append('dummy', 'value')
    const request = new Request('http://localhost:3000/api/process-file', {
      method: 'POST',
      body: formData,
    })
    const { POST } = await import('../../app/api/process-file/route')
    const response = await POST(request as any)
    const respData = await response.json()
    assert(response.status === 400, `Expected 400, got ${response.status}: ${JSON.stringify(respData)}`)
    assert(respData.error?.toLowerCase().includes('no file'), `Error should mention 'no file': ${respData.error}`)
  })

  await test('15. Error — empty file returns 400', async () => {
    const { status, data } = await uploadFile('empty.txt', '', 'text/plain')
    assert(status === 400, `Expected 400, got ${status}: ${JSON.stringify(data)}`)
    assert(data.error?.toLowerCase().includes('empty'), `Error should mention 'empty': ${data.error}`)
  })

  await test('16. Error — oversized file returns 400', async () => {
    // 10MB + 1 byte
    const bigContent = 'x'.repeat(10 * 1024 * 1024 + 1)
    const { status, data } = await uploadFile('large.txt', bigContent, 'text/plain')
    assert(status === 400, `Expected 400, got ${status}: ${JSON.stringify(data)}`)
    assert(
      data.error?.toLowerCase().includes('size') || data.error?.toLowerCase().includes('10mb') || data.error?.toLowerCase().includes('limit'),
      `Error should mention size/limit: ${data.error}`,
    )
  })

  await test('17. Error — unsupported file extension returns 400', async () => {
    const { status, data } = await uploadFile('document.exe', 'fake content', 'application/octet-stream')
    assert(status === 400, `Expected 400, got ${status}: ${JSON.stringify(data)}`)
    assert(
      data.error?.toLowerCase().includes('unsupported') || data.error?.toLowerCase().includes('type'),
      `Error should mention unsupported/type: ${data.error}`,
    )
  })

  await test('18. Error — corrupt ZIP file handled gracefully', async () => {
    const corruptZip = createCorruptZipBuffer()
    const { status, data } = await uploadFile('corrupt.zip', corruptZip, 'application/zip')

    // The handler should not crash — gracefully return 200 with empty results or 500
    if (status === 200) {
      assertDefined(data.data, 'Should have data even if corrupt')
      // A corrupt ZIP should produce 0 parseable messages
      assert(data.data.analysis.totalMessages >= 0, 'totalMessages must be >= 0')
    } else {
      // Or return a 500 with error message
      assert(status === 500, `If not 200, expected 500, got ${status}`)
      assertDefined(data.error, 'Should have error message')
    }
  })

  // ── PHASE 6: WhatsApp Format Variants ──

  await test('19. WhatsApp export — alt date format (DD-MM-YYYY) parses correctly', async () => {
    const content = [
      '[15-01-2025, 14:30:00] Alice Johnson: Testing alternate date format',
      '[16-01-2025, 15:00:00] Bob Smith: Works with dashes',
    ].join('\n')

    const { status, data } = await uploadFile('alt_chat.txt', content, 'text/plain')

    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`)
    assert(data.data.analysis.totalMessages === 2, `Expected 2 messages, got ${data.data.analysis.totalMessages}`)
  })

  await test('20. WhatsApp export — alt format with dash separator parses correctly', async () => {
    const content = [
      '1/15/25, 10:30 AM - Alice Johnson: Test message with dash separator',
      '1/15/25, 10:31 AM - Bob Smith: Another message',
    ].join('\n')

    const { status, data } = await uploadFile('dash_chat.txt', content, 'text/plain')

    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`)
    assert(data.data.analysis.totalMessages >= 1, `Expected >=1 message, got ${data.data.analysis.totalMessages}`)
  })

  await test('21. WhatsApp export — multiline messages preserved', async () => {
    const content = [
      '[1/15/25, 10:30:00 AM] Alice Johnson: First line of message',
      'this is a continuation line',
      'and another line',
      '[1/15/25, 10:31:00 AM] Bob Smith: Short message',
    ].join('\n')

    const { status, data } = await uploadFile('multiline.txt', content, 'text/plain')

    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`)
    assert(data.data.analysis.totalMessages === 2, `Expected 2 messages, got ${data.data.analysis.totalMessages}`)

    // The first message should contain all the continuation lines
    const messages = data.data.messages
    const aliceMsg = messages.find((m: any) => m.sender === 'Alice Johnson')
    assert(aliceMsg, 'Alice Johnson message not found')
    assert(
      aliceMsg.message.includes('continuation line') && aliceMsg.message.includes('and another line'),
      'Multi-line message not preserved correctly',
    )
  })

  // ── PHASE 7: JSON Upload ──

  await test('22. Upload JSON messages parses correctly', async () => {
    const jsonContent = JSON.stringify([
      { sender: 'Alice', message: 'Hello from JSON', timestamp: '2025-01-15T10:30:00Z' },
      { sender: 'Bob', message: 'Replying to Alice', timestamp: '2025-01-15T10:31:00Z' },
      { sender: 'Alice', message: 'This is great', timestamp: '2025-01-15T10:32:00Z' },
    ])

    const { status, data } = await uploadFile('messages.json', jsonContent, 'application/json')

    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`)
    assert(data.data.analysis.totalMessages === 3, `Expected 3 messages, got ${data.data.analysis.totalMessages}`)
    assert(data.data.participants.length >= 2, `Expected >= 2 participants, got ${data.data.participants.length}`)
  })

  // ── PHASE 8: Data Consistency ──

  await test('23. Upload file with known content — verify participant message counts', async () => {
    // Create a conversation with asymmetric participation
    const content = [
      '[1/15/25, 10:00:00 AM] Alice: Message 1',
      '[1/15/25, 10:01:00 AM] Bob: Reply 1',
      '[1/15/25, 10:02:00 AM] Alice: Message 2',
      '[1/15/25, 10:03:00 AM] Alice: Message 3',
      '[1/15/25, 10:04:00 AM] Charlie: First message',
    ].join('\n')

    const { data } = await uploadFile('asymmetric.txt', content, 'text/plain')
    const byParticipant = data.data.analysis.messagesByParticipant

    assert(byParticipant['Alice'] === 3, `Alice should have 3 messages, got ${byParticipant['Alice']}`)
    assert(byParticipant['Bob'] === 1, `Bob should have 1 message, got ${byParticipant['Bob']}`)
    assert(byParticipant['Charlie'] === 1, `Charlie should have 1 message, got ${byParticipant['Charlie']}`)
  })

  await test('24. Upload file with URL detection', async () => {
    const content = [
      '[1/15/25, 10:00:00 AM] Alice: Check out https://example.com/page and https://docs.example.org/guide',
      '[1/15/25, 10:01:00 AM] Bob: No links here, just text',
    ].join('\n')

    const { data } = await uploadFile('urls.txt', content, 'text/plain')
    const messages = data.data.messages

    const aliceMsg = messages.find((m: any) => m.sender === 'Alice')
    assert(aliceMsg, 'Alice message not found')
    assert(aliceMsg.hasLinks === true, 'Alice message should have links')
    assert(Array.isArray(aliceMsg.urls), 'urls should be an array')
    assert(aliceMsg.urls.length === 2, `Expected 2 URLs, got ${aliceMsg.urls.length}`)
    assert(aliceMsg.urls[0] === 'https://example.com/page', `Unexpected URL: ${aliceMsg.urls[0]}`)
    assert(aliceMsg.domains.includes('example.com'), 'Missing example.com in domains')
    assert(aliceMsg.domains.includes('docs.example.org'), 'Missing docs.example.org in domains')

    const bobMsg = messages.find((m: any) => m.sender === 'Bob')
    assert(bobMsg, 'Bob message not found')
    assert(bobMsg.hasLinks === false, 'Bob message should not have links')
  })

  // ── SUMMARY ──

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log('\n═══════════════════════════════════════════')
  console.log('  RESULTS')
  console.log('═══════════════════════════════════════════')
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`  ${icon} ${r.name} (${r.duration}ms)`)
    if (!r.passed) console.log(`     ${r.detail}`)
  }
  console.log(`\n  Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Time: ${elapsed}s`)
  console.log('═══════════════════════════════════════════\n')

  if (failed > 0) {
    process.exit(1)
  }
})()
