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
# WhatHappen MCP Server Architecture & Implementation Plan (v6.0 - Fully Hardened Loop)

## 1. Goal & Context
Build an official Model Context Protocol (MCP) server for the **WhatHappen** platform to enable local AI agent runtimes (Hermes Desktop, Claude Desktop, Cursor) to securely inspect, search, and analyze WhatsApp transcripts and project metadata.

### Infrastructure & Security Ground-Truth
- **WhatHappen Server Target:** Strictly **Loopback Only** (`http://127.0.0.1:3000` or `http://localhost:3000`).
  *(Remote plain IP access is completely eliminated to prevent TLS/MITM risks. Remote access to Hermes-Dev requires an SSH local port forward: `ssh -L 3000:localhost:3000 root@167.233.236.178`).*
- **Distribution Scope:** **Local Stdio Mode ONLY**. Remote SSE/Cloud mode is excluded to preserve zero-knowledge invariants (avoiding remote key escrow).
- **Zero-Knowledge Invariant:** Transcripts are stored encrypted at rest (AES-GCM-256). Decryption occurs exclusively in local client RAM. Server-side APIs never receive plaintexts or decryption keys.
- **Passphrase Invariant:** Passphrases NEVER travel over MCP JSON-RPC tool parameters.

---

## 2. Server Architecture & Transport
- **Transport:** Standard input/output (`stdio`) via `@modelcontextprotocol/sdk`.
- **Runtime:** Node.js (TypeScript) running locally on the user's workstation.
- **Data Access Boundary:** 100% of data access routes through WhatHappen HTTP API endpoints (`x-project-token`). **Direct Supabase service-role access is strictly prohibited.**

---

## 3. Configuration & Credential Provisioning
Secrets and boundaries are strictly configured via environment variables at process startup:
- `WHATHAPPEN_API_URL`: Base URL (default: `http://127.0.0.1:3000`).
  - **Strict Hostname & Protocol Validation:**
    - Parsed strictly via Node.js `new URL(apiUrl)`.
    - Hostname must strictly equal `localhost` or `127.0.0.1` (no remote IPs, no wildcards, no external DNS).
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.
  - **Pre-flight Validation:** Must be non-empty string, minimum 12 characters. Loaded into `Buffer` and explicitly wiped with `buf.fill(0)` after HMAC and PBKDF2 derivations.
- `WHATHAPPEN_INGEST_ALLOWLIST`: **Mandatory**. Comma-separated list of absolute directory paths allowed for file ingestion. Fails closed (tool disabled) if empty or unset.

---

## 4. Cryptographic Handshake & Key Management Ground-Truth
- **HMAC Proof Generation:**
  - Key: `sha256Hex(passphrase)` (exact hex digest matching `lib/session-store.ts`).
  - Signed Message: Challenge nonce string returned by `GET /api/auth/challenge?projectId=<id>`.
  - Signature: `crypto.createHmac('sha256', keyHex).update(nonce).digest('hex')`.
- **Key Derivation (PBKDF2):**
  - Algorithm: PBKDF2 with SHA-256 (100,000 iterations).
  - Derived Key: AES-GCM 256-bit `CryptoKey` (marked non-extractable).
- **In-Memory Session Store & Auto-Refresh:**
  - `sessions`: Map<projectId, { token: string, key: CryptoKey, expiresAt: number }>
  - **Locking & Rate Limiting:** Single in-flight unlock promise per `projectId` with exponential backoff on auth failure (max 3 retries before 5-minute cool-down).
  - **Background Auto-Refresh:** Sessions refresh token transparently at 90% of TTL (1h 48m) using the cached key derivation without interrupting active agent queries.
  - **Secure Eviction:** On TTL expiry or manual lock, references are deleted from Map, Buffers are filled with zeros, and references are detached to facilitate GC.

---

## 5. MCP Tools Specification

### 5.1 `whathappen_list_projects`
- **Description:** List accessible WhatsApp chat projects with metadata (ID, name, message count, timestamps).
- **Parameters:** None.
- **Implementation:** Calls `GET /api/projects`.

### 5.2 `whathappen_unlock_project`
- **Description:** Explicitly authenticate and unlock a project session using the environment passphrase. Must be called prior to message inspection tools.
- **Parameters:**
  - `projectId` (string, required): RFC 4122 compliant UUID v4 string (validated strictly via `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).
- **Implementation:**
  1. Validates UUID v4 format.
  2. Acquires per-project concurrency lock with backoff.
  3. Calls `GET /api/auth/challenge?projectId=<id>`.
  4. Computes `proof = HMAC-SHA256(sha256Hex(passphrase), challenge.nonce)`.
  5. Calls `POST /api/project-token` with `{ projectId, challenge: nonce, proof }`.
  6. Derives non-extractable AES-GCM key in RAM.
  7. Stores token + key in session cache with matching 2-hour TTL.

### 5.3 `whathappen_search_messages`
- **Description:** Search through decrypted chat transcripts.
- **Parameters:**
  - `projectId` (string, required): Project UUID v4.
  - `query` (string, required): Text search term or pattern.
  - `limit` (number, optional, default: 50, max: 200).
  - `sender` (string, optional): Filter by sender name/number.
  - `startDate` (string, optional): ISO-8601 start date.
  - `endDate` (string, optional): ISO-8601 end date.
- **Fail-Fast Invariant:** Throws explicit `PROJECT_LOCKED` error if `projectId` is not unlocked.
- **Implementation:**
  1. Validates UUID v4 and session cache presence.
  2. Calls `POST /api/ai-chat/query` with token to fetch ciphertext records.
  3. Decrypts messages in RAM using cached derived key.
  4. Limits by message count first.
  5. Formats output into a structured JSON envelope: `{ results: Message[], totalCount: number, truncated: boolean, omittedCount: number }`. Stops appending complete message objects before exceeding 100,000 UTF-8 characters (ensures zero syntax corruption or mid-string splits).

### 5.4 `whathappen_get_chronology`
- **Description:** Inspect chronological message history around a specific date/anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID v4.
  - `anchorTimestamp` (string, optional): ISO-8601 anchor.
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
- **Atomic Authorization & Path Validation (TOCTOU Defense):**
  - Project must be unlocked (`x-project-token` required in upload header).
  - Fails closed if `WHATHAPPEN_INGEST_ALLOWLIST` is unset.
  - Opens file handle atomically: `const fd = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0))`.
  - Canonical path resolution on open handle: `const realPath = fs.realpathSync(filePath)`.
  - Boundary check: `realPath` must start with one of the configured allowlist directories.
  - Extension check: Must strictly end with `.zip`.
  - Size check on descriptor: `fs.fstatSync(fd).size <= 100 * 1024 * 1024` (100MB).
- **Implementation:** Streams validated ZIP file descriptor to `POST /api/process-file` on `:3000` with `x-project-token` header.

---

## 6. Resilience, Retries & Security Guardrails
1. **HTTP Resilience:** All API calls use exponential backoff (3 attempts with jitter) on 429/503 errors.
2. **Zero Secret Leakage:** No credentials in MCP tool schemas or tool call histories.
3. **Fail-Closed Gate:** If `WHATHAPPEN_PASSPHRASE` is missing or invalid, unlock throws `UNAUTHORIZED` and halts.
4. **No Direct Database Bypass:** Zero Supabase client dependencies or service keys in the MCP codebase.
5. **Strict Loopback Binding:** Only connects to local loopback interface.

</plan>
