/** @jest-environment node */
import { GET } from '../../app/api/mcp/[projectId]/messages/route'
import { issueProjectToken } from '../../lib/api-auth'
const mockRpc = jest.fn()
jest.mock('@/lib/auth', () => ({ getServiceClient: () => ({ rpc: mockRpc }), requireAuth: jest.fn() }))
jest.mock('@/lib/crypto', () => ({ decryptText: jest.fn(async () => { throw new Error('bad key') }) }))
const projectId = '11111111-1111-4111-8111-111111111111'
const original = { ...process.env }
const row = (id: string) => ({ id, project_id: projectId, sender: 'A', message: 'hello', timestamp: '2026-01-01T00:00:00Z' })
const snapshot = (rows: any[], totalMessages = rows.length, revision = '7') => ({ data: { rows, totalMessages, revision, archiveLatestMessage: rows.length ? rows[0].timestamp : null }, error: null })
const request = (query = '', token = issueProjectToken(projectId).token) => ({ url: `http://localhost/api/mcp/${projectId}/messages${query}`, headers: new Map([['x-project-token',token]]) }) as any
beforeEach(() => { mockRpc.mockReset(); process.env.APP_SESSION_SECRET = 'synthetic-test'; delete process.env.APP_SESSION_VERSION })
afterEach(() => { process.env = { ...original } })
test('requires token even in test environment; malformed limit denied before database', async () => {
 expect((await GET(request('', ''), {params:{projectId}})).status).toBe(401)
 expect((await GET(request('?limit=501'), {params:{projectId}})).status).toBe(400)
 expect(mockRpc).not.toHaveBeenCalled()
})
test('pages stable ties, preserves nullable provenance and exact completeness', async () => {
 mockRpc.mockResolvedValueOnce(snapshot([row('1')], 2))
 const first = await (await GET(request('?limit=1'), {params:{projectId}})).json()
 expect(first.messages[0]).toEqual({id:'1',projectId,sender:'A',message:'hello',timestamp:'2026-01-01T00:00:00Z',conversationId:null,replyToId:null,sourceId:null})
 expect(first.complete).toBe(false)
 mockRpc.mockResolvedValueOnce(snapshot([{...row('2'), conversation_id:'thread',reply_to_id:'1',source_id:'file'}], 2))
 const second = await (await GET(request(`?limit=1&cursor=${first.nextCursor}`), {params:{projectId}})).json()
 expect(mockRpc).toHaveBeenLastCalledWith('mcp_archive_page', {p_project_id:projectId,p_offset:1,p_limit:1})
 expect(second.complete).toBe(true); expect(second.nextCursor).toBeNull()
 expect(second.messages[0].conversationId).toBe('thread')
})
test('rejects changed revisions, cursor query changes and absent migrations', async () => {
 mockRpc.mockResolvedValueOnce(snapshot([row('1')], 2))
 const first = await (await GET(request('?limit=1'), {params:{projectId}})).json()
 mockRpc.mockResolvedValueOnce(snapshot([row('2')], 2, '8'))
 expect((await GET(request(`?limit=1&cursor=${first.nextCursor}`), {params:{projectId}})).status).toBe(409)
 expect((await GET(request(`?limit=2&cursor=${first.nextCursor}`), {params:{projectId}})).status).toBe(400)
 mockRpc.mockResolvedValueOnce({error:{code:'PGRST202'},data:null})
 const unavailable = await GET(request(), {params:{projectId}})
 expect(unavailable.status).toBe(503); expect((await unavailable.json()).code).toBe('MIGRATION_REQUIRED')
})
test('empty archive is complete, partial DB page is never declared complete', async () => {
 mockRpc.mockResolvedValueOnce(snapshot([]))
 expect(await (await GET(request(), {params:{projectId}})).json()).toMatchObject({messages:[],complete:true,nextCursor:null,totalMessages:0})
 mockRpc.mockResolvedValueOnce(snapshot([], 2))
 expect((await GET(request(), {params:{projectId}})).status).toBe(503)
})
test.each(['sender','message'])('failed %s decryption rejects whole export', async field => {
 delete process.env.PROJECT_PASSPHRASE
 mockRpc.mockResolvedValueOnce(snapshot([{...row('1'),[field]:JSON.stringify({ciphertext:'x',salt:'y',iv:'z'})}]))
 const response = await GET(request(), {params:{projectId}})
 expect(response.status).toBe(422); expect(await response.json()).not.toHaveProperty('messages')
})
