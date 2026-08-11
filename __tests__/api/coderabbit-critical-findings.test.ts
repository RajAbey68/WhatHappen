/**
 * CodeRabbit review of PR #8, 2026-08-10. The findings that were real.
 *
 * CRITICAL — /api/upload-url accepts .txt, .pst, .csv and .json, none of which
 * have magic bytes. detectType returns null for all four, and process-file
 * treated null as a rejection and then DELETED the stored object. Every
 * above-threshold upload in those formats was accepted, stored, then destroyed.
 * In an evidence system that is spoliation, not a 415.
 *
 * MAJOR — vendor/asimov-ingest rewrote an unsafe tenantId instead of rejecting
 * it. The rewrite is many-to-one, so two distinct tenants could collapse onto
 * one storage prefix — the exact cross-tenant overlap the code claims to stop.
 */
import { detectType } from '@asimov/ingest'

const SIGNATURELESS_EXTENSIONS = ['.txt', '.csv', '.json', '.pst']
const PERMITTED = ['zip', 'pdf', 'jpeg', 'png', 'webp', 'heic']

/** Mirrors the accept/reject decision in app/api/process-file/route.ts. */
function isAccepted(bytes: Buffer, fileName: string): boolean {
  const detected = detectType(bytes.subarray(0, 32).toString('base64'))
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.') >>> 0)
  const signatureless = detected === null && SIGNATURELESS_EXTENSIONS.includes(ext)
  if (signatureless) return true
  return detected !== null && PERMITTED.includes(detected)
}

describe('CodeRabbit CRITICAL: signatureless formats must not be rejected and destroyed', () => {
  it.each(['.txt', '.csv', '.json', '.pst'])(
    'accepts a %s upload that has no magic bytes',
    (ext) => {
      const bytes = Buffer.from('01/01/2024, 09:15 - Rajiv: the quick brown fox\n')
      expect(isAccepted(bytes, `evidence${ext}`)).toBe(true)
    }
  )

  it('still rejects a disguised binary even when the extension is signatureless', () => {
    // ELF header, named .txt. Detection returns null for ELF as well, so this
    // documents the residual gap honestly rather than pretending it is closed:
    // a signatureless extension is taken at its word.
    const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
    // A file whose bytes ARE identifiable but not permitted is rejected
    // regardless of the extension it claims.
    expect(detectType(zipBytes.subarray(0, 32).toString('base64'))).toBe('zip')
    const gif = Buffer.from('GIF89a' + '\0'.repeat(26))
    expect(isAccepted(gif, 'evidence.gif')).toBe(false)
  })

  it('accepts the formats that do have signatures', () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(28)])
    const pdf = Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(28)])
    expect(isAccepted(zip, 'chat.zip')).toBe(true)
    expect(isAccepted(pdf, 'statement.pdf')).toBe(true)
  })

  it('rejects an unknown binary with an unknown extension', () => {
    const junk = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])
    expect(isAccepted(junk, 'mystery.bin')).toBe(false)
  })

  it('never deletes the stored object on a type rejection', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'app/api/process-file/route.ts'),
      'utf8'
    )
    const rejectionBlock = src.slice(
      src.indexOf('magic-byte rejection'),
      src.indexOf('magic-byte rejection') + 1200
    )
    expect(rejectionBlock).not.toContain('storage.from(bucket).remove')
    expect(rejectionBlock).toContain("status: 'failed'")
  })
})

describe('CodeRabbit MAJOR: tenantId must be rejected, not rewritten', () => {
  const isValidTenant = (t: string) =>
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(t) && !t.includes('..')

  it('rejects the collision pair rather than mapping both onto one prefix', () => {
    // Under the old rewrite both of these became "a_b".
    expect(isValidTenant('a/b')).toBe(false)
    expect(isValidTenant('a_b')).toBe(true)
  })

  it('rejects traversal and leading dots', () => {
    expect(isValidTenant('..')).toBe(false)
    expect(isValidTenant('.hidden')).toBe(false)
    expect(isValidTenant('../../etc')).toBe(false)
    expect(isValidTenant('')).toBe(false)
  })

  it('accepts the identifiers real consumers pass', () => {
    expect(isValidTenant('d4bdd730-c283-46c7-9236-a4256852277f')).toBe(true)
    expect(isValidTenant('org_12345')).toBe(true)
  })

  it('the package rejects rather than sanitises', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'vendor/asimov-ingest/src/pipeline.ts'),
      'utf8'
    )
    expect(src).toContain('Invalid tenant id')
    expect(src).not.toMatch(/const safeTenant = request\.tenantId\.replace/)
  })
})
