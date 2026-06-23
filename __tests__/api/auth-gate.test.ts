/** P0: legacy routes must reject unauthenticated requests (fail closed). */
import { NextResponse } from 'next/server'
const noAuthReq = () => ({ headers: { get: () => null }, json: async () => ({}) }) as any
describe('legacy routes are auth-gated', () => {
  const routes: [string, string][] = [
    ['../../app/api/projects/route', 'POST'],
    ['../../app/api/process-file/route', 'POST'],
    ['../../app/api/process-whatsapp-complete/route', 'POST'],
    ['../../app/api/ai-chat/query/route', 'POST'],
    ['../../app/api/analyze-project/route', 'POST'],
    ['../../app/api/generate-document/route', 'POST'],
  ]
  test.each(routes)('%s %s returns 401 without a token', async (mod, method) => {
    const res = await (await import(mod))[method](noAuthReq())
    expect(res.status).toBe(401)
  })
})
