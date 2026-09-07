# WhatHappen MCP Server Architecture & Implementation Plan (v12.0 - Dual-Certified Specification)

## 1. Goal & Context
Build an official Model Context Protocol (MCP) server for the **WhatHappen** platform to enable local AI agent runtimes (Hermes Desktop, Claude Desktop, Cursor) to securely inspect, search, and analyze WhatsApp transcripts and project metadata.

### Infrastructure & Security Ground-Truth
- **WhatHappen Server Target:** Strictly **Loopback Only** (`http://127.0.0.1:3000` or `http://localhost:3000`).
  *(Remote plain IP access is eliminated. Connecting to Hermes-Dev requires an SSH local port forward: `ssh -L 3000:localhost:3000 root@167.233.236.178`).*
- **Distribution Scope:** **Local Stdio Mode ONLY**. Remote SSE/Cloud mode is excluded to preserve zero-knowledge invariants (avoiding remote key escrow).
- **Zero-Knowledge Invariant:** Transcripts are stored encrypted at rest (AES-GCM-256). Decryption occurs exclusively in local client RAM. Server-side APIs never receive plaintexts or decryption keys.
- **Passphrase Invariant:** Passphrases NEVER travel over MCP JSON-RPC tool parameters.
- **Scope Clarification (No Ingest Over MCP):** Ingestion is strictly excluded to eliminate all TOCTOU, symlink traversal, and local filesystem exfiltration attack vectors. Users and agents use WhatHappen's native web UI or curl upload gateway for uploading `.zip` archives.

---

## 2. Server Architecture & Transport
- **Transport:** Standard input/output (`stdio`) via `@modelcontextprotocol/sdk`.
- **Runtime:** Node.js (TypeScript) running locally on the user's workstation.
- **Data Access Boundary:** All project data operations route through WhatHappen HTTP API endpoints (`x-project-token`). **Direct Supabase service-role access is strictly prohibited.**

---

## 3. Configuration & Credential Provisioning
- `WHATHAPPEN_API_URL`: Base URL (default: `http://127.0.0.1:3000`).
  - Strict Protocol & Hostname Validation: Parsed via Node.js `new URL(apiUrl)`. Protocol must strictly equal `http:`. Hostname must strictly equal `localhost` or `127.0.0.1`. URL path must be `/` or empty (no arbitrary path prefixes). Any deviation halts startup.
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.

---

## 4. Cryptographic Handshake & Key Management Ground-Truth
- **HMAC Proof Generation (Exact Isomorphic Spec):**
  - Hash Key: `const keyHex = crypto.createHash('sha256').update(passphrase, 'utf8').digest('hex')`.
  - Nonce Signature: `const proof = crypto.createHmac('sha256', keyHex).update(challenge.nonce, 'utf8').digest('hex')`.
  - Memory Hygiene: Passphrase buffer and intermediate HMAC key buffers are zeroed (`buf.fill(0)`) immediately after computation.
- **Key Derivation & AES-GCM Tag Verification (Trial Decryption Gate):**
  - Algorithm: PBKDF2 with SHA-256 (100,000 iterations).
  - WebCrypto Import: Raw derived bytes imported via `crypto.subtle.importKey('raw', derivedBuffer, 'AES-GCM', false, ['encrypt', 'decrypt'])` with `extractable: false`.
  - Buffer Zeroing: `derivedBuffer.fill(0)` executed immediately upon import.
  - **Authenticated Decryption Tag Gate:** AES-GCM provides authenticated encryption with an embedded 16-byte authentication tag. When `POST /api/ai-chat/query?limit=1` is test-decrypted, `crypto.subtle.decrypt` cryptographically validates ciphertext integrity against the derived key via the GCM auth tag. If the passphrase is wrong, tag verification mathematically fails (`OperationError`), the key is purged, and an explicit `PASSPHRASE_INVALID` error is thrown without caching.
- **In-Memory Session Store & Auto-Refresh:**
  - Composite Key: `sessions` Map keyed by `${apiUrl}:${projectId.toLowerCase()}` to eliminate cache poisoning across multi-tenant/multi-port environments.
  - Schema: `{ token: string, key: CryptoKey, expiresAt: number }`.
  - TTL Synchronization: `expiresAt` is set directly from the `expiresAt` integer timestamp returned by `POST /api/project-token`.
  - Global Rate Limiter & Concurrency Lock: Token bucket rate limiter across all endpoints (max 10 req/s), single in-flight unlock/refresh promise per composite key with exponential backoff on auth failure.
  - Background Refresh: Queued safely without invalidating active in-flight queries. Existing session retained until expiry or explicit 401 response.

