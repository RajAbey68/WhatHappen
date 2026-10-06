#!/usr/bin/env node
/** Read-only operational smoke test. Never prints evidence or credentials.
 * Env: WHATHAPPEN_ENV_FILE, WHATHAPPEN_API_URL (HTTP loopback/tunnel),
 * WHATHAPPEN_PROJECT_ID, configured verifier; optional MCP_SMOKE_OUTPUT_DIR
 * stores raw private evidence with directory 0700 and files 0600.
 * MCP_SMOKE_MONTH defaults to May across years, or set YYYY-05.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import dotenv from 'dotenv';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ArchiveClient} from './mcp/client.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const envPath=process.env.WHATHAPPEN_ENV_FILE||path.join(repo,'.env.local');
if(fs.existsSync(envPath)){
 const env=dotenv.parse(fs.readFileSync(envPath));
 for(const [key,value] of Object.entries(env))if(process.env[key]===undefined)process.env[key]=value;
}
const requireCheck=(condition,code)=>{if(!condition){const error=new Error(code);error.smokeCode=code;throw error;}};
const aggregate=value=>process.stdout.write(JSON.stringify(value)+'\n');
let outputDir;
function save(name,data){
 if(!outputDir)return;
 fs.writeFileSync(path.join(outputDir,`${name}.json`),JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
}
function validateResult(name,result,expectedError=false){
 const bytes=Buffer.byteLength(JSON.stringify(result));
 const budget=name==='whathappen_get_metadata'?4095:100000;
 requireCheck(bytes<=budget,'RESULT_BUDGET_EXCEEDED');
 if(expectedError){
  requireCheck(result.isError===true,'EXPECTED_CONTEXT_UNAVAILABLE');
  requireCheck(result.content?.some(item=>item.type==='text'&&/Conversation provenance unavailable/.test(item.text)),'CONTEXT_ERROR_NOT_EXPLICIT');
  aggregate({tool:name,isError:true,expectedError:true,bytes,budget,schema:true});return null;
 }
 requireCheck(result.isError!==true,'TOOL_ERROR');
 const e=result.structuredContent;
 requireCheck(e&&e.schemaVersion==='3.0'&&e.tool===name&&e.untrustedData===true,'INVALID_ENVELOPE');
 requireCheck(e.source?.complete===true&&typeof e.source.revision==='string'&&Number.isInteger(e.source.totalMessages),'INVALID_SOURCE');
 requireCheck(Array.isArray(e.data?.records)&&Array.isArray(e.warnings)&&Number.isInteger(e.pagination?.returned),'INVALID_DATA_SCHEMA');
 requireCheck(e.pagination.returned===e.data.records.length,'RETURNED_COUNT_MISMATCH');
 const textual=result.content?.find(item=>item.type==='text');
 requireCheck(textual&&isDeepStrictEqual(JSON.parse(textual.text),e),'TEXT_STRUCTURED_MISMATCH');
 aggregate({tool:name,isError:false,records:e.data.records.length,totalMessages:e.source.totalMessages,revision:e.source.revision,bytes,budget,schema:true});
 return e;
}
async function main(){
 const projectId=process.env.WHATHAPPEN_PROJECT_ID||'7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59';
 const month=process.env.MCP_SMOKE_MONTH||'may';
 requireCheck(/^(may|\d{4}-05)$/.test(month),'SMOKE_MONTH_MUST_BE_MAY');
 if(process.env.MCP_SMOKE_OUTPUT_DIR){
  const base=path.resolve(process.env.MCP_SMOKE_OUTPUT_DIR);
  fs.mkdirSync(base,{recursive:true,mode:0o700});
  requireCheck(!fs.lstatSync(base).isSymbolicLink(),'OUTPUT_DIRECTORY_SYMLINK');
  fs.chmodSync(base,0o700);
  outputDir=fs.mkdtempSync(path.join(base,'mcp-smoke-'));fs.chmodSync(outputDir,0o700);
 }
 const env=Object.fromEntries(Object.entries(process.env).filter(([,v])=>typeof v==='string'));
 env.WHATHAPPEN_ENV_FILE=envPath;env.WHATHAPPEN_PROJECT_ID=projectId;
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(repo,'scripts/whathappen-mcp.mjs')],cwd:repo,env,stderr:'pipe'});
 // Consume child logs without forwarding possible raw content to stdout/stderr.
 transport.stderr?.on('data',()=>{});
 const client=new Client({name:'whathappen-private-smoke',version:'1.0.0'});
 let index=0;
 async function call(name,args,expectedError=false){
  const result=await client.callTool({name,arguments:{projectId,limit:5,...args}},undefined,{timeout:180000});
  save(`${String(++index).padStart(2,'0')}-${name}`,result);
  return validateResult(name,result,expectedError);
 }
 try{
  await client.connect(transport);
  const listed=await client.listTools();requireCheck(listed.tools.length===8,'TOOL_COUNT_MISMATCH');
  requireCheck(listed.tools.every(t=>t.outputSchema&&t.inputSchema&&t.annotations?.readOnlyHint===true),'TOOL_SCHEMA_MISSING');
  aggregate({stage:'tools-list',count:listed.tools.length,schema:true});save('tools-list',listed);
  const metadata=await call('whathappen_get_metadata',{});
  const seed=await call('whathappen_get_timeline',{raw:true});
  requireCheck(seed.data.records.length>0,'NO_EVIDENCE_FOR_SMOKE');
  const target=seed.data.records.find(m=>!m.conversationId)||seed.data.records[0];
  await call('whathappen_get_context',{messageId:target.id,before:1,after:1},!target.conversationId);
  await call('whathappen_search_chat',{query:''});
  const timeline=await call('whathappen_get_timeline',{month});
  const financial=await call('whathappen_extract_financials',{month});
  await call('whathappen_financial_summary',{month});
  await call('whathappen_response_times',{month});
  await call('whathappen_operational_snapshot',{days:7,asOf:metadata.source.archiveLatestMessage||new Date().toISOString()});
  for(const [name,first] of [['whathappen_get_timeline',timeline],['whathappen_extract_financials',financial]]){
   const repeated=await call(name,{month});
   requireCheck(repeated.source.revision===first.source.revision,'REPEAT_REVISION_CHANGED');
   // Compare complete deterministic analytical payload; freshness and signed
   // continuation cursor metadata intentionally are not equality criteria.
   requireCheck(isDeepStrictEqual(repeated.data,first.data),'REPEAT_DATA_CHANGED');
   requireCheck(repeated.pagination.totalMatches===first.pagination.totalMatches,'REPEAT_COUNT_CHANGED');
   aggregate({stage:'repeat',tool:name,revision:first.source.revision,equalData:true});
  }
  const archive=new ArchiveClient({baseUrl:process.env.WHATHAPPEN_API_URL||'http://127.0.0.1:3000',hash:process.env.WHATSAPP_PASSPHRASE_HASH,hashes:process.env.PROJECT_PASSPHRASE_HASHES?JSON.parse(process.env.PROJECT_PASSPHRASE_HASHES):{}});
  const token=await archive.token(projectId);
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
  try{
   const response=await fetch(archive.baseUrl+'/api/ai-chat/query',{method:'POST',redirect:'error',signal:ctl.signal,headers:{'Content-Type':'application/json','x-project-token':token},body:JSON.stringify({projectId,message:'Quote one recent message exactly and include its message ID'})});
   const result=await response.json();save('ai-query',result);
   requireCheck(response.status===200,'AI_QUERY_NOT_200');
   requireCheck(result.source==='local-ollama'&&typeof result.model==='string'&&result.model.length>0,'AI_QUERY_NOT_LOCAL');
   requireCheck(typeof result.response==='string'&&result.response.trim().length>0&&!/sandbox|metadata-only response/i.test(result.response),'AI_QUERY_SANDBOX_OR_EMPTY');
   requireCheck(result.evidence?.selectedMessages>0&&result.evidence.messageIds?.length>0,'AI_QUERY_NO_EVIDENCE');
   aggregate({stage:'ai-query',status:response.status,local:true,evidenceCount:result.evidence.selectedMessages,hasError:false});
  }finally{clearTimeout(timer);ctl.abort();}
  aggregate({stage:'complete',passed:true,tools:8,rawResultsSaved:Boolean(outputDir)});
 }finally{await client.close();await transport.close();}
}
main().catch(error=>{aggregate({stage:'failed',passed:false,code:error.smokeCode||'SMOKE_RUNTIME_FAILURE'});process.exitCode=1;});
