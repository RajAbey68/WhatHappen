# ADVERSARIAL REVIEWER BRIEF — WHATHAPPEN MCP SERVER PLAN (ROUND 2)

You are an ADVERSARIAL PEER REVIEWER for an engineering build plan. Your job is to break it, not to be nice. You are reviewing the plan text delimited at the bottom.

## Context the plan is built for
- WhatHappen is a zero-knowledge WhatsApp chat analysis and legal archiving platform.
- Previous review (Round 1) was BLOCKED due to:
  1. Passphrase leakage via MCP tool parameters.
  2. Direct Supabase service-role DB bypass.
  3. Cloud Mode decryption paradox.
- Plan v2.0 resolves these by restricting to Local Stdio mode only, injecting secrets via process env (never tool params), removing direct DB access, and aligning with `lib/crypto.ts` PBKDF2/AES-GCM.

## Severity rubric (use ONLY these)
- **P0 — blocks everything / catastrophic.** Security hole, secret leak, auth bypass, data loss, or the plan cannot work.
- **P1 — will break a phase.** Wrong command/package/auth path, nonexistent software, wrong sequencing, false claim, blocker for implementer.
- **P2 — important quality gap.** Missing fallback, ambiguity, missing guardrail.
- **P3 — advisory only.** Nice-to-have, style, optional hardening. P3 findings NEVER block.

## Rules of engagement
1. Only flag issues that materially threaten the stated outcome. No bikeshedding.
2. Judge the plan against the stated goal.
3. Be honest: if the plan is executable, safe, and complete, say CLEAR. Do not invent findings.

## Required output format (exact)
```
## ROUND FINDINGS
### [Px] <short title>
- Section: <plan section>
- Problem: <1-3 sentences>
- Required fix: <1-2 sentences>
(repeat for every finding)

## VERDICT
BLOCKED|CLEAR
P0=<n> P1=<n> P2=<n> P3=<n>
```

---

## THE PLAN UNDER REVIEW

<plan>
# WhatHappen MCP Server Architecture & Implementation Plan (v20.0 - Absolute Convergence Golden Plan)

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
- `WHATHAPPEN_API_URL`: Base URL. Must parse to exact loopback IP `http://127.0.0.1:3000` (parsed via `new URL()`; protocol must strictly be `http:`, hostname `127.0.0.1`, port `3000`, pathname strictly `/`). Any deviation immediately halts process.
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.
  - Pre-flight Validation: Minimum 16 characters. If empty or invalid, process exits with code 1 immediately.

---

## 4. Cryptographic Handshake & Key Management Ground-Truth
- **Exact Interoperable Server Protocol Alignment:**
  1. **HMAC Authentication Handshake:**
     - Key: `crypto.createHash('sha256').update(passphrase, 'utf8').digest('hex')` (SHA-256 hex string matching `lib/session-store.ts`).
     - Signature: `crypto.createHmac('sha256', keyHex).update(challenge.nonce, 'utf8').digest('hex')`.
     - Memory Hygiene: `keyHex` and passphrase buffers are zeroed (`buf.fill(0)`) in `finally` blocks. No raw passphrase hashes are persisted in the long-lived session store.
  2. **AES-GCM Decryption Key Derivation & Bounded Salt Map:**
     - In WhatHappen, per-message ciphertexts stored in Supabase contain their own unique salt and IV (`{ ciphertext, iv, salt }` matching `lib/crypto.ts:119`).
     - Key Derivation Function: `deriveKey(passphrase, saltBytes)` using PBKDF2 with SHA-256 (100,000 iterations) -> AES-GCM 256-bit `CryptoKey` (`extractable: false`).
     - Bounded Per-Project Key Cache: Key derivation is cached per `sha256Hex(projectId + ":" + salt)` in an LRU Map capped at max 100 entries per project. Raw derived buffers are wiped with `buf.fill(0)` immediately upon WebCrypto import.
- **In-Memory Session Store & Auto-Eviction:**
  - Keyed strictly by validated RFC 4122 UUID v4 string normalized to lowercase.
  - Single-user local process binding (`process.pid` validated).
  - Capacity Bound: Random eviction threshold at 20 active sessions to prevent state exhaustion without LRU timing side-channels.
  - Schema: `{ token: string, saltMap: Map<string, CryptoKey>, expiresAt: number }` (Zero secret hashes stored).
  - Expiry Clamping: `expiresAt` is clamped to a maximum of 2 hours (`Date.now() + 2 * 3600 * 1000`) regardless of server claim.
  - Background Refresh: Queued at 90% TTL. On 401/403, session is immediately purged.
  - In-Flight Memory Hygiene: Decrypted message buffers and abort stream buffers are explicitly zeroed in `finally` blocks.

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
- **Implementation:** Validates UUID first, normalizes to lowercase, returns `{ projectId, unlocked: boolean, expiresAt?: number, ttlRemainingSeconds?: number }` using local in-memory session cache.

