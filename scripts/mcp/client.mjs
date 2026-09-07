import crypto from 'node:crypto';
import {normalizeMessages} from './analytics.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class ArchiveClient {
 constructor({baseUrl='http://127.0.0.1:3000',hash,hashes={},fetch:fetcher=globalThis.fetch,maxMessages=50000,maxBytes=64*1024*1024,timeout=20000}={}){
  const u=new URL(baseUrl);if(!['127.0.0.1','localhost','167.233.236.178'].includes(u.hostname)||u.protocol!=='http:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('API URL must be an HTTP loopback origin or verified Hermes host');
  this.baseUrl=`http://${u.hostname}:${u.port||80}`;this.hash=hash;this.hashes=hashes;this.fetch=fetcher;this.maxMessages=maxMessages;this.maxBytes=maxBytes;this.timeout=timeout;
  this.tokens=new Map();this.tokenPending=new Map();this.snapshots=new Map();this.pending=new Map();
 }
 async json(path,options={},budget=16*1024*1024){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),this.timeout);
  try{
   const res=await this.fetch(this.baseUrl+path,{...options,redirect:'error',signal:ctl.signal});
   if(!res.ok){const e=new Error(`Archive request failed (${res.status})${res.status===503?': apply the MCP archive migration and configure server credentials':''}`);e.status=res.status;throw e;}
   if(Number(res.headers.get('content-length'))>budget){await res.body?.cancel();throw new Error('Archive response byte limit exceeded');}
   const reader=res.body?.getReader();let text='';if(reader){const decoder=new TextDecoder();let bytes=0;while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>budget){await reader.cancel();throw new Error('Archive response byte limit exceeded');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}else text=await res.text();
   return JSON.parse(text);
  }catch(e){if(e.name==='AbortError')throw new Error('Archive request timed out; verify the SSH tunnel and backend');throw e;}finally{clearTimeout(timer);}
 }
 async token(projectId,refresh=false){
  if(!UUID.test(projectId))throw new Error('Invalid project UUID');
  if(refresh)this.tokens.delete(projectId);
  const cached=this.tokens.get(projectId);if(cached&&cached.expiresAt>Date.now()+15000)return cached.token;
  if(this.tokenPending.has(projectId))return this.tokenPending.get(projectId);
  const job=(async()=>{const hash=this.hashes[projectId]||this.hash;if(!hash)throw new Error('Configure the project authentication verifier');
   const {nonce}=await this.json(`/api/auth/challenge?projectId=${encodeURIComponent(projectId)}`,{},16384);if(typeof nonce!=='string'||nonce.length>8192)throw new Error('Invalid authentication challenge');
   const proof=crypto.createHmac('sha256',hash).update(nonce).digest('hex');
   const data=await this.json('/api/project-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,challenge:nonce,proof})},16384);
   if(typeof data.token!=='string'||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now())throw new Error('Invalid project token response');
   this.tokens.set(projectId,data);return data.token;
  })();this.tokenPending.set(projectId,job);try{return await job;}finally{this.tokenPending.delete(projectId);}
 }
 async page(projectId,cursor=null){
  const path=`/api/mcp/${projectId}/messages?limit=500${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`;
  for(let attempt=0;attempt<2;attempt++){const token=await this.token(projectId,attempt===1);try{return await this.json(path,{headers:{'x-project-token':token}});}catch(e){if(e.status!==401||attempt===1)throw e;}}
 }
 async snapshot(projectId){
  if(this.pending.has(projectId))return this.pending.get(projectId);
  const job=this.load(projectId);this.pending.set(projectId,job);try{return await job;}finally{this.pending.delete(projectId);}
 }
 async load(projectId){
  for(let attempt=0;attempt<2;attempt++){
   try{
    let page=await this.page(projectId);const revision=String(page.revision);if(page.revision===undefined)throw new Error('Archive revision missing');
    // Probe every call even when cached: honors revocation and detects archive edits.
    const cached=this.snapshots.get(projectId);if(cached&&cached.revision===revision)return {...cached,verifiedAt:new Date().toISOString()};
    let messages=[],bytes=0;const cursors=new Set();const total=page.totalMessages;
    if(!Number.isInteger(total)||total<0||total>this.maxMessages)throw new Error('Archive message limit exceeded; narrow the project or raise the documented bound');
    while(true){
     if(String(page.revision)!==revision){const e=new Error('Archive revision changed during retrieval');e.status=409;throw e;}
     if(!Array.isArray(page.messages)||page.messages.length>500||page.totalMessages!==total)throw new Error('Invalid archive page');
     bytes+=Buffer.byteLength(JSON.stringify(page.messages),'utf8');messages.push(...page.messages);
     if(bytes>this.maxBytes||messages.length>this.maxMessages)throw new Error('Archive memory limit exceeded');
     if(page.nextCursor===null){if(page.complete!==true||messages.length!==total)throw new Error('Incomplete archive snapshot');break;}
     if(typeof page.nextCursor!=='string'||!page.nextCursor||cursors.has(page.nextCursor)||page.messages.length===0)throw new Error('Invalid archive continuation cursor');
     cursors.add(page.nextCursor);page=await this.page(projectId,page.nextCursor);
    }
    const normalized=normalizeMessages(messages);if(normalized.some(m=>m.projectId!==projectId))throw new Error('Cross-project archive record rejected');
    const now=new Date().toISOString();const snapshot={projectId,revision,messages:normalized,totalMessages:total,complete:true,fetchedAt:now,verifiedAt:now,archiveLatestMessage:normalized.at(-1)?.timestamp||null,archiveEarliestMessage:normalized[0]?.timestamp||null};
    if(this.snapshots.size>=4)this.snapshots.delete(this.snapshots.keys().next().value);this.snapshots.set(projectId,snapshot);return snapshot;
   }catch(e){if(e.status===409&&attempt===0){this.snapshots.delete(projectId);continue;}throw e;}
  }
 }
}
