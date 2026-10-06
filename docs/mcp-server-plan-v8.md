# WhatHappen MCP Server Architecture & Implementation Plan (v8.0 - Certified Production Plan)

## 1. Goal & Context
Build an official Model Context Protocol (MCP) server for the **WhatHappen** platform to enable local AI agent runtimes (Hermes Desktop, Claude Desktop, Cursor) to securely inspect, search, and analyze WhatsApp transcripts and project metadata.

### Infrastructure & Security Ground-Truth
- **WhatHappen Server Target:** Strictly **Loopback Only** (`http://127.0.0.1:3000` or `http://localhost:3000`).
  *(Remote plain IP access is completely eliminated. Connecting to Hermes-Dev requires an SSH local port forward: `ssh -L 3000:localhost:3000 root@167.233.236.178`).*
- **Distribution Scope:** **Local Stdio Mode ONLY**. Remote SSE/Cloud mode is excluded to preserve zero-knowledge invariants (avoiding remote key escrow).
- **Zero-Knowledge Invariant:** Transcripts are stored encrypted at rest (AES-GCM-256). Decryption occurs exclusively in local client RAM. Server-side APIs never receive plaintexts or decryption keys.
- **Passphrase Invariant:** Passphrases NEVER travel over MCP JSON-RPC tool parameters.

---

## 2. Server Architecture & Transport
- **Transport:** Standard input/output (`stdio`) via `@modelcontextprotocol/sdk`.
- **Runtime:** Node.js (TypeScript) running locally on the user's workstation.
- **Data Access Boundary:** All project data operations route through WhatHappen HTTP API endpoints (`x-project-token`). **Direct Supabase service-role access is strictly prohibited.**

---

## 3. Configuration & Credential Provisioning
- `WHATHAPPEN_API_URL`: Base URL (default: `http://127.0.0.1:3000`).
  - Strict Protocol & Hostname: Parsed via Node.js `new URL(apiUrl)`. Protocol must strictly equal `http:`. Hostname must strictly equal `localhost` or `127.0.0.1`.
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.
  - Pre-flight Validation: Minimum 16 characters.
- `WHATHAPPEN_INGEST_ALLOWLIST`: **Mandatory**. JSON-encoded array of absolute directory paths (e.g. `["/Users/rajabey/exports"]`). Fails closed (ingest tool disabled) if empty, unset, or invalid JSON.

---

## 4. Cryptographic Handshake & Key Management Ground-Truth
- **HMAC Proof Generation:**
  - Key: `sha256Hex(passphrase)` (exact hex digest matching `lib/session-store.ts`).
  - Signed Message: Challenge nonce string returned by `GET /api/auth/challenge?projectId=<id>`.
  - Signature: `crypto.createHmac('sha256', keyHex).update(nonce).digest('hex')`.
  - Memory Hygiene: Passphrase buffer and HMAC key buffers are zeroed (`buf.fill(0)`) immediately after computation.
- **Key Derivation (WebCrypto Native):**
  - Algorithm: PBKDF2 with SHA-256 (100,000 iterations).
  - WebCrypto Import: Raw derived bytes imported via `crypto.subtle.importKey('raw', derivedBuffer, 'AES-GCM', false, ['encrypt', 'decrypt'])` with `extractable: false`.
  - Buffer Zeroing: `derivedBuffer.fill(0)` executed immediately upon import. *(Documented limitation: memory protection relies on OS encrypted swap/FileVault on macOS).*
- **Server Challenge Invariant (Replay Defense):**
  - Challenges are verified server-side to be single-use, time-bound (60s TTL), and cryptographically signed/bound to `projectId` via `lib/passphrase-proof.ts`.
