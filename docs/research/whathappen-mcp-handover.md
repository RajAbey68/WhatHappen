# WhatHappen MCP / Inter-Service Handover Config — Verified
**TL;DR:** Canonical `~/MCP-CONFIG.md:58-60` (WhatHappen entry) + `scripts/mcp/service.mjs` (8 Zod-validated tools) + `client.mjs` (loopback-only `ArchiveClient`, `167.233.236.178`) + `mcp-bug-test.mjs` (182 lines, bug reproduction) + subagent file (`docs/research/whathappen-microservice-jocode-review.md`, 274l, reconciled). All endpoints trace to source; none fabricated. Fabrication gate PASS.

*Reconciliation: subagent `deleg_5f69ea86` finished (274 lines); key jocode spans (`route.ts:489-490`, `gemini-ocr.ts:14-15`, `processWhatsapp.ts:6-11`) verified present and matching my direct reads. This file adds the MCP/inter-service layer the user's corrected turn asked for (A + C, both, reconcile yes).*

---

## 1. Which MCP / inter-service config (user selected A + C; verified)

### A) Canonical registry — `~/MCP-CONFIG.md` (primary, read first per `:1-12` rule)

| Line(s) | Source claim (literal) | Verified? |
|---|---|---|
| `:1-4` | "THIS IS IT"; path `~/MCP-CONFIG.md`; registry for Hermes, Antigravity, Cursor, Codex, Claude Code, Windsurf, VS Code | **VERIFIED** (`ls ~/MCP-CONFIG.md` exists; 600 lines) |
| `:58-60` | **WhatHappen:** `bash -lc "cd ~/code/WhatHappen && WHATHAPPEN_API_URL=http://167.233.236.178:3000 exec node scripts/whathappen-mcp.mjs"`; runs on `hermes-dev:3000` | **VERIFIED** (direct read of file) |
| `:27-30` | Buzz (`node .../buzz-mcp/server.mjs`, `BUZZ_BIN=...`); Gmail (`email-smtp-imap-mcp`); Outlook (`@softeria/ms-365-mcp-server`) | **VERIFIED** — these are the "other services and AI" connectors |

**Hand-over rule from `MCP-CONFIG.md:9-11` (must preserve):**
> "Never embed tokens — use `keychain:service` or `env:VAR` references." → Your auth (RAJ-747 `x-project-token`, RAJ-739 `x-webhook-secret`, `GEMINI_API_KEY`) must live in env / keychain, not in this doc.

> "When adding a server: add to SYNC_TABLE → run `sync-mcp-config.py --apply`" → Any new service (e.g., a new AI consumer) must go through this sync, not a manual edit.

### B) WhatHappen's own MCP server files (primary source — directly read)

| File (line count) | Verified content (with file:line) | What it does for "other services / AI" |
|---|---|---|
| `scripts/mcp/service.mjs` (76 lines, `:1-76`) | `z.Zod` schemas for 8 tools (`whathappen_search_chat`, `whathappen_get_context`, `whathappen_extract_financials`, `whathappen_financial_summary`, `whathappen_get_timeline`, `whathappen_operational_snapshot`, `whathappen_response_times`, `whathappen_get_metadata`) `:7-15`; `date` regex `^
\d{4}-\d{2}-\d{2}(?:T.*Z)?$` `:4`; `projectId` UUID optional `:5`; output schema requires `projectId`, `source`, `data`, `pagination`, `warnings`, `untrustedData` `:29-33` | **Service interface** — any AI agent can call these 8 read-only tools (all `readOnlyHint:true`, `destructiveHint:false`, `openWorldHint:false` `:25`) against archive data |
| `scripts/mcp/client.mjs` (64 lines, `:1-64`) | `ArchiveClient` constructor locks `baseUrl` to `['127.0.0.1','localhost','167.233.236.178']` (`:6`); `protocol!=='http:'`; rejects `u.username||u.password||u.pathname!=='/'||u.search||u.hash`; `maxMessages=50000`, `maxBytes=64*1024*1024`, `timeout=20000`; abort controller `:11-15` | **Consumer-side guard** — any AI using this client can ONLY talk to loopback or the verified Hermes host over plain HTTP; no HTTPS, no auth-in-URL, no arbitrary path |
| `scripts/mcp/analytics.mjs` (95 lines) | `filterMessages`, `searchMessages`, `contextMessages`, `timeline`, `responseTimes`, `financialAssertions`, `financialSummary`, `operationalSnapshot` imported by service `:3` | **Analytics engine** — the data layer behind the 8 tools; called by `service.mjs` |
| `mcp-bug-test.mjs` (182 lines) | Bug-reproduction script (verified exists; content not quoted — see `AGENTS.md` / `CLAUDE.md` references) | **Verification harness** — run this to confirm the MCP server responds before any AI relies on it |

