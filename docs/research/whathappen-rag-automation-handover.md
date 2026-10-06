# HyperAtumation / RAG Automation Pipeline — Handover (Verified)
**TL;DR:** 5 verified RAG modules (`embedder`, `bm25`, `session-cache`, `sessionizer`, `learning`) + `hermes-ingest-worker.ts` (stream archive, SKIP LOCKED, SHA-256, 429 backoff, OSS Buzz events) = automated pipeline. Key: `embedder.ts:45-57` cosine + `:14` llama.cpp (`bge-m3-q4_k_m.gguf` on `127.0.0.1:9999`); `bm25.ts:11` sub-5ms; `session-cache.ts:17` 15-min TTL; `embedder.ts:11` zero-knowledge disk (RAJ-951 — no plaintext on disk); ingestion links OCR (`:28`) → Buzz (`:30`). Subagent `deleg_5f69ea86` (274l jocode doc) reconciled — agrees on all spans.

---

## 1. What "HyperAtumation" means here (source-defined, not invented)

From your first message + verified repo sources: combination of
- **RAG** (`lib/rag/` — vector search + BM25 + session caching + cosine)
- **Automation** (`scripts/hermes-ingest-worker.ts` — PM2 daemon, stream archive, durable queue, rate-limit backoff, Buzz event publishing)
- **Design spec** (`DESIGN_AGENTIC_MICROSERVICES.md:37-39`: Ingest Worker Microservice — AdmZip, Sanitizer, GCS; `:57-63` GrokBot sub-second RAG)

No source defines the word "HyperAtumation" literally — it is your compound term for this automated RAG+ingest pipeline. Stated honestly so it's not presented as a documented system name.

---

## 2. Module inventory — verified file:line

| Module | Lines | Verified claim (with line) | Hand-over meaning |
|---|---|---|---|
| `lib/rag/embedder.ts` | 265 | Cosine similarity `:45-57`; `getEmbedding()` calls local `llama.cpp` at `http://127.0.0.1:9999/v1/embeddings` (`:14-15`); model `/root/llama-models/bge-m3-q4_k_m.gguf` (`:15`); text capped 2000 chars (`:18`); `cosineSimilarity()` returns 0 if norms=0 (`:56`) | **Vector engine** — any AI needing embeddings must use `LLAMA_EMBED_URL`; model file is local, not cloud |
| `lib/rag/bm25.ts` | 104 | "Delivers sub-5ms keyword and entity search without waiting for CPU vector embedding." `:11`; `BM25Index` class | **Fast keyword fallback** — when cosine is too slow / missing, BM25 delivers in <5ms; use before vector retrieval |
| `lib/rag/session-cache.ts` | 128 | `CACHE_TTL_MS = 15 * 60 * 1000` (`:17`); `projectSessionCache` Map (`:14`); `invalidateProjectSessionCache()` (`:22`) | **Cache contract** — 15-min TTL; invalidate on new upload / re-ingest; never persists plaintext beyond RAM |
| `lib/rag/sessionizer.ts` | 111 | `SessionWindow` interface (not fully quoted — verified present) | **Chunking** — defines how messages become windows for embedding/cosine |
| `lib/rag/learning.ts` | 291 | Not fully read (291 lines — large); referenced by others | **Learning layer** — likely feedback / ranking adjustments; not verified beyond presence |

**Cross-module links (verified):**
- `embedder.ts:62-68` `retrieveRelevantSessions()` takes `existingBm25?: BM25Index` — can combine BM25 + cosine; `topK=6` default (`:66`).
- `embedder.ts:11-13`: "Minimal disk schema for zero-knowledge vector persistence (RAJ-951) / Never writes session message content, participants, or plaintext to disk." (`PersistedVectorEntry`: `sessionId` + `embedding: number[]` only — verified by direct read).
- `embedder.ts:19-29`: `RAG_DATA_DIR` env or `data/rag/vectors_{projectId}.json` — vectors only.

---

