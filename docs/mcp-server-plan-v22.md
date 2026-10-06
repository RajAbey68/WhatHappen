# WhatHappen MCP Server Architecture & Implementation Plan (v22.0 - Verified Canonical Ground-Truth Master)

## 1. Goal & Context
Build an official Model Context Protocol (MCP) server for the **WhatHappen** platform to enable local AI agent runtimes (Hermes Desktop, Claude Desktop, Cursor) to securely inspect, search, and analyze WhatsApp transcripts and project metadata.

### Infrastructure & Security Ground-Truth
- **WhatHappen Server Target:** Strictly **Loopback Only** (`http://127.0.0.1:3000`).
  *(Remote access to Hermes-Dev requires an SSH local port forward: `ssh -N -L 3000:127.0.0.1:3000 -o StrictHostKeyChecking=yes user@167.233.236.178`).*
- **Distribution Scope:** **Local Stdio Mode ONLY** (Single-user workstation execution). Remote SSE/Cloud mode is excluded.
- **Zero-Knowledge Invariant:** Transcripts are stored encrypted at rest (AES-GCM-256). Decryption occurs exclusively in local client RAM. Server-side APIs never receive plaintexts or decryption keys.
- **Passphrase Invariant:** Passphrases NEVER travel over MCP JSON-RPC tool parameters.
- **Scope Clarification (No Ingest Over MCP):** Ingestion is strictly excluded to eliminate all filesystem/symlink traversal risks.

---

## 2. Server Architecture & Transport
- **Transport:** Standard input/output (`stdio`) via `@modelcontextprotocol/sdk`.
- **Runtime:** Node.js (TypeScript) running locally on the user's workstation.
- **Data Access Boundary:** All project data operations route through WhatHappen HTTP API endpoints (`x-project-token`). **Direct Supabase service-role access is strictly prohibited.**

---

## 3. Configuration & Canonicalization Ground-Truth
- `WHATHAPPEN_API_URL`: Base URL. Must parse to exact loopback IP `http://127.0.0.1:3000` (parsed via `new URL()`; protocol must strictly be `http:`, hostname `127.0.0.1`, port `3000`, origin `http://127.0.0.1:3000`). Trailing slashes are normalized away. Any non-loopback origin halts process on startup.
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.
  - Pre-flight Validation: Minimum 16 characters. If empty or invalid, process exits with code 1 immediately.

---

## 4. Cryptographic Handshake & Key Management Ground-Truth
- **Verified Source Code Evidence (Ground-Truth in Repo):**
  1. `lib/session-store.ts:68` & `lib/passphrase-proof.ts:39` define `sha256Hex(value: string)`:
     `crypto.createHash('sha256').update(value, 'utf8').digest('hex')`.
  2. Handshake:
     - `GET /api/auth/challenge?projectId=<id>` returns `{ nonce, expiresAt }`.
     - Proof: `HMAC-SHA256(key=sha256Hex(passphrase), message=nonce)`.
     - `POST /api/project-token` with `{ projectId, challenge: nonce, proof }` returns `{ token, expiresAt }`.
  3. Memory Hygiene: `keyHex` and passphrase buffers are zeroed (`buf.fill(0)`) in `finally` blocks.
- **AES-GCM Decryption Key Derivation & Bounded Salt Map:**
  - In WhatHappen, per-message ciphertexts stored in Supabase contain their own unique salt and IV (`{ ciphertext, iv, salt }` matching `lib/crypto.ts:119`).
  - Key Derivation Function: `deriveKey(passphrase, saltBytes)` using PBKDF2 with SHA-256 (100,000 iterations) -> AES-GCM 256-bit `CryptoKey` (`extractable: false`).
  - Bounded Per-Project Key Cache: Key derivation is cached using structured JSON keys: `sha256Hex(JSON.stringify({ projectId, salt }))` in an LRU Map capped at max 100 entries per project. Raw derived buffers are wiped with `buf.fill(0)` immediately upon WebCrypto import.
- **In-Memory Session Store & Auto-Eviction:**
  - Keyed strictly by normalized lowercase UUID: `projectId.toLowerCase()`.
  - Mutex/Synchronization: Per-project in-flight promise locks prevent race conditions during concurrent tool calls.
  - Schema: `{ token: string, saltMap: Map<string, CryptoKey>, expiresAt: number }`.
  - Expiry Clamping: `expiresAt` is clamped to a maximum of 2 hours (`Date.now() + 2 * 3600 * 1000`) regardless of server claim.
  - Background Refresh: Queued at 90% TTL. On 401/403, session is immediately purged.
  - In-Flight Memory Hygiene: Decrypted message buffers and abort stream buffers are explicitly zeroed in `finally` blocks on all paths.

---

## 5. MCP Tools Specification

### 5.1 `whathappen_list_projects`
- **Description:** List accessible WhatsApp chat projects with metadata (ID, name, message count, timestamps).
- **Parameters:** None.
- **Implementation:** Calls `GET /api/projects`. Throttled to max 1 call per 5 seconds.

### 5.2 `whathappen_get_project_status`
- **Description:** Inspect the current unlock status, remaining TTL, and session state for a project without triggering a new authentication handshake.
- **Parameters:**
  - `projectId` (string, required): RFC 4122 compliant UUID string.
- **Implementation:** Validates UUID first, normalizes to lowercase, checks session presence in memory, and returns `{ projectId, unlocked: boolean, expiresAt?: number, ttlRemainingSeconds?: number }`.