- **In-Memory Session Store & Auto-Refresh:**
  - `sessions`: Map<projectId, { token: string, key: CryptoKey, expiresAt: number }>
  - Concurrency Lock & Rate Limit: Single in-flight unlock promise per `projectId`, max 3 attempts per 10s with exponential backoff.
  - Background Refresh with Fallback: Refreshes token at 90% of TTL. If background refresh fails, existing session is retained until expiry or explicit 401 response.

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
  - `projectId` (string, required): RFC 4122 compliant UUID v4 string (`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).
- **Implementation:**
  1. Validates UUID v4 format.
  2. Enforces client-side rate limit (exponential backoff).
  3. Calls `GET /api/auth/challenge?projectId=<id>`.
  4. Computes `proof = HMAC-SHA256(sha256Hex(passphrase), challenge.nonce)`.
  5. Calls `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  6. Derives non-extractable AES-GCM `CryptoKey` in RAM and zeros raw buffer.
  7. Stores token + key in session cache with matching 2-hour TTL.

### 5.3 `whathappen_search_messages`
- **Description:** Search through decrypted chat transcripts.
- **Parameters:**
  - `projectId` (string, required): Project UUID v4.
  - `query` (string, required): Text search term or pattern.
  - `limit` (number, optional, default: 50, max: 200).
  - `sender` (string, optional): Filter by sender name/number.
  - `startDate` (string, optional): ISO-8601 start date (validated with strict regex and `Date.parse`).
  - `endDate` (string, optional): ISO-8601 end date (must be >= `startDate`).
- **Fail-Fast Invariant:** Throws explicit `PROJECT_LOCKED` error if `projectId` is not unlocked.
- **Implementation:**
  1. Validates UUID v4, date range consistency, and session presence.
  2. Calls `POST /api/ai-chat/query` with token to fetch ciphertext records.
  3. Decrypts messages in RAM using cached derived key.
  4. Limits by message count first.
  5. Formats output into a structured JSON envelope: `{ results: Message[], totalCount: number, truncated: boolean, omittedCount: number }`. Stops appending complete message objects before exceeding 100,000 UTF-8 characters.

### 5.4 `whathappen_get_chronology`
- **Description:** Inspect chronological message history around a specific date/anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID v4.
  - `anchorTimestamp` (string, optional): ISO-8601 anchor (defaults to current timestamp `Date.now()` if omitted).
  - `windowSize` (number, optional, default: 20, max: 50).
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` error if not unlocked.
- **Implementation:** Fetches surrounding ciphertext window, decrypts in RAM with cached key, returns structured envelope.

### 5.5 `whathappen_extract_financials`
- **Description:** Extract structured financial transactions, bank receipts, and debt obligations from chat history.
- **Parameters:**
  - `projectId` (string, required): Project UUID v4.
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` error if not unlocked.
- **Implementation (Client-Side Zero-Knowledge):**
  1. Fetches encrypted project messages via `POST /api/ai-chat/query` using cached token.
  2. Decrypts messages entirely in local client RAM.
  3. Runs deterministic regex and ledger parsers locally on decrypted text.
  4. Formats structured JSON financial ledger without ever sending plaintext to external APIs.

### 5.6 `whathappen_trigger_ingest`
- **Description:** Ingest a local WhatsApp `.zip` export file into the processing pipeline.
- **Parameters:**
  - `projectId` (string, required): Project UUID v4.
  - `filePath` (string, required): Absolute file path to export archive on local disk.
- **Atomic Open-Then-Verify Security Validation (TOCTOU Defense):**
  - Project must be unlocked (`x-project-token` required in upload header).
  - Fails closed if `WHATHAPPEN_INGEST_ALLOWLIST` is unset.
  - Extension check: Must strictly end with `.zip`.
  - **Open Handle First:** `const fd = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0))`.
  - Descriptor Path Resolution: `const realPath = fs.realpathSync(filePath)`.
  - Allowlist Containment Check: Parsed against JSON allowlist directories using `!path.relative(allowedDir, realPath).startsWith('..') && !path.isAbsolute(path.relative(allowedDir, realPath))`.
  - Size check on descriptor: `fs.fstatSync(fd).size <= 100 * 1024 * 1024` (100MB).
- **Implementation:** Streams validated ZIP file descriptor to `POST /api/process-file` on `:3000` with `x-project-token` header.

---

## 6. Resilience, Retries & Security Guardrails
1. **HTTP Resilience:** All API calls use exponential backoff (3 attempts with jitter) on 429/503 errors.
2. **Zero Secret Leakage:** No credentials in MCP tool schemas or tool call histories.
3. **Fail-Closed Gate:** If `WHATHAPPEN_PASSPHRASE` is missing or invalid, unlock throws `UNAUTHORIZED` and halts.
4. **No Direct Database Bypass:** Zero Supabase client dependencies or service keys in the MCP codebase.
5. **Strict Loopback Binding:** Only connects to local loopback interface.
