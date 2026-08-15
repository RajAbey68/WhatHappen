/**
 * Phase 1 additions, both found while double-checking the zip/OCR uploader.
 *
 * 1. OCR endpoint had two different defaults for one service.
 *    lib/gemini-ocr.ts fell back to the Vercel URL; process-file fell back to
 *    http://localhost:3099. OCR_MICROSERVICE_URL is not set on Cloud Run, so
 *    image OCR reached Vercel and worked while PDF OCR dialled localhost inside
 *    the container and burned its 30s timeout before giving up. One exported
 *    constant now, so a second default cannot drift back in.
 *
 * 2. Progress and failure shared sessions.processing_error.
 *    Stage labels ("Extracting ZIP archive...") were written to the same column
 *    a real failure lands in, so a non-null processing_error meant nothing and
 *    an actual error was indistinguishable from a status update. Progress now
 *    goes to processing_stage; processing_error is failures only.
 */
import { OCR_MICROSERVICE_URL } from '@/lib/gemini-ocr'
import fs from 'fs'
import path from 'path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
const routeSrc = () => read('app/api/process-file/route.ts')

describe('OCR endpoint — one source of truth', () => {
  it('never falls back to localhost', () => {
    expect(OCR_MICROSERVICE_URL).not.toMatch(/localhost/)
    expect(OCR_MICROSERVICE_URL).toMatch(/^https:\/\//)
  })

  it('process-file imports the constant instead of re-deriving the URL', () => {
    const src = routeSrc()
    expect(src).not.toContain('http://localhost:3099')
    expect(src).not.toMatch(/process\.env\.OCR_MICROSERVICE_URL\s*\|\|/)
    expect(src).toContain('OCR_MICROSERVICE_URL')
  })

  it('honours the environment variable when it is set', async () => {
    const original = process.env.OCR_MICROSERVICE_URL
    process.env.OCR_MICROSERVICE_URL = 'https://ocr.internal.example'
    jest.resetModules()
    const m = await import('@/lib/gemini-ocr')
    expect(m.OCR_MICROSERVICE_URL).toBe('https://ocr.internal.example')
    if (original === undefined) delete process.env.OCR_MICROSERVICE_URL
    else process.env.OCR_MICROSERVICE_URL = original
    jest.resetModules()
  })
})

describe('progress must not be written to the error column', () => {
  it('updateSessionProgress writes processing_stage, not processing_error', () => {
    const src = routeSrc()
    const start = src.indexOf('const updateSessionProgress')
    expect(start).toBeGreaterThan(-1)
    const fn = src.slice(start, start + 900)
    expect(fn).toContain('processing_stage')
    expect(fn).not.toContain('processing_error: step')
  })

  it('failures still populate processing_error', () => {
    const src = routeSrc()
    expect(src).toMatch(/processing_status:\s*'error'/)
    expect(src).toMatch(/processing_error:/)
  })

  it('the client selects and renders the stage column', () => {
    const ui = read('components/file-upload.tsx')
    expect(ui).toContain('processing_stage')
    // The progress branch must key off the stage, not the error column.
    expect(ui).not.toContain("processing_status === 'processing' && session.processing_error")
  })
})