### 5.3 `whathappen_unlock_project`
- **Description:** Explicitly authenticate and unlock a project session using the environment passphrase. Returns status and remaining TTL.
- **Parameters:**
  - `projectId` (string, required): RFC 4122 compliant UUID string.
- **Implementation:**
  1. Validates UUID format against RFC 4122 regex `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$` first, then normalizes strictly to lowercase.
  2. Enforces client-side rate limit (min 3s interval, exponential backoff).
  3. Calls `GET /api/auth/challenge?projectId=<id>` to obtain `{ nonce, expiresAt }`.
  4. Computes `proof = HMAC-SHA256(sha256Hex(passphrase), challenge.nonce)`. Zeroes buffers in `finally` block with `buf.fill(0)`.
  5. Calls `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  6. **Mandatory Project-Scoped Verification:** Makes an authenticated verification call to the project-specific endpoint `GET /api/projects/${projectId}` with the `x-project-token` header to confirm the token actually authorizes this specific project before returning success.
  7. Stores token in session cache under lowercase UUID with clamped `expiresAt` TTL.
  8. Returns `{ projectId, status: 'unlocked', expiresAt, ttlRemainingSeconds }`.

### 5.4 `whathappen_lock_project`
- **Description:** Explicitly evict a project session and wipe cached cryptographic keys from memory.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Implementation:** Validates UUID, normalizes to lowercase, deletes session from Map, clears saltMap keys, and returns `{ projectId, status: 'locked' }`.

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
  1. Validates UUID, enforces strict `Z`-ending UTC date strings, and verifies session presence.
  2. Enforces per-project rate limit throttle (min 1s interval).
  3. Sends `POST /api/ai-chat/query` with server-side limit parameter, idempotency key (UUID v4), and token.
  4. Uses `AbortController` in a `try...finally` block; aborts stream if incoming bytes exceed 50MB.
  5. Decrypts messages incrementally in RAM: for each message, derives/fetches key for `sha256Hex(projectId + ":" + message.salt)` from bounded saltMap and decrypts `message.ciphertext` with `message.iv` via AES-GCM (throws `DECRYPTION_FAILED` on tag mismatch).
  6. Plaintext buffers are zeroed after serialization. Truncates strictly at whole message boundaries before cumulative plaintext exceeds 100,000 UTF-8 bytes measured via `Buffer.byteLength(str, 'utf8')`.

### 5.6 `whathappen_get_chronology`
- **Description:** Inspect chronological message history around a specific date/anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `anchorTimestamp` (string, required): Strict ISO-8601 UTC timestamp ending in `Z` (`YYYY-MM-DDTHH:mm:ss.sssZ`).
  - `windowSize` (number, optional, default: 20, max: 50, min: 1).
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation:** Validates UUID and ISO-8601 `Z` timestamp, fetches surrounding ciphertext window via API, decrypts each record in RAM with salt/iv tag verification, returns structured envelope.

### 5.7 `whathappen_extract_financials`
- **Description:** Extract structured financial transactions, bank receipts, and debt obligations from chat history.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `limit` (number, optional, default: 100, max: 200).
  - `startDate` (string, optional): Strict ISO-8601 UTC date string ending in `Z`.
  - `endDate` (string, optional): Strict ISO-8601 UTC date string ending in `Z`.
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation (Client-Side Zero-Knowledge):**
  1. Validates UUID and strict `Z` date bounds, passes parameters to `POST /api/ai-chat/query` using cached token and idempotency key.
  2. Decrypts messages entirely in local client RAM with per-message salt/iv auth tag validation.
  3. Runs deterministic regex and ledger parsers locally on decrypted text.
  4. Formats structured JSON financial ledger without ever sending plaintext to external APIs.

---

## 6. Resilience, Retries & Security Guardrails
1. **HTTP Resilience:** All API calls use exponential backoff (3 attempts with jitter) on 429/503 errors.
2. **Zero Secret Leakage:** No credentials in MCP tool schemas or tool call histories.
3. **Fail-Closed Gate:** If `WHATHAPPEN_PASSPHRASE` is missing or invalid, unlock throws `UNAUTHORIZED` and halts.
4. **No Direct Database Bypass:** Zero Supabase client dependencies or service keys in the MCP codebase.
5. **Strict Loopback Binding:** Only connects to `http://127.0.0.1:3000/`.

</plan>
