# WhatHappen MCP Server Architecture & Implementation Plan (v4.0)

## 1. Goal & Context
Build an official Model Context Protocol (MCP) server for the **WhatHappen** platform to enable local AI agent runtimes (Hermes Desktop, Claude Desktop, Cursor) to securely inspect, search, and analyze WhatsApp transcripts and project metadata.

### Infrastructure & Security Ground-Truth
- **WhatHappen Server:** Runs on Hermes-Dev (`http://167.233.236.178:3000`), local dev instance on `http://localhost:3000`.
- **Distribution Scope:** **Local Stdio Mode ONLY**. Remote SSE/Cloud mode is excluded to preserve zero-knowledge invariants (avoiding remote key escrow).
- **Zero-Knowledge Invariant:** Transcripts are stored encrypted at rest (AES-GCM-256). Decryption occurs exclusively in local client RAM. Server-side APIs never receive plaintexts or decryption keys.
- **Passphrase Invariant:** Passphrases NEVER travel over MCP JSON-RPC tool parameters (prevents leaking into LLM chat logs, database traces, or prompt caches).

---

## 2. Server Architecture & Transport
- **Transport:** Standard input/output (`stdio`) via `@modelcontextprotocol/sdk`.
- **Runtime:** Node.js (TypeScript) running locally on the user's workstation.
- **Data Access Boundary:** 100% of data access routes through WhatHappen HTTP API endpoints (`x-project-token`). **Direct Supabase service-role access is strictly prohibited.**

---

## 3. Configuration & Credential Provisioning
Secrets are provided to the process environment at startup (e.g. from macOS Keychain or `.env.local` 0600), NEVER through LLM tool arguments:
- `WHATHAPPEN_API_URL`: Base URL (default: `http://localhost:3000` or `http://167.233.236.178:3000`). Validated by hostname (`localhost`, `127.0.0.1`, or explicit remote IP `167.233.236.178`).
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.
- `WHATHAPPEN_INGEST_ALLOWLIST`: Comma-separated directory allowlist for file ingest (default: empty; must be explicitly configured by operator, e.g., `/Users/rajabey/exports`).

---

## 4. Cryptographic Handshake & Key Management Ground-Truth
The MCP server implements the exact isomorphic cryptographic primitives from `lib/crypto.ts` and `lib/passphrase-proof.ts`:
- **HMAC Proof Generation:**
  - Key: `sha256Hex(passphrase)` (exact hex digest as UTF-8 string, matching `lib/session-store.ts`).
  - Signed Message: Challenge nonce string returned by `GET /api/auth/challenge?projectId=<id>`.
  - Signature: `crypto.createHmac('sha256', keyHex).update(nonce).digest('hex')`.
- **Key Derivation (PBKDF2):**
  - Algorithm: PBKDF2 with SHA-256 (100,000 iterations).
  - Derived Key: AES-GCM 256-bit `CryptoKey`.
- **In-Memory Session Store:**
  - `sessions`: Map<projectId, { token: string, key: CryptoKey, expiresAt: number }>
  - Concurrency Lock: In-flight unlock requests share a single promise per `projectId` to prevent race conditions or nonce collisions during concurrent tool calls.
  - Expiry: Token and derived `CryptoKey` are strictly evicted together after 2 hours matching `PROJECT_TOKEN_TTL_MS`.

---

## 5. MCP Tools Specification

### 5.1 `whathappen_list_projects`
- **Description:** List accessible WhatsApp chat projects with metadata (ID, name, message count, timestamps).
- **Parameters:** None.
- **Implementation:** Calls `GET /api/projects`.

