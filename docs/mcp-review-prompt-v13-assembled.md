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
# WhatHappen MCP Server Architecture & Implementation Plan (v13.0 - Ironclad Golden Specification)

## 1. Goal & Context
Build an official Model Context Protocol (MCP) server for the **WhatHappen** platform to enable local AI agent runtimes (Hermes Desktop, Claude Desktop, Cursor) to securely inspect, search, and analyze WhatsApp transcripts and project metadata.

### Infrastructure & Security Ground-Truth
- **WhatHappen Server Target:** Strictly **Loopback Only** (`http://127.0.0.1:3000`).
  *(All URL variants are canonicalized strictly to `http://127.0.0.1:3000`. Connecting to Hermes-Dev requires an SSH local port forward: `ssh -L 3000:localhost:3000 user@167.233.236.178`).*
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

## 3. Configuration & Canonicalization Ground-Truth
- `WHATHAPPEN_API_URL`: Base URL (default: `http://127.0.0.1:3000`).
  - **Strict Canonicalization:** Parsed via `new URL(apiUrl)`. Hostnames `localhost` and `127.0.0.1` are strictly canonicalized to `http://127.0.0.1:3000` with trailing slash stripped. Any non-loopback address immediately aborts server initialization.
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.
  - Pre-flight Validation: Minimum 16 characters.

---

## 4. Cryptographic Handshake & Key Management Ground-Truth
- **HMAC Proof Generation (Exact Isomorphic Spec):**
  - Hash Key: `const keyHex = crypto.createHash('sha256').update(passphrase, 'utf8').digest('hex')`.
  - Nonce Signature: `const proof = crypto.createHmac('sha256', keyHex).update(challenge.nonce, 'utf8').digest('hex')`.
  - Memory Hygiene: `keyHex` and passphrase buffers are zeroed (`buf.fill(0)`) **immediately** after HMAC computation, BEFORE dispatching the network request to `POST /api/project-token`.
- **Key Derivation & Post-Token Trial Decryption Gate:**
  - Algorithm: PBKDF2 with SHA-256 (100,000 iterations).
  - WebCrypto Import: Raw derived bytes imported via `crypto.subtle.importKey('raw', derivedBuffer, 'AES-GCM', false, ['encrypt', 'decrypt'])` with `extractable: false`.
  - Buffer Zeroing: `derivedBuffer.fill(0)` executed immediately upon import.
  - **Sequential Trial Decryption:** The flow is non-circular:
    1. Caller exchanges HMAC proof for project access token via `POST /api/project-token`.
    2. Caller derives AES-GCM `CryptoKey` in RAM.
    3. Caller uses the freshly minted token to fetch the first message ciphertext via `POST /api/ai-chat/query?limit=1`.
    4. Caller attempts AES-GCM decryption with tag verification.
    5. If tag verification fails (`OperationError`), the key and token are purged immediately, and `PASSPHRASE_INVALID` is thrown without caching.
- **In-Memory Session Store & Auto-Refresh:**
  - Composite Key: `sessions` Map keyed strictly by canonical `http://127.0.0.1:3000:${projectId.toLowerCase()}`.
  - Schema: `{ token: string, key: CryptoKey, expiresAt: number }`.
  - TTL Synchronization: `expiresAt` is set directly from the `expiresAt` integer timestamp returned by `POST /api/project-token`.
  - Rate Limiting: Unified global token bucket across all endpoints (max 10 req/s), with per-project exponential backoff (max 3 unlock attempts per 10s).
  - Background Refresh: Queued safely without invalidating active in-flight queries. Existing session retained until expiry or explicit 401 response.

---

## 5. MCP Tools Specification

### 5.1 `whathappen_list_projects`
- **Description:** List accessible WhatsApp chat projects with metadata (ID, name, message count, timestamps).
- **Parameters:** None.
- **Implementation:** Calls `GET /api/projects`.

### 5.2 `whathappen_get_session_status`
- **Description:** Inspect the current authentication state and remaining session lifetime for a project without triggering an unlock.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Implementation:** Returns `{ projectId, unlocked: boolean, expiresAt?: number, ttlRemainingSeconds?: number }`.

### 5.3 `whathappen_unlock_project`
- **Description:** Explicitly authenticate and unlock a project session using the environment passphrase. Must be called prior to message inspection tools.
- **Parameters:**
  - `projectId` (string, required): RFC 4122 compliant UUID string (validated via `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`).
- **Implementation:**
  1. Validates UUID format and normalizes to lowercase.
  2. Enforces client-side rate limit (exponential backoff).
  3. Calls `GET /api/auth/challenge?projectId=<id>`.
  4. Computes `proof = HMAC-SHA256(sha256Hex(passphrase), challenge.nonce)`. Zeroes buffers immediately.
  5. Calls `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  6. Derives non-extractable AES-GCM `CryptoKey` in RAM, zeros raw buffer.
  7. Performs Sequential Trial Decryption gate on first message ciphertext.
  8. Stores token + key in session cache under canonical key with matching `expiresAt` TTL.

### 5.4 `whathappen_search_messages`
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
  5. Formats output into a structured JSON envelope: `{ results: Message[], totalCount: number, truncated: boolean, omittedCount: number }`. Truncation stops appending complete message objects before cumulative byte length exceeds 100,000 UTF-8 bytes using safe codepoint stream boundaries.

### 5.5 `whathappen_get_chronology`
- **Description:** Inspect chronological message history around a specific date/anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `anchorTimestamp` (string, required): Explicit ISO-8601 anchor timestamp (e.g., `2026-09-01T12:00:00Z`).
  - `windowSize` (number, optional, default: 20, max: 50).
- **Fail-Fast Invariant:** Throws `PROJECT_LOCKED` or `SESSION_EXPIRED` if not unlocked.
- **Implementation:** Validates ISO-8601 timestamp, fetches surrounding ciphertext window, decrypts incrementally in RAM with cached key, returns structured envelope.

### 5.6 `whathappen_extract_financials`
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

</plan>