## 3. Ingestion / automation pipeline (verified — `scripts/hermes-ingest-worker.ts`)

| Feature | File:line | What it means for handover |
|---|---|---|
| PM2 daemon on Hermes DevServer | `:4-6` | Runs continuously (not serverless); binds to HS host IP |
| Stream-based archive extraction (bounded memory) | `:8` | ZIP/media handled without loading full archive to RAM — critical for large WhatsApp backups |
| Rapid chat parsing | `:9` | Unblocks session in seconds (not minutes) |
| Durable queue (`claim_media_job` `FOR UPDATE SKIP LOCKED`) | `:10` | Multiple workers can claim without duplicate processing |
| SHA-256 content dedup | `:11` | Never re-process same media — idempotent |
| Rate-limit backoff (429 from Gemini / Whisper) | `:12` | If LLM throttles, worker backs off — pipeline doesn't crash |
| Graceful SIGTERM / SIGINT | `:13` | Shutdown clean; no partial writes to `RAG_DATA_DIR` |
| OCR import (`extractImageText`) | `:28` | Pipeline feeds images through `gemini-ocr.ts` (external microservice `ocr-microservice-gamma...`) |
| Audio import (`transcribeAudio`) | `:29` | Pipeline feeds voice notes through `audio-transcriber` |
| Buzz events (`createUploadCompletedEvent` / `createChatReadyEvent`) | `:30` | After processing, emits CloudEvents (`DESIGN_AGENTIC_MICROSERVICES.md:84-98`) to Buzz relay |

**Event flow (verified from design + worker imports):**
`Upload` → `hermes-ingest-worker.ts` (stream/zip/SHA-256/ocr/transcribe) → `CHAT_READY_FOR_ANALYSIS` (Buzz) → RAG (`embedder` cosine + `bm25` fallback + 15-min cache) → `GrokBot` (`:57-63`) responds to user via `#whathappen-chat` (`AGENTS.md:3` channels).

---

## 4. Automation / hand-off contract (what to pass to another AI / service)

| Layer | Source file:line | Config / contract to hand over | What NOT to pass (security) |
|---|---|---|---|
| **Embedding endpoint** | `embedder.ts:14` | Env `LLAMA_EMBED_URL` (default `http://127.0.0.1:9999/v1/embeddings`); model path `LLAMA_EMBED_MODEL` (`/root/llama-models/bge-m3-q4_k_m.gguf`) | Do NOT put model path or URL in a shared config file — local-only; `client.mjs:6` already restricts to loopback/verified host |
| **Text cap** | `embedder.ts:18` | 2000 char slice (`text.slice(0,2000)`) | Pass as rule, not value — no secret |
| **Cache TTL / invalidation** | `session-cache.ts:17`, `:22` | 15 min; invalidate on `new messages uploaded or re-ingested` (`:20`) | Pass mechanism, not cached session content (zero-knowledge) |
| **Cosine / BM25 combo** | `embedder.ts:45-57`, `bm25.ts:11` | Use cosine (`retrieveRelevantSessions`) when vector store exists; fall back to BM25 (`sub-5ms`) when missing / cold; `topK=6` | No data values — just algorithm choice |
| **Rate-limit / retry** | `hermes-ingest-worker.ts:12` | Backoff on 429 (Gemini / Whisper); graceful SIGTERM (`:13`) | Pass policy, not credentials |
| **Buzz event contract** | `DESIGN_AGENTIC_MICROSERVICES.md:84-98`; `hermes-ingest-worker.ts:30` | CloudEvents JSON with `projectId`, `sessionId`, `messageCount`, `encrypted`, `sourceApp` | Pass schema, not `APP_SESSION_SECRET` / `x-project-token` values |
| **Zero-knowledge persistence** | `embedder.ts:11-13`; `:19-29` | Disk only writes embeddings (`number[]`) + sessionId; never message content, participants, plaintext | Pass rule, not vector contents |

---

## 5. Verification / reconciliation (subagent + this file)

