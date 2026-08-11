/**
 * Adversarial third-party review, GLM-5.2 via z.ai, 2026-08-10.
 *
 * All seven security claims on PR #8 survived. These are the two findings that
 * did not concern data confidentiality and so were missed by the earlier
 * confidentiality-framed reviews.
 *
 *  1. app/api/process-file — the credential-less stateless parse path lets an
 *     anonymous caller drive paid Gemini Vision / OCR calls and up to 300s of
 *     CPU per request, unthrottled.
 *  2. app/api/generate-document — project.name is interpolated raw into
 *     Content-Disposition.
 */
import { RateLimiter } from '@asimov/ingest'

describe('RAJ-780 adversarial: stateless parse must be rate limited', () => {
  it('allows a burst then refuses, per client key', () => {
    let now = 0
    const limiter = new RateLimiter({
      capacity: 10,
      refillPerMinute: 10,
      now: () => now,
    })

    for (let i = 0; i < 10; i++) {
      expect(limiter.tryConsume('1.2.3.4')).toBe(true)
    }
    // Eleventh request in the same instant is refused.
    expect(limiter.tryConsume('1.2.3.4')).toBe(false)

    // A different caller is unaffected — the limit is per key, not global.
    expect(limiter.tryConsume('5.6.7.8')).toBe(true)

    // Six seconds later exactly one token has refilled.
    now += 6_000
    expect(limiter.tryConsume('1.2.3.4')).toBe(true)
    expect(limiter.tryConsume('1.2.3.4')).toBe(false)
  })

  it('the route wires a limiter onto the unauthenticated path only', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'app/api/process-file/route.ts'),
      'utf8'
    )
    // The limiter is consulted in the else-branch of the project-scoped gate,
    // so authorized project traffic is not throttled by it.
    expect(src).toContain('statelessParseLimiter.tryConsume')
    expect(src).toMatch(/status:\s*429/)
    const gateIndex = src.indexOf('requireProjectAccess(request, effectiveProjectId)')
    const limitIndex = src.indexOf('statelessParseLimiter.tryConsume')
    expect(gateIndex).toBeGreaterThan(-1)
    expect(limitIndex).toBeGreaterThan(gateIndex)
  })
})

describe('RAJ-780 adversarial: Content-Disposition must not take a raw project name', () => {
  const sanitise = (name: unknown) =>
    String(name ?? 'project')
      .replace(/[^A-Za-z0-9._ -]/g, '_')
      .trim()
      .slice(0, 100) || 'project'

  it('strips quotes, semicolons and control characters', () => {
    const hostile = 'evil"; filename="owned.exe\r\nX-Injected: 1'
    const safe = sanitise(hostile)
    expect(safe).not.toContain('"')
    expect(safe).not.toContain(';')
    expect(safe).not.toContain('\r')
    expect(safe).not.toContain('\n')
  })

  it('never yields an empty filename', () => {
    expect(sanitise('')).toBe('project')
    expect(sanitise(null)).toBe('project')
    expect(sanitise('///')).toBe('___')
  })

  it('bounds the length', () => {
    expect(sanitise('a'.repeat(500)).length).toBe(100)
  })

  it('the route no longer interpolates project.name directly', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'app/api/generate-document/route.ts'),
      'utf8'
    )
    expect(src).not.toContain('filename="${project.name}')
    expect(src).toContain('filename="${safeName}')
  })
})
