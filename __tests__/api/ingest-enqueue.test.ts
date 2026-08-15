/**
 * Phase 1 — enqueue and status routes.
 *
 * These are the only two things Cloud Run does for a large upload: write a job
 * row, and report on it. All the heavy work moves to the hermes-dev worker.
 *
 * The authorization assertions matter more than the happy path. Both routes use
 * the service-role client, which bypasses RLS, so requireProjectAccess is the
 * only thing standing between an anonymous caller and another project's jobs.
 */
import { NextRequest } from 'next/server'

const mockRequireProjectAccess = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/api-auth', () => ({
  requireProjectAccess: (...args: unknown[]) => mockRequireProjectAccess(...args),
  isAuthBypassed: () => false,
}))
jest.mock('@/lib/auth', () => ({
  getServiceClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

const PROJECT = 'd4bdd730-c283-46c7-9236-a4256852277f'

// A hand-rolled double rather than a real NextRequest: constructing one with a
// body in jsdom does not give a working .json(). Same shape the other route
// tests in this repo use.
const post = (body: unknown) =>
  ({
    method: 'POST',
    headers: { get: () => null, has: () => false },
    cookies: { get: () => undefined, getAll: () => [] },
    json: async () => body,
  }) as unknown as NextRequest

const validBody = {
  projectId: PROJECT,
  storagePath: `${PROJECT}/1786000000-chat.zip`,
  fileName: 'chat.zip',
  sizeBytes: 400 * 1024 * 1024,
}

describe('POST /api/ingest/enqueue', () => {
  beforeEach(() => {
    jest.resetModules()
    mockRequireProjectAccess.mockReset().mockResolvedValue(null)
    mockFrom.mockReset()
  })

  it('refuses when the project credential is missing or wrong', async () => {
    const { NextResponse } = await import('next/server')
    mockRequireProjectAccess.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
    const { POST } = await import('@/app/api/ingest/enqueue/route')
    const res = await POST(post(validBody))
    expect(res.status).toBe(401)
  })

  it('authorizes against the projectId in the body, not just any token', async () => {
    const { POST } = await import('@/app/api/ingest/enqueue/route')
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: 'job-1', status: 'queued' }, error: null }),
        }),
      }),
    })
    await POST(post(validBody))
    expect(mockRequireProjectAccess).toHaveBeenCalledWith(expect.anything(), PROJECT)
  })

  it('rejects a file the system cannot parse before any row is written', async () => {
    const { POST } = await import('@/app/api/ingest/enqueue/route')
    const res = await POST(post({ ...validBody, fileName: 'archive.pst' }))
    expect(res.status).toBe(415)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('stores the classified route and batch count so the worker cannot re-derive them', async () => {
    let inserted: Record<string, unknown> = {}
    mockFrom.mockReturnValue({
      insert: (row: Record<string, unknown>) => {
        inserted = row
        return {
          select: () => ({
            single: async () => ({ data: { id: 'job-1', ...row }, error: null }),
          }),
        }
      },
    })
    const { POST } = await import('@/app/api/ingest/enqueue/route')
    const res = await POST(post(validBody))
    expect(res.status).toBe(202)
    expect(inserted.route).toBe('ZIP_BATCHED')
    expect(inserted.total_batches).toBe(4)
    expect(inserted.status).toBe('queued')
    expect(inserted.project_id).toBe(PROJECT)
  })

  it('returns the keys the client needs to poll', async () => {
    mockFrom.mockReturnValue({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({ data: { id: 'job-1', ...row }, error: null }),
        }),
      }),
    })
    const { POST } = await import('@/app/api/ingest/enqueue/route')
    const body = await (await POST(post(validBody))).json()
    expect(body.jobId).toBe('job-1')
    expect(body.route).toBe('ZIP_BATCHED')
    expect(body.label).toContain('batches')
    expect(body.batches).toBe(4)
    expect(body.runsOn).toBe('worker')
  })

  it('validates its inputs', async () => {
    const { POST } = await import('@/app/api/ingest/enqueue/route')
    expect((await POST(post({ ...validBody, projectId: 'not-a-uuid' }))).status).toBe(400)
    expect((await POST(post({ ...validBody, sizeBytes: 0 }))).status).toBe(400)
    expect((await POST(post({ ...validBody, storagePath: '' }))).status).toBe(400)
  })
})
