/** @jest-environment node */
import { GET } from '../../app/api/ai-chat/[projectId]/route'
const mockRows: any[] = []
const mockDecrypt = jest.fn()
jest.mock('@/lib/api-auth', () => ({ requireProjectAccess: jest.fn(async () => null) }))
jest.mock('@/lib/crypto', () => ({ decryptText: (...args: any[]) => mockDecrypt(...args) }))
jest.mock('@/lib/auth', () => ({ getServiceClient: () => ({ from: (table: string) => {
 const q: any = { select: () => q, eq: () => q,
 maybeSingle: async () => ({data:{id:'p'},error:null}),
 order: () => table === 'messages' ? q : Promise.resolve({data:[],error:null}),
 range: async () => ({data:mockRows,error:null}) }
 return q
} }) }))
const original = {...process.env}
const envelope = JSON.stringify({ciphertext:'abc',salt:'def',iv:'123'})
const request = {url:'http://localhost/api/ai-chat/p?passphrase=request-secret',headers:new Map([['x-project-passphrase','request-secret']])} as any
beforeEach(() => {mockRows.length = 0;mockDecrypt.mockReset()})
afterEach(() => {process.env = {...original}})
test.each(['sender','message'])('fails closed for %s without server key despite supplied request key', async field => {
 delete process.env.PROJECT_PASSPHRASE
 mockRows.push({id:'1',sender:'A',message:'hi',[field]:envelope})
 expect((await GET(request,{params:{projectId:'p'}})).status).toBe(422)
 expect(mockDecrypt).not.toHaveBeenCalled()
})
test('wrong configured key rejects sender rather than returning its ciphertext', async () => {
 process.env.PROJECT_PASSPHRASE = 'server-key'
 mockDecrypt.mockRejectedValue(new Error('failed'))
 mockRows.push({id:'1',sender:envelope,message:'hi'})
 expect((await GET(request,{params:{projectId:'p'}})).status).toBe(422)
 expect(mockDecrypt).toHaveBeenCalledWith('abc','server-key','def','123')
})
