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
# WhatHappen MCP Server Architecture & Implementation Plan (v16.0 - Diamond Clear)

## 1. Goal & Context
Build an official Model Context Protocol (MCP) server for the **WhatHappen** platform to enable local AI agent runtimes (Hermes Desktop, Claude Desktop, Cursor) to securely inspect, search, and analyze WhatsApp transcripts and project metadata.

### Infrastructure & Security Ground-Truth
- **WhatHappen Server Target:** Strictly **Loopback Only** (`http://127.0.0.1:3000`).
  *(Remote plain connections are prohibited. Any remote access to Hermes-Dev MUST use a verified SSH local port forward with strict host key checking: `ssh -N -L 3000:127.0.0.1:3000 -o StrictHostKeyChecking=yes user@167.233.236.178`).*
- **Distribution Scope:** **Local Stdio Mode ONLY**. Remote SSE/Cloud mode is excluded to preserve zero-knowledge invariants.
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
- `WHATHAPPEN_API_URL`: Base URL. Must parse to exact loopback IP `http://127.0.0.1:3000` (or `http://localhost:3000`). Any other target immediately halts process.
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.
  - Pre-flight Validation: Min 16 chars, max 256 chars.

---

## 4. Cryptographic Handshake & Key Management Ground-Truth
- **Verified Endpoint Protocol:**
  - Challenge: `GET /api/auth/challenge?projectId=<id>`.
  - Proof: `HMAC-SHA256(key=sha256Hex(passphrase), message=challenge.nonce)`.
  - Token Mint: `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  - Memory Hygiene: `keyHex` and passphrase buffers are securely wiped using `crypto.randomFillSync` and `buf.fill(0)` in `finally` blocks on both success and failure paths.
- **Key Derivation (PBKDF2):**
  - Algorithm: PBKDF2 with SHA-256 (100,000 iterations).
  - Derived Key: AES-GCM 256-bit `CryptoKey` (marked non-extractable).
  - Buffer Zeroing: `derivedBuffer.fill(0)` executed immediately upon import.
- **In-Memory Session Store & Auto-Eviction:**
  - Keyed by exact canonical string `projectId` (case-preserved matching server UUID representation).
  - Schema: `{ token: string, key: CryptoKey, expiresAt: number, passphraseHash: string }`.
  - Expiry Clamping: `expiresAt` is clamped to a maximum of 2 hours (`Date.now() + 2 * 3600 * 1000`) regardless of server claim.
  - Background Refresh: Queued at 90% TTL. On 401/403, session is immediately purged; on 5xx/network failure, retried 3 times with exponential backoff before invalidating.

---

## 5. MCP Tools Specification

### 5.1 `whathappen_list_projects`
- **Description:** List accessible WhatsApp chat projects with metadata (ID, name, message count, timestamps).
- **Parameters:** None.
- **Implementation:** Calls `GET /api/projects`. Throttled to max 1 call per 5 seconds.

### 5.2 `whathappen_unlock_project`
- **Description:** Explicitly authenticate and unlock a project session using the environment passphrase. Returns status and remaining TTL.
- **Parameters:**
  - `projectId` (string, required): RFC 4122 compliant UUID string.
- **Implementation:**
  1. Validates UUID format.
  2. Enforces client-side rate limit (min 3s interval, exponential backoff).
  3. Calls `GET /api/auth/challenge?projectId=<id>`.
  4. Computes `proof = HMAC-SHA256(sha256Hex(passphrase), challenge.nonce)`. Zeroes buffers in `finally` block.
  5. Calls `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  6. Derives non-extractable AES-GCM `CryptoKey` in RAM, zeros raw buffer.
  7. Stores token + key in session cache with clamped `expiresAt` TTL.
  8. Returns `{ projectId, status: 'unlocked', expiresAt, ttlRemainingSeconds }`.

### 5.3 `whathappen_lock_project`
- **Description:** Explicitly evict a project session and wipe cached cryptographic keys from memory.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Implementation:** Removes session from Map and returns `{ projectId, status: 'locked' }`.

### 5.4 `whathappen_search_messages`
- **Description:** Search through decrypted chat transcripts.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `query` (string, required): Text search term (max 1000 characters).
  - `limit` (number, optional, default: 50, max: 200).
  - `sender` (string, optional): Filter by sender name/number.
  - `startDate` (string, optional): ISO-8601 start date.
  - `endDate` (string, optional): ISO-8601 end date (must be >= `startDate`).
- **Fail-Fast Invariant:** Throws explicit `PROJECT_LOCKED` error if project has never been unlocked, or `SESSION_EXPIRED` if token is stale.
- **Implementation:**
  1. Validates UUID, date range consistency, and session presence.
  2. Sends `POST /api/ai-chat/query` with server-side limit parameter and token.
  3. Aborts stream if incoming bytes exceed 50MB.
  4. Decrypts messages incrementally in RAM using cached derived key.
  5. Truncates strictly at whole message boundaries before cumulative plaintext exceeds 100,000 UTF-8 bytes measured via `Buffer.byteLength(str, 'utf8')`.

### 5.5 `whathappen_get_chronology`
- **Description:** Inspect chronological message history around a specific date/anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `anchorTimestamp` (string, required): Explicit ISO-8601 anchor timestamp.
  - `windowSize` (number, optional, default: 20, max: 50, min: 1).
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation:** Validates ISO-8601 timestamp, fetches surrounding ciphertext window via API, decrypts in RAM with cached key, returns structured envelope.

### 5.6 `whathappen_extract_financials`
- **Description:** Extract structured financial transactions, bank receipts, and debt obligations from chat history.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `limit` (number, optional, default: 100, max: 200).
  - `startDate` (string, optional): ISO-8601 start date.
  - `endDate` (string, optional): ISO-8601 end date.
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation (Client-Side Zero-Knowledge):**
  1. Passes search boundaries (`startDate`, `endDate`, `limit`) to `POST /api/ai-chat/query` using cached token.
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

</plan>
