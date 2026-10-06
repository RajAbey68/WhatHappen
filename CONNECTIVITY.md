# WhatHappen — connection facts

Verified 2026-09-04 from a live session (not copied from older docs).

## Backend (Hermes-Dev)
- Host: `root@167.233.236.178`
- Web app / API: `http://167.233.236.178:3000` (PM2 `whathappen`)
- Upload gateway: `http://167.233.236.178:8081` (PM2 `whathappen-upload`)
- Ingest worker: PM2 `hermes-ingest`
- Local inference: Ollama on `127.0.0.1:11434` of the server (bge-m3 embed, gemma3:4b chat). Not an external API.
- Server working dir: `/root/WhatHappen`

The API is only reachable from the Mac or via SSH forward. Cloud sandboxes cannot reach it.

## Project
- Active project: **Ko Lake Analysis** — `7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59` (11,441 messages, Aug 2025–Aug 2026)
- Stale ID still found in older notes: `eea59134-…` "KoLake Conversations". Not in the server's Supabase; `POST /api/project-token` returns 404 for it. Do not use.

## Auth (passphrase gate, RAJ-747)
1. `GET /api/auth/challenge?projectId=<uuid>` → `{ nonce, expiresAt }` (60 s)
2. proof = `HMAC-SHA256(key = sha256(passphrase), msg = nonce)`
3. `POST /api/project-token` `{ projectId, challenge, proof }` → token (`x-project-token`, 2 h)

Server needs `WHATSAPP_PASSPHRASE_HASH`. The MCP script reads it from `.env.local` in its working directory.

## MCP server
- Script: `scripts/whathappen-mcp.mjs` (stdio)
- Tools: `whathappen_search_chat`, `whathappen_get_timeline`, `whathappen_get_metadata`
- Required env: `WHATHAPPEN_API_URL=http://167.233.236.178:3000` (default is loopback, which has nothing listening on the Mac)
- Must run with cwd = repo root so `.env.local` is picked up

Claude Desktop entry (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
"whathappen": {
  "command": "bash",
  "args": ["-lc", "cd /Users/rajabey/code/WhatHappen && WHATHAPPEN_API_URL=http://167.233.236.178:3000 exec node scripts/whathappen-mcp.mjs"]
}
```

Smoke test from a terminal:
```bash
cd ~/code/WhatHappen && WHATHAPPEN_API_URL=http://167.233.236.178:3000 \
printf '%s\n%s\n%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"whathappen_get_metadata","arguments":{}}}' \
| node scripts/whathappen-mcp.mjs
```

## Supabase
- URL: `https://pomgvxdokjmxyfbgazls.supabase.co`
- Keys live in `.env.local` and the Supabase dashboard. Never commit them. MCP clients must go through the HTTP API, not service-role access.

## BuzzBar
- Manifest: `.agent-bus.json` (relay `wss://theahg.communities.buzz.xyz`, channels `#whathappen-chat`, `#whathappen-ingest`, `#whathappen-analytics`)
- Note: `.agent-bus.json` still carries the stale `eea59134…` project_id — left untouched pending a decision on whether the bus scope should follow the project ID.

## Hard rule
Stay off the decryption path. Never put a passphrase in MCP tool parameters or logs.
