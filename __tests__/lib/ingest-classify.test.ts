/**
 * Phase 1 — upload classification.
 *
 * One function decides the route. The UI badge and the worker both read it, so
 * the display can never drift from what actually happens to the file. Every
 * threshold is tested on both sides, because an off-by-one here silently sends
 * a 400 MB archive down the inline path that buffers it into memory.
 */
import {
  classifyUpload,
  INLINE_MAX_BYTES,
  BATCH_THRESHOLD_BYTES,
  type IngestRoute,
} from '@/lib/ingest/classify'

const MB = 1024 * 1024

const route = (fileName: string, size: number): IngestRoute =>
  classifyUpload({ fileName, sizeBytes: size }).route

describe('classifyUpload — route selection', () => {
  it('sends small plain text straight through', () => {
    expect(route('chat.txt', 1 * MB)).toBe('TEXT_DIRECT')
    expect(route('rows.csv', 1 * MB)).toBe('TEXT_DIRECT')
    expect(route('export.json', 1 * MB)).toBe('TEXT_DIRECT')
  })

  it('takes text off the inline path once it is too big to buffer', () => {
    expect(route('chat.txt', INLINE_MAX_BYTES - 1)).toBe('TEXT_DIRECT')
    expect(route('chat.txt', INLINE_MAX_BYTES)).toBe('DOC_PARSE')
    expect(route('chat.txt', INLINE_MAX_BYTES + 1)).toBe('DOC_PARSE')
  })

  it('routes documents to the extraction path at any size', () => {
    expect(route('statement.pdf', 1 * MB)).toBe('DOC_PARSE')
    expect(route('notes.docx', 200 * MB)).toBe('DOC_PARSE')
    expect(route('ledger.xlsx', 5 * MB)).toBe('DOC_PARSE')
  })

  it('separates ordinary archives from ones that need batching', () => {
    expect(route('chat.zip', BATCH_THRESHOLD_BYTES - 1)).toBe('ZIP_OCR')
    expect(route('chat.zip', BATCH_THRESHOLD_BYTES)).toBe('ZIP_BATCHED')
    expect(route('chat.zip', 1130 * MB)).toBe('ZIP_BATCHED')
  })

  it('rejects an extension with no parser rather than accepting it silently', () => {
    // .pst is in the upload allowlist but nothing can read it. Accepting a file
    // the system cannot parse wastes the user's upload and strands the bytes.
    const r = classifyUpload({ fileName: 'archive.pst', sizeBytes: 1 * MB })
    expect(r.route).toBe('UNSUPPORTED')
    expect(r.reason).toMatch(/no parser/i)
  })

  it('rejects an unknown extension', () => {
    expect(route('mystery.bin', 1 * MB)).toBe('UNSUPPORTED')
    expect(route('noextension', 1 * MB)).toBe('UNSUPPORTED')
  })

  it('is case-insensitive about extensions', () => {
    expect(route('CHAT.ZIP', 1 * MB)).toBe('ZIP_OCR')
    expect(route('Statement.PDF', 1 * MB)).toBe('DOC_PARSE')
  })
})

describe('classifyUpload — what the UI renders', () => {
  it('gives every route a human label and a batch count where it applies', () => {
    const small = classifyUpload({ fileName: 'a.zip', sizeBytes: 50 * MB })
    expect(small.label).toBe('Archive — unzip and OCR')
    expect(small.batches).toBe(1)

    const large = classifyUpload({ fileName: 'b.zip', sizeBytes: 1130 * MB })
    expect(large.label).toMatch(/^Large archive — split into \d+ batches$/)
    expect(large.batches).toBeGreaterThan(1)
  })

  it('derives batch count from size and reports it in the label', () => {
    const r = classifyUpload({ fileName: 'c.zip', sizeBytes: 4 * BATCH_THRESHOLD_BYTES })
    expect(r.batches).toBe(4)
    expect(r.label).toContain('4 batches')
  })

  it('marks which routes run inline on the gateway and which go to the worker', () => {
    expect(classifyUpload({ fileName: 'a.txt', sizeBytes: 1 * MB }).runsOn).toBe('gateway')
    expect(classifyUpload({ fileName: 'a.zip', sizeBytes: 50 * MB }).runsOn).toBe('worker')
    expect(classifyUpload({ fileName: 'a.pdf', sizeBytes: 1 * MB }).runsOn).toBe('worker')
  })

  it('never returns a batch count for something that is not batched', () => {
    expect(classifyUpload({ fileName: 'a.txt', sizeBytes: 1 * MB }).batches).toBe(1)
    expect(classifyUpload({ fileName: 'x.bin', sizeBytes: 1 * MB }).batches).toBe(0)
  })
})

describe('classifyUpload — hostile input', () => {
  it('does not trust a double extension', () => {
    expect(route('evil.zip.exe', 1 * MB)).toBe('UNSUPPORTED')
  })

  it('handles zero and negative sizes without throwing', () => {
    expect(route('a.zip', 0)).toBe('UNSUPPORTED')
    expect(route('a.zip', -1)).toBe('UNSUPPORTED')
  })
})
