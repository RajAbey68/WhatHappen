import test from 'node:test';import assert from 'node:assert/strict';
import {ArchiveClient} from '../../scripts/mcp/client.mjs';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const message=(p,id)=>({id,projectId:p,conversationId:'chat',sender:'A',message:'hello',timestamp:'2026-05-01T00:00:00Z'});
function fixture(){let mint=0;const seen=[];return {seen,get mint(){return mint},fetch:async(url,opts={})=>{
 const u=new URL(url);seen.push({url,headers:opts.headers});
 if(u.pathname==='/api/auth/challenge')return Response.json({nonce:'n'});
 if(u.pathname==='/api/project-token'){mint++;const p=JSON.parse(opts.body).projectId;return Response.json({token:p,expiresAt:Date.now()+3600000});}
 const p=u.pathname.split('/')[3];if(opts.headers['x-project-token']!==p)return Response.json({}, {status:401});
 return Response.json({messages:[message(p,p)],nextCursor:null,revision:'1',complete:true,totalMessages:1,archiveLatestMessage:'2026-05-01T00:00:00Z'});
}};}
test('tokens remain project scoped and simultaneous calls are coalesced',async()=>{const f=fixture(),c=new ArchiveClient({fetch:f.fetch,hash:'synthetic'});const [one,two]=await Promise.all([c.snapshot(a),c.snapshot(a)]);assert.equal(f.mint,1);assert.equal(one.revision,two.revision);assert.equal((await c.snapshot(b)).messages[0].projectId,b);assert.equal(f.mint,2);});
test('one 401 refreshes only once; permanent denial fails',async()=>{let calls=0,mints=0;const c=new ArchiveClient({hash:'x',fetch:async(url)=>{if(url.includes('/challenge'))return Response.json({nonce:'n'});if(url.endsWith('/project-token')){mints++;return Response.json({token:'t',expiresAt:Date.now()+3600000});}calls++;return Response.json({error:'denied'},{status:401});}});await assert.rejects(c.snapshot(a),/401/);assert.equal(calls,2);assert.equal(mints,2);});
test('changing revisions and incomplete pages never become a complete archive',async()=>{let page=0;const f=fixture();const c=new ArchiveClient({hash:'x',fetch:async(url,o)=>{if(url.includes('/auth/')||url.endsWith('/project-token'))return f.fetch(url,o);page++;return Response.json({messages:[message(a,String(page))],nextCursor:page%2?'next':null,revision:String(page),complete:page%2===0,totalMessages:2});}});await assert.rejects(c.snapshot(a),/revision/i);});
test('rejects non-loopback URLs and oversized input before archive processing',async()=>{assert.throws(()=>new ArchiveClient({baseUrl:'http://example.com',hash:'x'}),/loopback/);const f=fixture();const c=new ArchiveClient({hash:'x',maxMessages:0,fetch:f.fetch});await assert.rejects(c.snapshot(a),/limit/i);});
