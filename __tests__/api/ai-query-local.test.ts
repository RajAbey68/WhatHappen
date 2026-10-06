/** @jest-environment node */
jest.unmock('next/server')
import { POST } from '../../app/api/ai-chat/query/route'
import { clearAllArchiveCaches } from '../../lib/archive-cache'
const mockRelease = jest.fn()
const mockFetch = jest.fn()
const mockDecrypt = jest.fn()
const mockGte = jest.fn()
const mockLt = jest.fn()
let mockRows: any[] = []
jest.mock('@/lib/api-auth', () => ({hasAnyProjectCredential:()=>true,requireProjectAccess:async()=>null,missingCredentialResponse:jest.fn()}))
jest.mock('@/lib/queue/priority-governor', () => ({priorityGovernor:{startInteractive:()=>mockRelease}}))
jest.mock('@/lib/rag/session-cache', () => ({getOrLoadProjectSessions:async()=>({sessions:[],decryptedMsgs:[],bm25Index:{}})}))
jest.mock('@/lib/rag/embedder', () => ({retrieveRelevantSessions:jest.fn()}))
jest.mock('@/lib/rag/learning', () => ({lookupGoldenCache:jest.fn(),expandQueryWithLexicon:jest.fn(),getFewShotExemplars:()=>''}))
jest.mock('@/lib/crypto', () => ({decryptText:(...args:any[])=>mockDecrypt(...args)}))
jest.mock('@/lib/auth', () => ({
  getServiceClient: () => {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      abortSignal: () => q,
      gte: (...a: any[]) => { mockGte(...a); return q },
      lt: (...a: any[]) => { mockLt(...a); return q },
      maybeSingle: async () => ({ data: { id: 'p', name: 'Test', message_count: 2000 }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: mockRows, error: null }).then(resolve),
    }
    return {
      from: (_table: string) => q,
      rpc: async (_fn: string) => ({
        data: {
          revision: mockRows.map((r: any) => `${r.id}|${r.sender}|${r.message}|${r.timestamp}`).join('#'),
          totalMessages: mockRows.length,
          rows: mockRows.map((r: any) => ({
            id: r.id,
            conversation_id: r.conversation_id ?? null,
            reply_to_id: null,
            source_id: null,
            sender: r.sender,
            message: r.message,
            timestamp: r.timestamp,
          })),
        },
        error: null,
      }),
    }
  },
}))
const original = {...process.env}
const originalFetch = global.fetch
const req = (body:any={})=>({json:async()=>({projectId:'p',message:'payment',...body})}) as any
beforeEach(()=>{mockGte.mockReset();mockLt.mockReset();mockRelease.mockReset();mockFetch.mockReset();mockDecrypt.mockReset();global.fetch=mockFetch;mockRows=[{id:'m1',sender:'A',message:'payment pending',timestamp:'2026-01-01',conversation_id:null}];process.env.OLLAMA_URL='http://127.0.0.1:11434/api/chat'})
afterEach(()=>{process.env={...original};global.fetch=originalFetch;clearAllArchiveCaches();jest.useRealTimers()})
test('failed local model is truthful 503 and releases slot',async()=>{
 mockFetch.mockRejectedValue(new Error('offline'))
 const response=await POST(req())
 expect(response.status).toBe(503)
 expect(await response.json()).toMatchObject({code:'LOCAL_INFERENCE_UNAVAILABLE'})
 expect(mockRelease).toHaveBeenCalledTimes(1)
})
test('HTTP failure and empty model response are not successful answers',async()=>{
 for(const result of [{ok:false,status:500},{ok:true,json:async()=>({message:{content:' '}})}]){
  mockFetch.mockResolvedValueOnce(result)
  expect((await POST(req())).status).toBe(503)
 }
})
test('returns explicit sampled evidence provenance with model result',async()=>{
 mockFetch.mockResolvedValue({ok:true,json:async()=>({message:{content:'The record says payment pending.'}})})
 const response=await POST(req())
 expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({model:'gemma3:1b',source:'local-ollama',evidence:{scope:'full-archive-lexical',complete:false,messageIds:['m1'],archiveTotalMessages:1,poolSize:1,selectedMessages:1}})
 const [url,options]=mockFetch.mock.calls[0]
 expect(url).toBe('http://127.0.0.1:11434/api/chat');expect(options.redirect).toBe('error')
 expect(options.body).toContain('m1');expect(options.body).toContain('unknown')
})
test.each(['sender','message'])('encrypted %s fails closed; request key ignored',async field=>{
 delete process.env.PROJECT_PASSPHRASE
 mockRows[0][field]=JSON.stringify({ciphertext:'a',salt:'b',iv:'c'})
 const response=await POST(req({passphrase:'request-key'}))
 expect(response.status).toBe(503)
 expect(await response.json()).toMatchObject({code:'DECRYPTION_FAILED'})
 expect(mockFetch).not.toHaveBeenCalled();expect(mockRelease).toHaveBeenCalledTimes(1)
})
test('bounded timeout releases slot even while model body stalls',async()=>{
 jest.useFakeTimers()
 mockFetch.mockResolvedValue({ok:true,json:()=>new Promise(()=>{})})
 const pending=POST(req())
 await jest.advanceTimersByTimeAsync(36000)
 expect((await pending).status).toBe(503);expect(mockRelease).toHaveBeenCalledTimes(1)
 clearAllArchiveCaches()
 expect(jest.getTimerCount()).toBe(0)
})

test('explicit historical month is filtered in UTC without guessing current year',async()=>{
 mockRows=[{id:'m1',sender:'A',message:'payment pending',timestamp:'2024-02-15T09:30:00.000Z',conversation_id:null}]
 mockFetch.mockResolvedValue({ok:true,json:async()=>({message:{content:'The sample contains payment pending.'}})})
 const response=await POST(req({message:'payment in February 2024'}))
 expect(response.status).toBe(200)
 const body=await response.json()
 expect(body.evidence.scope).toBe('filtered-february 2024')
 expect(body.evidence.temporalFilter).toBe('february 2024')
 expect(body.evidence.messageIds).toEqual(['m1'])
 // The archive snapshot is filtered in-process; no server-side range scan happens.
 expect(mockGte).not.toHaveBeenCalled()
 expect(mockLt).not.toHaveBeenCalled()
 const monthOnly=await POST(req({message:'payment in February'}))
 expect(monthOnly.status).toBe(200)
 expect((await monthOnly.json()).evidence.scope).toBe('filtered-february')
})

test('configured interactive model stays warm and reports stage timing',async()=>{
 process.env.OLLAMA_MODEL='gemma3:1b'
 mockFetch.mockResolvedValue({ok:true,json:async()=>({message:{content:'The sample says payment pending.'}})})
 const response=await POST(req())
 expect(response.status).toBe(200)
 expect(response.headers.get('Server-Timing')).toMatch(/evidence;dur=/)
 expect(response.headers.get('Server-Timing')).toMatch(/inference;dur=/)
 expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({model:'gemma3:1b',keep_alive:'30m'})
})
