import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const projectId='11111111-1111-4111-8111-111111111111';
test('real stdio client initializes, calls every tool and rejects malformed calls against a synthetic HTTP archive',async()=>{
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Content-Type','application/json');
  if(u.pathname==='/api/auth/challenge')return res.end(JSON.stringify({nonce:'synthetic'}));
  if(u.pathname==='/api/project-token')return res.end(JSON.stringify({token:'synthetic-token',expiresAt:Date.now()+3600000}));
  if(req.headers['x-project-token']!=='synthetic-token'){res.statusCode=401;return res.end('{}');}
  if(u.pathname!==`/api/mcp/${projectId}/messages`){res.statusCode=404;return res.end('{}');}
  return res.end(JSON.stringify({messages:[{id:'source-1',projectId,conversationId:'chat',sender:'A',message:'Paid LKR 100',timestamp:'2026-05-01T10:00:00Z'}],nextCursor:null,revision:'1',complete:true,totalMessages:1,archiveLatestMessage:'2026-05-01T10:00:00Z'}));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const transport=new StdioClientTransport({command:process.execPath,args:['scripts/whathappen-mcp.mjs'],env:{PATH:process.env.PATH,WHATHAPPEN_API_URL:`http://127.0.0.1:${server.address().port}`,WHATSAPP_PASSPHRASE_HASH:'synthetic',WHATHAPPEN_PROJECT_ID:projectId,WHATHAPPEN_ENV_FILE:'/nonexistent'},stderr:'pipe'});
 const client=new Client({name:'mcp-regression',version:'1.0.0'});let stderr='';transport.stderr?.on('data',d=>{stderr+=d});
 try{await client.connect(transport);const {tools}=await client.listTools();assert.equal(tools.length,8);
  for(const t of tools){const args=t.name==='whathappen_search_chat'?{query:'Paid'}:t.name==='whathappen_get_context'?{messageId:'source-1'}:{};
   const r=await client.callTool({name:t.name,arguments:args});assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.source.complete,true);assert.ok(Buffer.byteLength(JSON.stringify(r))<=100000);
  }
  const bad=await client.callTool({name:'whathappen_search_chat',arguments:{query:1}});assert.equal(bad.isError,true);
 }finally{await client.close();await new Promise(resolve=>server.close(resolve));}
},{timeout:20000});
