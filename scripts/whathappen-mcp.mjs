#!/usr/bin/env node
/** WhatHappen MCP 3.0: read-only evidence from an explicitly trusted backend. */
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import {ArchiveClient} from './mcp/client.mjs';
import {createService,toolDefinitions} from './mcp/service.mjs';

// Explicit env path is useful to stdio clients whose cwd differs from the repo.
// Never print dotenv diagnostics or secrets on the protocol stdout channel.
const envPath=process.env.WHATHAPPEN_ENV_FILE||'.env.local';
if(fs.existsSync(envPath)){const values=dotenv.parse(fs.readFileSync(envPath));for(const [key,value] of Object.entries(values))if(process.env[key]===undefined)process.env[key]=value;}
async function main(){
 let hashes={};if(process.env.PROJECT_PASSPHRASE_HASHES)hashes=JSON.parse(process.env.PROJECT_PASSPHRASE_HASHES);
 const client=new ArchiveClient({baseUrl:process.env.WHATHAPPEN_API_URL||'http://127.0.0.1:3000',hash:process.env.WHATSAPP_PASSPHRASE_HASH,hashes});
 const service=createService(client,process.env.WHATHAPPEN_PROJECT_ID||'7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59');
 const server=new Server({name:'whathappen-forensic-mcp',version:'3.0.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:toolDefinitions}));
 server.setRequestHandler(CallToolRequestSchema,async request=>service.call(request.params.name,request.params.arguments));
 await server.connect(new StdioServerTransport());
 console.error('[WhatHappen MCP] 3.0 ready (trusted-backend archive; read-only tools)');
}
main().catch(()=>{console.error('[WhatHappen MCP] Startup failed: check env configuration, loopback URL and dependencies.');process.exit(1);});