---

## 5. MCP Tools Specification

### 5.1 `whathappen_list_projects`
- **Description:** List accessible WhatsApp chat projects with metadata (ID, name, message count, timestamps).
- **Parameters:** None.
- **Rate Limit:** Client-side throttled (max 1 call per 5 seconds).
- **Implementation:** Calls `GET /api/projects`.

### 5.2 `whathappen_unlock_project`
- **Description:** Explicitly authenticate and unlock a project session using the environment passphrase. Must be called prior to message inspection tools.
- **Parameters:**
  - `projectId` (string, required): RFC 4122 compliant UUID string (validated via `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`).
- **Implementation:**
  1. Validates UUID format and normalizes to lowercase.
  2. Enforces client-side rate limit (exponential backoff).
  3. Calls `GET /api/auth/challenge?projectId=<id>`.
  4. Computes `proof = HMAC-SHA256(sha256Hex(passphrase), challenge.nonce)`.
  5. Calls `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  6. Derives non-extractable AES-GCM `CryptoKey` in RAM, zeros raw buffer.
  7. Performs Trial Decryption gate with AES-GCM tag verification.
  8. Stores token + key in session cache under `${apiUrl}:${projectId}` with matching `expiresAt` TTL.

### 5.3 `whathappen_search_messages`
- **Description:** Search through decrypted chat transcripts.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `query` (string, required): Text search term or pattern.
  - `limit` (number, optional, default: 50, max: 200).
  - `sender` (string, optional): Filter by sender name/number.
  - `startDate` (string, optional): ISO-8601 start date (validated with strict regex and `Date.parse`).
  - `endDate` (string, optional): ISO-8601 end date (must be >= `startDate`).
- **Fail-Fast Invariant:** Throws explicit `PROJECT_LOCKED` error if composite key has never been unlocked, or `SESSION_EXPIRED` if token is stale.
- **Implementation:**
  1. Validates UUID, date range consistency, and session presence.
  2. Streams `POST /api/ai-chat/query` with token to fetch ciphertext records (aborts immediately if response stream exceeds 50MB).
  3. Decrypts messages incrementally in RAM using cached derived key.
  4. Limits by message count first.
  5. Formats output into a structured JSON envelope: `{ results: Message[], totalCount: number, truncated: boolean, omittedCount: number }`. Truncation stops appending complete message objects before cumulative plaintext exceeds 100,000 UTF-8 characters.

### 5.4 `whathappen_get_chronology`
- **Description:** Inspect chronological message history around a specific date/anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `anchorTimestamp` (string, required): Explicit ISO-8601 anchor timestamp (e.g., `2026-09-01T12:00:00Z`).
  - `windowSize` (number, optional, default: 20, max: 50).
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation:** Validates ISO-8601 timestamp, fetches surrounding ciphertext window, decrypts incrementally in RAM with cached key, returns structured envelope.

### 5.5 `whathappen_extract_financials`
- **Description:** Extract structured financial transactions, bank receipts, and debt obligations from chat history.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation (Client-Side Zero-Knowledge):**
  1. Fetches encrypted project messages via `POST /api/ai-chat/query` using cached token.
  2. Decrypts messages entirely in local client RAM.
  3. Runs deterministic regex and ledger parsers locally on decrypted text.
  4. Formats structured JSON financial ledger without ever sending plaintext to external APIs.

---

## 6. Resilience, Retries & Security Guardrails
1. **HTTP Resilience:** All API calls use exponential backoff (3 attempts with jitter) on 429/503 errors.
2. **Zero Secret Leakage:** No credentials in MCP tool schemas or tool call histories.
3. **Fail-Closed Gate:** If `WHATHAPPEN_PASSPHRASE` is missing or invalid, unlock throws `UNAUTHORIZED` and halts.
4. **No Direct Database Bypass:** Zero Supabase client dependencies or service keys in the MCP codebase.
5. **Strict Loopback Binding:** Only connects to local loopback interface.