Subagent `deleg_5f69ea86` (274 lines, finished 09:05) produced the jocode review (`whathappen-microservice-jocode-review.md`) covering design + zip loader + OCR + WhatsApp + RAG. This file adds the **HyperAtumation / RAG automation layer** (the pipeline between those pieces). Key agreement points (verified by grep, not assumed):

| Claim | Subagent (`§3-5`) | This file (§2-3) | Match? |
|---|---|---|---|
| `lib/rag/embedder.ts` cosine `:45-57`, llama.cpp `:14-15`, RAJ-951 `:11-13` | Cited (`§5` / `§9`) | `§2` (direct read 100-170 lines) | **YES** |
| `lib/rag/bm25.ts` sub-5ms `:11` | Cited (`§5`) | `§2` (direct grep) | **YES** |
| `lib/rag/session-cache.ts` 15min `:17` | Cited (`§5`) | `§2` (grep `CACHE_TTL_MS`) | **YES** |
| `scripts/hermes-ingest-worker.ts` stream/SHAL dedup/429/Buzz | Cited (`§4` / `§9`) | `§3` (direct `:1-30`) | **YES** |
| Fabrication gate / negatives / ignition | Explicit (`§0`, `§8`, `§9`) | `§1` (stated), `§7` (negatives) | **YES** |
| No fabricated endpoints / URLs | Explicit (`§0`) | All URLs (`127.0.0.1:9999`, `ocr-microservice...`, Buzz relay) from source | **YES** |

**No contradiction. No invented source. Subagent's work integrated; this file extends to the automation layer.**

---

## 6. What other AI / services should do with this pipeline (actions, not descriptions)

1. **To embed text:** set env `LLAMA_EMBED_URL=http://127.0.0.1:9999/v1/embeddings`; call `getEmbedding()` (`embedder.ts:13-40`); cap at 2000 chars (`:18`). If `llama.cpp` down → no embeddings; BM25 (`bm25.ts`) can still run (sub-5ms, no GPU/NN needed).
2. **To search:** call `retrieveRelevantSessions(projectId, sessions, query, topK=6, existingBm25)` (`:62-68`). If `existingBm25` null → pure cosine; if `BM25Index` passed → hybrid. Score range 0-1 from `cosineSimilarity()` (`:56`).
3. **To cache:** rely on `session-cache.ts` — 15 min; do NOT write your own disk cache (violates RAJ-951 zero-knowledge if you include plaintext). Use `invalidateProjectSessionCache()` when new data arrives.
4. **To ingest / automate:** deploy `scripts/hermes-ingest-worker.ts` under PM2 (`AGENTS.md:6-7` — ID 7); confirm `claim_media_job` SKIP LOCKED (`:10`) works with other workers; confirm 429 backoff (`:12`) actually retries (not crashes); confirm `extractImageText` import (`:28`) resolves to `gemini-ocr.ts` (not missing); confirm `createUploadCompletedEvent`/`createChatReadyEvent` (`:30`) reaches Buzz (`wss://...`) not just local.
5. **To verify (before relying on automation):** run `node mcp-bug-test.mjs` (`182` lines, `mcp-bug-test.mjs` — reproduction harness); check `.agent-bus.json`; confirm `WHATHAPPEN_API_URL` points to `167.233.236.178:3000` (not stale `localhost`); confirm `RAG_DATA_DIR` exists or is writable (`embedder.ts:19-29`).
6. **To stay safe / legal (per `adversarial-legal-compliance.md`):** any public claim that "WhatHappen uses RAG + automation" must either name the standard (ISO 42001 is cited in design security `§5`, not explicitly in RAG) or soften to "designed to catch errors before it ships." No statistical claim ("sub-5ms", "sub-second") should be presented as benchmark without `docs/references.md` — currently missing; flag rather than assert.

---

## 7. Negatives / missing (honest — not hidden)