### 5.2 `whathappen_unlock_project`
- **Description:** Explicitly authenticate and unlock a project session using the environment passphrase. Must be called prior to message inspection tools.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Security Check:** Reads `WHATHAPPEN_PASSPHRASE` from process environment. Never takes secrets as tool arguments.
- **Implementation:**
  1. Checks if project is already unlocked and token is valid.
  2. Acquires per-project concurrency lock.
  3. Calls `GET /api/auth/challenge?projectId=<id>`.
  4. Computes `proof = HMAC-SHA256(sha256Hex(passphrase), challenge.nonce)`.
  5. Calls `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  6. Derives AES-GCM key via PBKDF2 in RAM.
  7. Stores token + key in session cache with matching TTL.

### 5.3 `whathappen_search_messages`
- **Description:** Search through decrypted chat transcripts.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `query` (string, required): Text search term or pattern.
  - `limit` (number, optional, default: 50, max: 200).
  - `sender` (string, optional): Filter by sender name/number.
  - `startDate` (string, optional): ISO-8601 start date.
  - `endDate` (string, optional): ISO-8601 end date.
- **Fail-Fast Invariant:** If `projectId` is not unlocked in session cache, immediately returns an explicit `PROJECT_LOCKED` error instructing the agent to call `whathappen_unlock_project`.
- **Implementation:**
  1. Retrieves active token & derived key from session store.
  2. Calls `POST /api/ai-chat/query` with token to fetch ciphertext records.
  3. Decrypts messages in local RAM using cached derived key.
  4. Applies message count limit first.
  5. Applies message-boundary-aware character clamping (max 100K chars); if exceeded, omits excess complete messages and appends a structured banner: `[Warning: Output truncated at message boundary. X messages omitted.]`.

### 5.4 `whathappen_get_chronology`
- **Description:** Inspect chronological message history around a specific date/anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `anchorTimestamp` (string, optional): ISO-8601 anchor.
  - `windowSize` (number, optional, default: 20, max: 50).
- **Fail-Fast Invariant:** Requires prior unlock (`PROJECT_LOCKED` error if missing).
- **Implementation:** Fetches surrounding ciphertext window from API, decrypts in RAM with cached key, and returns formatted messages.

### 5.5 `whathappen_extract_financials`
- **Description:** Extract structured financial transactions, bank receipts, and debt obligations from chat history.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Fail-Fast Invariant:** Requires prior unlock (`PROJECT_LOCKED` error if missing).
- **Implementation (Client-Side Zero-Knowledge):**
  1. Fetches encrypted project messages via `POST /api/ai-chat/query` using cached token.
  2. Decrypts messages entirely in local client RAM.
  3. Runs deterministic regex and ledger parsers locally on decrypted text (detecting amounts, currencies, IBANs, receipts).
  4. Formats structured JSON financial ledger without ever sending plaintext to external APIs.

### 5.6 `whathappen_trigger_ingest`
- **Description:** Ingest a local WhatsApp `.zip` export file into the processing pipeline.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `filePath` (string, required): Absolute file path to the export archive on local disk.
- **Security & Path Validation:**
  - Fail-closed allowlist: Rejects unless `WHATHAPPEN_INGEST_ALLOWLIST` is configured and `filePath` resolves inside an allowed directory.
  - File descriptor validation: Opens file descriptor (`fs.openSync`), validates real path on descriptor (`fs.realpathSync`), and validates `stat.size <= 100MB`.
  - Extension check: Must strictly end with `.zip`.
- **Implementation:** Streams validated ZIP stream to `POST /api/process-file` on `:3000`.

---

## 6. Resilience, Retries & Security Guardrails
1. **HTTP Resilience:** All API calls use exponential backoff (3 attempts with jitter) on 429/503 errors.
2. **Zero Secret Leakage:** No credentials in MCP tool schemas or tool call histories.
3. **Fail-Closed Gate:** If `WHATHAPPEN_PASSPHRASE` is missing or invalid, unlock throws `UNAUTHORIZED` and halts.
4. **No Direct Database Bypass:** Zero Supabase client dependencies or service keys in the MCP codebase.
5. **Local Isolation:** Stdio-only execution bound to localhost.
