import test from 'node:test';import assert from 'node:assert/strict';
import {createService,toolDefinitions} from '../../scripts/mcp/service.mjs';
import {normalizeMessages} from '../../scripts/mcp/analytics.mjs';
const projectId='11111111-1111-4111-8111-111111111111';
const records=Array.from({length:130},(_,i)=>({id:String(i).padStart(3,'0'),projectId,conversationId:'chat',sender:'A',message:'float LKR 100',timestamp:'2026-05-01T10:00:00Z'}));
const snapshot={projectId,revision:'1',complete:true,totalMessages:130,messages:normalizeMessages(records),fetchedAt:'2026-09-06T00:00:00Z',verifiedAt:'2026-09-06T00:00:00Z',archiveLatestMessage:'2026-05-01T10:00:00Z',archiveEarliestMessage:'2026-05-01T10:00:00Z'};
const client={snapshot:async()=>snapshot};
test('pagination is query-bound, complete and preserves stable citations',async()=>{
 const s=createService(client,projectId);const a=await s.call('whathappen_search_chat',{query:'float',limit:100});assert.equal(a.structuredContent.data.records.length,100);const cursor=a.structuredContent.pagination.nextCursor;assert.ok(cursor);
 const b=await s.call('whathappen_search_chat',{query:'float',limit:100,cursor});assert.equal(b.structuredContent.data.records.length,30);assert.equal(b.structuredContent.pagination.nextCursor,null);
 assert.equal((await s.call('whathappen_search_chat',{query:'other',limit:100,cursor})).isError,true);
});
test('all tool results stay within UTF8 budgets including duplicate text and structured results',async()=>{
 const huge={...snapshot,totalMessages:2,messages:normalizeMessages([{...records[0],message:'🙂'.repeat(26000)},records[1]])};
 const s=createService({snapshot:async()=>huge},projectId);for(const name of toolDefinitions.map(t=>t.name)){
  const args=name==='whathappen_search_chat'?{query:''}:name==='whathappen_get_context'?{messageId:'000'}:{};
  const r=await s.call(name,args);assert.ok(Buffer.byteLength(JSON.stringify(r))<=100000,name);assert.equal(r.isError,undefined,name);
 }
 const r=await s.call('whathappen_search_chat',{query:''});assert.equal(r.structuredContent.pagination.omittedOversized,1);assert.equal(r.structuredContent.data.records[0].id,'001');
});
test('validation errors do not read the archive',async()=>{
 let reads=0;const s=createService({snapshot:async()=>{reads++;return snapshot}},projectId);
 for(const args of [{query:42},{query:'a',limit:1.5},{query:'a',projectId:'bad'},{query:'a',startDate:'2026-02-30'},{query:'a',surprise:'x'}])assert.equal((await s.call('whathappen_search_chat',args)).isError,true);
 assert.equal(reads,0);
});
test('metadata default is below 4KB and tool definitions are explicit read-only schemas',async()=>{
 const s=createService(client,projectId);const r=await s.call('whathappen_get_metadata',{});assert.ok(Buffer.byteLength(JSON.stringify(r))<4096);
 for(const t of toolDefinitions){assert.equal(t.annotations.readOnlyHint,true);assert.ok(t.outputSchema);assert.equal(t.inputSchema.additionalProperties,false);}
});
test('sender-filtered reply metrics retain other participants as reply context',async()=>{
 const messages=normalizeMessages([{...records[0],sender:'Alice'}, {...records[1],sender:'Bob',timestamp:'2026-05-01T10:02:00Z'}]);
 const s=createService({snapshot:async()=>({...snapshot,messages,totalMessages:2})},projectId);
 const r=await s.call('whathappen_response_times',{sender:'Bob'});assert.equal(r.structuredContent.data.records[0]?.averageMinutes,2);
});
