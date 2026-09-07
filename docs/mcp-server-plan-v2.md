# WhatHappen MCP Server Architecture & Implementation Plan (v2.0)

## 1. Executive Goal & System Identity
Build the official **WhatHappen MCP Server** (`whathappen-mcp`) executing exclusively on **Hermes-Dev** (`root@167.233.236.178`). The MCP server enables AI agents (Hermes agent runtime, Claude Desktop / Cursor via SSH or loopback) to analyze, search, and extract evidence from encrypted WhatsApp archives, legal transcripts, and financial timelines without ever deploying software or secrets to the user's laptop.

---

## 2. Security Invariants & Review Resolutions (DeepSeek / Kimi P0 & P1 Clear)

### 2.1 Resolution of Fatal Flaws (P0)
1. **Zero Plaintext Passphrases in MCP Tool Schemas (No JSON-RPC Exposure):**
   - Tool parameters **never** accept `passphrase`.
   - Tool arguments operate on standard identifiers (`projectId`, `query`, `analysisType`).
   - The server acquires project access tokens non-interactively using the server environment's pre-configured `WHATSAPP_PASSPHRASE_HASH` via the native challenge-response endpoint (`GET /api/auth/challenge` → HMAC-SHA256 proof → `POST /api/project-token`).
2. **Zero Direct Supabase Bypasses:**
   - `SUPABASE_SERVICE_ROLE_KEY` fallback is **completely eliminated**.
   - 100% of data reads, search queries, and enrichments route through WhatHappen’s HTTP API over loopback (`http://127.0.0.1:3000`), enforcing Row Level Security, project isolation, and audit trails.
3. **No Client Decryption Paradox:**
   - The MCP server lives directly on **Hermes-Dev**. It is not an unauthenticated remote cloud client; it runs co-located with the WhatHappen backend and derives AES keys in RAM via PBKDF2 matching `lib/crypto.ts` for authorized sessions.

### 2.2 Resolution of Phase Blockers (P1 & P2)
1. **Ingest Endpoint Normalization:** All archive ingestion flows target `http://127.0.0.1:3000` (Next.js in-app upload endpoint) and the media processing queue, removing all hardcoded public IP/port assumptions.
2. **Strict Ingestion Path Whitelisting:** `whathappen_trigger_ingest` enforces a whitelist of source paths on Hermes (e.g. `/root/uploads`, `/root/WhatHappen/data`), rejecting arbitrary system file paths.
3. **Formal KDF Contract:** Explicitly specifies PBKDF2 key derivation with 100,000 iterations (SHA-256) and AES-GCM-256 matching `lib/crypto.ts`.

---

## 3. Google Gemini 2.5 / 1.5 & Big Data Capabilities

To handle massive WhatsApp corpora (multi-year chat exports, hundreds of thousands of messages, extensive voice notes and photo evidence), the MCP server integrates native **Google Gemini** capabilities:

1. **Gemini 2.0 / 1.5 Pro 2M-Token Direct Context Analysis:**
   - Instead of fragile vector chunking for high-context legal timelines, WhatHappen MCP bundles year-long conversation streams directly into Gemini 1.5/2.0 Pro's 2,000,000 token context window via Google GenAI SDK.
   - Enables whole-case cross-referencing: *"Identify every contradiction between Person A and Person B across the entire 18-month export."*
2. **Gemini Multimodal Evidence Inspection:**
   - Voice note (`.opus`/`.ogg`) transcription fallback via Gemini Audio API.
   - Evidence photo & receipt inspection via Gemini Vision OCR (preserving Sinhala, Tamil, and English text verbatim).
3. **Vector Store & BigQuery Grounding (Big Data Pipeline):**
   - High-volume projects leverage Supabase `pgvector` or BigQuery embedding tables (`text-embedding-004`) for semantic filtering before deep Gemini synthesis.

---

## 4. MCP Tools Specification

### 4.1 `whathappen_list_projects`
* **Description:** Retrieve all WhatsApp analysis projects accessible on the server, including message counts, participant summaries, and date ranges.
* **Input Schema:** None.
* **Backend Call:** `GET http://127.0.0.1:3000/api/projects`.

### 4.2 `whathappen_search_messages`
* **Description:** Perform semantic or keyword searches across encrypted chat messages for a project.
* **Input Schema:**
  * `projectId` (string, required): UUID of target project.
  * `query` (string, required): Search query or forensic question.
  * `limit` (number, optional, default: 50, max: 200).
  * `sender` (string, optional): Filter by sender name or phone number.
* **Backend Call:** `POST http://127.0.0.1:3000/api/ai-chat/query` using cached `x-project-token`.

### 4.3 `whathappen_get_chronology`
* **Description:** Retrieve an ordered conversational slice anchored around a key event or timestamp.
* **Input Schema:**
  * `projectId` (string, required): Project UUID.
  * `anchorTimestamp` (string, optional): ISO-8601 timestamp.
  * `windowSize` (number, optional, default: 30): Messages before and after.

### 4.4 `whathappen_extract_financials`
* **Description:** Run the Forensic Ledger extraction to isolate payments, currencies, transfers, and promises to pay.
* **Input Schema:**
  * `projectId` (string, required): Project UUID.
* **Backend Call:** `POST http://127.0.0.1:3000/api/analyze-project` with `analysisType: 'financial'`.

### 4.5 `whathappen_gemini_synthesize`
* **Description:** Leverage Gemini 1.5/2.0 Pro large context window (2M tokens) to perform end-to-end investigative case summaries and timeline reconstruction across un-truncated chat logs.
* **Input Schema:**
  * `projectId` (string, required): Project UUID.
  * `prompt` (string, required): The forensic question or case synthesis prompt.
  * `model` (string, optional, default: `gemini-1.5-pro`): Target Gemini model.

### 4.6 `whathappen_trigger_ingest`
* **Description:** Ingest a WhatsApp archive export (`.zip` or `_chat.txt`) from Hermes's verified uploads directory.
* **Input Schema:**
  * `projectId` (string, required): Project UUID.
  * `fileName` (string, required): Name of archive located in `/root/uploads`.

---

## 5. Deployment & Hermes Agent Registration
* **Location on Hermes-Dev:** `/root/.hermes/mcp-servers/whathappen-mcp`
* **Registration:** Added to `/root/.hermes/buzz-factory/config/mcp_servers.json` and Hermes agent config:
```json
{
  "mcpServers": {
    "whathappen": {
      "command": "node",
      "args": ["/root/.hermes/mcp-servers/whathappen-mcp/dist/index.js"],
      "env": {
        "WHATHAPPEN_API_URL": "http://127.0.0.1:3000",
        "WHATSAPP_PASSPHRASE_HASH": "${WHATSAPP_PASSPHRASE_HASH}",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```