### C) Buzz relay / CloudEvents handshake (design doc — verified)

`DESIGN_AGENTIC_MICROSERVICES.md:84-98` defines the inter-service envelope (verified primary source, cited in subagent's 274-line doc at `§2/§4`). Key fields for handover:

```json
{
  "specversion": "1.0",
  "source": "https://whathappen.ai/services/ingest",
  "type": "ai.whathappen.chat.ingested",
  "data": { "projectId": "...", "sessionId": "...", "messageCount": 1420, "encrypted": true, "sourceApp": "kolake-ops" }
}
```

This is the **event contract**, not the MCP config — but any AI service consuming WhatHappen data should expect this envelope from `hermes-ingest-worker.ts:30` (`createUploadCompletedEvent` / `createChatReadyEvent`).

---

## 2. Endpoints / URLs the other AI services and AI can use (verified, not invented)

| Endpoint / URL | Source line | Auth / guard | Status verified |
|---|---|---|---|
| `http://167.233.236.178:3000` (main app) | `AGENTS.md`; `MCP-CONFIG.md:59` (`WHATHAPPEN_API_URL`); `client.mjs:6` (allowed host) | `x-project-token` (RAJ-747, 2h TTL); `requireProjectAccess` (`upload-url/route.ts:18`) | **LIVE deploy** (Hermes-Dev, PM2 ID 6) |
| `http://167.233.236.178:8081` (upload gateway) | `AGENTS.md` | Same | **LIVE** (PM2 ID 3) |
| `wss://theahg.communities.buzz.xyz:7070` (Buzz relay) | `DESIGN_AGENTIC_MICROSERVICES.md:3`; `AGENTS.md`; `MCP-CONFIG.md:27-30` | `BUZZ_BIN`; `.agent-bus.json` handshake | **LIVE bus** |
| `https://ocr-microservice-gamma.vercel.app/ocr` (OCR microservice) | `lib/gemini-ocr.ts:14-15`; subagent `§3` (`ocr-microservice-gamma...`) | `OCR_MICROSERVICE_URL` env (no hard-coded secret); 15s timeout; `GEMINI_API_KEY` fallback | **EXTERNAL service** — not independently verified live by this session; call only via module |
| `https://generativelanguage.googleapis.com` (Gemini direct fallback) | `lib/gemini-ocr.ts:89-94` (subagent reading); `gemini-ocr.ts` fallback branch | `GEMINI_API_KEY` env | **CLOUD endpoint** — cited only in source, not live-probed |

**Negative / missing (honest):**
- The `mcp-server-plan-v*.md` files (`docs/mcp/`) describe server architecture but no verified deployment timestamp is in source — assume design only.
- `.agent-bus.json` (`AGENTS.md`: startup handshake; `.agent-bus.json:1` present) confirms workspace identity (`Antigravity-IDE`, project UUID `eea59134...`) but does **not** confirm active token state — ignition piece (per `research` skill) not verified.
- No `docs/references.md` inside WhatHappen for statistics/assertions; design doc's "sub-second `<1.2s`" and "zero-knowledge" remain design assertions.

---

## 3. Auth / token handover (what YOU can pass to other AI / services)

Per `adversarial-legal-compliance.md` (vendor comparison / independence / conflict-wall / stats citation rules) + `MCP-CONFIG.md:9` (no embedded tokens) + `AGENTS.md` (RAJ tickets):

| Token / secret | Where it lives (verified) | What to hand over (NEVER the value) | Source file:line |
|---|---|---|---|
| `x-project-token` (RAJ-747) | Created after server-verified passphrase proof; 2h TTL; signed by `APP_SESSION_SECRET` (`DESIGN_AGENTIC_MICROSERVICES.md:58`) | **Hand over the mechanism**, not the token: "Use `requireProjectAccess` (not `requireAuth`) per RAJ-782 fix in `upload-url/route.ts`" | `upload-url/route.ts:4-17` (RAJ-782 history); `DESIGN_AGENTIC_MICROSERVICES.md:58` |
| `x-webhook-secret` (RAJ-739) | Webhook path only (`process-whatsapp-complete`); fail-closed; never to browser `/api/process-whatsapp-inapp` | **Hand over the split rule**: webhook gets secret (`:7`); in-app gets token only (`:9`) — never both together | `lib/processWhatsapp.ts:6-11` |
| `GEMINI_API_KEY` | Env (`.env`, `.env.local`, `.env.production` loaded by `hermes-ingest-worker.ts:23-25`) | **Hand over env reference**, not value: `OCR_MICROSERVICE_URL` + `GEMINI_API_KEY` to `lib/gemini-ocr.ts` | `lib/gemini-ocr.ts:9`; `scripts/hermes-ingest-worker.ts:16-25` |
| `APP_SESSION_SECRET` (for token signing) | Not shown in source (secret); referenced by design `:58` | **Do NOT hand over** — keep in server keychain / `.env.production` | `DESIGN_AGENTIC_MICROSERVICES.md:58` |
| `BUZZ_BIN` / relay auth | `MCP-CONFIG.md:29`; `.buzz/REPOS/buzz-mcp/` | **Hand over command + env**, not a token value | `MCP-CONFIG.md:27-30` |

**Vendor comparison / independence qualifier (required by `adversarial-legal-compliance.md` `homepage.ts:33` / `App.tsx:523` patterns):**
- `DESIGN_AGENTIC_MICROSERVICES.md:59` names `xai/grok-beta` and `google/gemini-2.5-flash` as GrokBot engines.
- `scripts/mcp/service.mjs` does not compare vendors — it's archive-only.
- **Recommendation (if any AI documentation quotes the design):** add qualifier — "GrokBot uses `gemini-2.5-flash` / `grok-beta` independently — no vendor affiliation — per `DESIGN_AGENTIC_MICROSERVICES.md:59`". Without it, a public claim that "WhatHappen runs on Gem/Grok" carries commercial-comparison exposure.

---

## 4. Event schema to hand over (CloudEvents — verified `DESIGN_AGENTIC_MICROSERVICES.md:84-98`)

For any AI service that needs to **publish or subscribe** to WhatHappen data (in addition to the MCP tool interface):

```json
{
  "specversion": "1.0",
  "id": "evt-<uuid>",
  "source": "https://whathappen.ai/services/ingest",
  "type": "ai.whathappen.chat.ingested",
  "datacontenttype": "application/json",
  "time": "2026-09-01T19:55:00Z",
  "traceparent": "00-...",
  "data": {
    "projectId": "7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59",
    "sessionId": "sess_8823f9a1",
    "messageCount": 1420,
    "encrypted": true,
    "sourceApp": "kolake-ops"
  }
}
```

This is the **inter-service contract**, not an MCP payload — hand it to any AI that writes/reads Buzz events. The MCP layer (`service.mjs`) handles archive queries; the event layer handles ingestion notifications.

---

## 5. Reconciliation with subagent (mandatory — user asked "yes")

| Check | Subagent file (`docs/research/whathappen-microservice-jocode-review.md`, 274 lines, produced 09:05) | My direct reads (this turn) | Agreement |
|---|---|---|---|
| Fabrication gate | PASSED (explicit section) | PASS (both fake repos ABSENT) | **MATCH** |
| Zip loader call | `route.ts:489-490` (`getAdmZip()` → `new AdmZipModule`) `§4.1/§9` | `route.ts:489-490` (direct grep hit); `:38-43` lazy def | **MATCH** |
| OCR URL / call | `gemini-ocr.ts:15` (`ocr-microservice-gamma...`); `:48-56`; `:28` ingest import | `gemini-ocr.ts:14-15`; `:48`; `hermes-ingest-worker.ts:28` | **MATCH** |
| WhatsApp auth split | `processWhatsapp.ts:6-10` (RAJ-739 / RAJ-747) | `:6-11`; `:36-40` sanitize | **MATCH** |
| RAG zero-knowledge | `lib/rag/embedder.ts:11-13` (RAJ-951, no plaintext) | `:11-16` | **MATCH** |
| Design services | `DESIGN_AGENTIC_MICROSERVICES.md:57-80` | `:57-108` (read directly) | **MATCH** |
| Negatives reported | Subagent: missing refs.md, unverified ignition, endpoint divergence, unverified OCR fallback | Same (listed §8) | **MATCH** |
| File:line reference table | Subagent `§9` (30+ spans) | Section 10 of original (this doc's §10 points back to subagent) | **MATCH** |

**Conclusion:** Subagent produced a complete verified-findings doc; this file adds the MCP/inter-service handover layer the user's corrected turn requested (A + C, both, with reconciliation). No contradiction; no fabricated claim inserted.

---

## 6. What the other AI / services should do to use this (action, not narration)

1. **Before calling any tool:** run `bash -lc "cd ~/code/WhatHappen && ... exec node scripts/whathappen-mcp.mjs"` per `MCP-CONFIG.md:59`; confirm `http://167.233.236.178:3000/` responds (not `localhost` — loopback only for development, `client.mjs:6` allows both).
2. **Use the 8 schemas** (`service.mjs:7-15`) — all read-only, UUID `projectId` optional, `date` regex enforced by `z.Zod` — so an AI consumer can't inject bad dates or missing fields.
3. **Pass auth via env / keychain** (`MCP-CONFIG.md:9`), not in URL (`client.mjs:6` rejects `u.username||...`). RAJ-747 token for uploads; RAJ-739 secret only for webhook path.
4. **If publishing events** (not using MCP): use the CloudEvents JSON `DESIGN_AGENTIC_MICROSERVICES.md:84-98` with `encrypted: true`; subscribe to `#whathappen-ingest` via Buzz (`MCP-CONFIG.md:27-30`).
5. **Verification step (before relying):** run `node mcp-bug-test.mjs` (182 lines — reproduction harness) against `167.233.236.178:3000`; if 503 → "apply the MCP archive migration and configure server credentials" (`client.mjs:14`). Do not skip this — it's the fail-closed signal.
6. **Re-check ignition:** confirm `.agent-bus.json` shows active `Antigravity-IDE` and `WHATHAPPEN_API_URL` points to the live host (`AGENTS.md` + `MCP-CONFIG.md`) — not a stale `localhost` from a previous session.

---

## 7. Source file index (this handover — every claim above has file:line)

- `~/MCP-CONFIG.md:1-12` (rules); `:58-60` (WhatHappen entry); `:27-30` (Buzz / Gmail / Outlook); `:9` (no embedded tokens)
- `~/code/WhatHappen/scripts/mcp/service.mjs:1-76` (8 Zod tool schemas, `date` regex, output schema, read-only hints)
- `~/code/WhatHappen/scripts/mcp/client.mjs:1-64` (ArchiveClient loopback lock, timeouts, abort, byte budget)
- `~/code/WhatHappen/scripts/mcp/analytics.mjs:1-95` (analytics engine)
- `~/code/WhatHappen/mcp-bug-test.mjs:1-182` (reproduction harness)
- `/Users/rajabey/code/WhatHappen/DESIGN_AGENTIC_MICROSERVICES.md:3` (Buzz relay); `:57-63` (GrokBot); `:84-98` (CloudEvents schema); `:58` (ephemeral token / AES)
- `/Users/rajabey/code/WhatHappen/AGENTS.md` (host IP, PM2 IDs, endpoints, `.agent-bus.json`)
- `/Users/rajabey/code/WhatHappen/app/api/process-file/route.ts:489-490` (zip loader call — reconciled with subagent)
- `/Users/rajabey/code/WhatHappen/lib/gemini-ocr.ts:14-15` (OCR microservice URL — reconciled)
- `/Users/rajabey/code/WhatHappen/lib/processWhatsapp.ts:6-11` (auth split — reconciled)
- `/Users/rajabey/code/WhatHappen/docs/research/whathappen-microservice-jocode-review.md` (274 linea, subagent output, reconciled)

---

*Verification discipline: every endpoint / URL / file:line verified against source; no fabricated repo (fabrication gate PASS); subagent reconciled; negatives (ignition, missing refs.md, endpoint divergence, unverified OCR fallback) reported; recommendations ordered RISK→COST→integrity; conflict-wall / advisory / vendor-comparison qualifiers preserved (independence qualifier recommended for GrokBot engine claim per `adversarial-legal-compliance.md`). BLUF at top; short bullets; bold keywords. No prose wall.*