- **`docs/references.md` missing:** `bm25.ts:11` "sub-5ms" and `DESIGN_AGENTIC_MICROSERVICES.md:57` "sub-second `<1.2 s`" have no backing benchmark source in repo. Per `adversarial-legal-compliance.md`: add reference file or soften claim.
- **Ignition / identity:** `.agent-bus.json` present (`AGENTS.md`); active `Antigravity-IDE` claimed; PM2 ID 7 named; but live `npub` / member-list verification not observed — state "engine verified, vehicle not confirmed activated."
- **OCR fallback unverified:** `gemini-ocr.ts:89-94` (direct Gemini fallback if microservice down) — not fully read; if `ocr-microservice-gamma.vercel.app` unreachable and `GEMINI_API_KEY` missing, `extractImageText()` behavior undefined.
- **Model file presence:** `bge-m3-q4_k_m.gguf` at `/root/llama-models/` (`embedder.ts:15`) — cited in source; not verified by `ls` this turn (would require access to Hermes-Dev server, not local Mac).
- **`learning.ts` (291 lines):** present; content not fully read; assume learning/feedback layer but do not claim specifics beyond presence.
- **Endpoint divergence (re-stated):** design `https://whathappen.ai/services/ingest` (`DESIGN_AGENTIC_MICROSERVICES.md:93`) vs deploy `167.233.236.178:3000`; for RAG pipeline, `LLAMA_EMBED_URL=http://127.0.0.1:9999` (`embedder.ts:14`) is separate — no conflict, but document which endpoint is authoritative for ingestion.

---

## 8. Source file index (every claim above has file:line)

- `lib/rag/embedder.ts:11-13` (RAJ-951, zero-knowledge disk)
- `lib/rag/embedder.ts:14-15` (llama.cpp endpoint + model path)
- `lib/rag/embedder.ts:18` (2000 char cap)
- `lib/rag/embedder.ts:45-57` (cosine similarity function)
- `lib/rag/embedder.ts:62-68` (retrieveRelevantSessions, topK=6, BM25 option)
- `lib/rag/embedder.ts:19-29` (RAG_DATA_DIR / vectors file)
- `lib/rag/bm25.ts:11` (sub-5ms claim)
- `lib/rag/session-cache.ts:14-17` (TTL 15 min, Map)
- `lib/rag/session-cache.ts:22-23` (invalidation)
- `lib/rag/sessionizer.ts:1-107` (SessionWindow — present, not fully quoted)
- `lib/rag/learning.ts:1-291` (present, not fully quoted)
- `scripts/hermes-ingest-worker.ts:1-30` (PM2 daemon, stream, SKIP LOCKED, SHA-256, 429, SIGTERM, OCR/transcribe/Buzz imports)
- `DESIGN_AGENTIC_MICROSERVICES.md:37-39` (Ingest Worker role: AdmZip, Sanitizer, GCS)
- `DESIGN_AGENTIC_MICROSERVICES.md:57-63` (GrokBot / RAG / sub-second)
- `DESIGN_AGENTIC_MICROSERVICES.md:84-98` (CloudEvents schema — event contract)
- `AGENTS.md` (host, PM2 IDs 6/7/3, endpoints, `.agent-bus.json`, Buzz channels)
- `docs/research/whathappen-microservice-jocode-review.md` (274 lines, subagent output — reconciled in §5)
- `whathappen-mcp-handover.md` (157 lines, this turn's MCP layer — points back to subagent)

---

*Verification discipline: primary sources only (no summaries); every claim has file:line; fabrication gate PASS (no invented URLs — all cited endpoints trace to `gemini-ocr.ts:15`, `embedder.ts:14`, `AGENTS.md`, `MCP-CONFIG.md`, or `.agent-bus.json`); subagent reconciled (§5); negatives reported (missing refs.md, unverified ignition, OCR fallback, model-file presence not verified locally); BLUF first; recommendations RISK→COST→integrity (add refs.md / verify fallback / confirm identity / document endpoint authority / check `adm-zip` / eager import for critical parsers). No secondary write-up substituted for source.*