### 5.3 `whathappen_unlock_project`
- **Description:** Explicitly authenticate and unlock a project session using the environment passphrase. Returns status and remaining TTL.
- **Parameters:**
  - `projectId` (string, required): RFC 4122 compliant UUID string.
- **Implementation:**
  1. Pre-flight check: confirms `WHATHAPPEN_PASSPHRASE` is present and `>= 16 chars`.
  2. Validates UUID format against RFC 4122 regex `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$` first, then normalizes strictly to lowercase.
  3. Enforces in-memory client-side rate limit (min 3s interval per project, exponential backoff).
  4. Calls `GET /api/auth/challenge?projectId=<id>` to obtain `{ nonce, expiresAt }`.
  5. Computes `proof = HMAC-SHA256(sha256Hex(passphrase), challenge.nonce)`. Zeroes buffers in `finally` block with `buf.fill(0)`.
  6. Calls `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  7. Stores `{ token, saltMap: new Map(), expiresAt }` in session cache under `projectId.toLowerCase()`.
  8. Returns `{ projectId, status: 'unlocked', expiresAt, ttlRemainingSeconds }`.

### 5.4 `whathappen_lock_project`
- **Description:** Explicitly evict a project session and wipe cached cryptographic keys from memory.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Implementation:** Validates UUID, normalizes to lowercase, deletes session matching `projectId.toLowerCase()`, clears saltMap keys, and returns `{ projectId, status: 'locked' }`.

### 5.5 `whathappen_search_messages`
- **Description:** Search through project chat records.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `query` (string, required): Text search term (max 1000 characters).
  - `limit` (number, optional, default: 50, max: 200).
  - `sender` (string, optional): Filter by sender name/number.
  - `startDate` (string, optional): Strict ISO-8601 UTC date string ending in `Z` (e.g. `2026-01-01T00:00:00.000Z`).
  - `endDate` (string, optional): Strict ISO-8601 UTC date string ending in `Z` (must be >= `startDate`).
- **Fail-Fast Invariant:** Throws explicit `PROJECT_LOCKED` error if project has never been unlocked, or `SESSION_EXPIRED` if token is stale.
- **Implementation:**
  1. Normalizes UUID to lowercase, validates UTC date range consistency, and retrieves session from memory.
  2. Enforces per-project rate limit throttle (min 1s interval).
  3. Sends `POST /api/ai-chat/query` with headers `{ 'x-project-token': session.token, 'Content-Type': 'application/json' }`, body `{ projectId, query, limit, sender, startDate, endDate }`, and idempotency key. Timeout: 30s.
  4. Uses `AbortController` in a `try...finally` block; aborts stream if incoming bytes exceed 50MB. All partial buffers are zeroed on abort.
  5. Decrypts messages incrementally in RAM: for each message, derives/fetches key for `sha256Hex(JSON.stringify({ projectId, salt: message.salt }))` from bounded saltMap and decrypts `message.ciphertext` with `message.iv` via AES-GCM (throws `DECRYPTION_FAILED` on tag mismatch).
  6. Plaintext buffers are zeroed after serialization. Truncates strictly at whole message boundaries before cumulative plaintext exceeds 100,000 UTF-8 bytes measured via `Buffer.byteLength(str, 'utf8')`.

### 5.6 `whathappen_get_chronology`
- **Description:** Retrieve ordered chronological chat history around a specific date anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `anchorTimestamp` (string, required): Strict ISO-8601 UTC timestamp ending in `Z` (`YYYY-MM-DDTHH:mm:ss.sssZ`).
  - `windowSize` (number, optional, default: 20, max: 50, min: 1).
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation:**
  1. Validates UUID and ISO-8601 `Z` timestamp, retrieves session from memory.
  2. Calls `POST /api/ai-chat/query` with `{ 'x-project-token': session.token }`, query around `anchorTimestamp` with window bounds.
  3. Decrypts each record in RAM with salt/iv tag verification, returns structured message envelope.

### 5.7 `whathappen_extract_financials`
- **Description:** Retrieve project chat messages filtered for financial inspection.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `limit` (number, optional, default: 100, max: 200).
  - `startDate` (string, optional): Strict ISO-8601 UTC date string ending in `Z`.
  - `endDate` (string, optional): Strict ISO-8601 UTC date string ending in `Z`.
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation (Client-Side Zero-Knowledge):**
  1. Validates UUID and strict `Z` date bounds, retrieves session from memory.
  2. Calls `POST /api/ai-chat/query` with `{ 'x-project-token': session.token }` and financial query hints (`"payment OR bank OR invoice OR transfer OR receipt OR deposit OR account"`).
  3. Decrypts messages entirely in local client RAM with per-message salt/iv auth tag validation.
  4. Returns decrypted messages in structured JSON envelope for direct reasoning by the caller LLM.

---

## 6. Resilience, Retries & Security Guardrails
1. **HTTP Resilience:** All API calls use exponential backoff (3 attempts with jitter) on 429/503 errors.
2. **Zero Secret Leakage:** No credentials in MCP tool schemas or tool call histories.
3. **Fail-Closed Gate:** If `WHATHAPPEN_PASSPHRASE` is missing or invalid, unlock throws `UNAUTHORIZED` and halts.
4. **No Direct Database Bypass:** Zero Supabase client dependencies or service keys in the MCP codebase.
5. **Strict Loopback Binding:** Only connects to `http://127.0.0.1:3000`.
