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
# WhatHappen MCP Server Architecture & Implementation Plan (v3.0)

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
- `WHATHAPPEN_API_URL`: Base URL (default: `http://localhost:3000` or `http://167.233.236.178:3000`). Validated against an allowed origin list (localhost, 127.0.0.1, or `http://167.233.236.178:3000`).
- `WHATHAPPEN_PASSPHRASE`: Project decryption passphrase, injected into local process RAM only.
- `WHATHAPPEN_PASSPHRASE_HASH`: Hex SHA256 pre-computed verifier (`printf '%s' "$PASSPHRASE" | shasum -a 256`), matching server's `WHATSAPP_PASSPHRASE_HASH`.
- `WHATHAPPEN_INGEST_ALLOWLIST`: Directory allowlist for file ingest (default: `~/Downloads/`, `~/code/WhatHappen/`).

---

## 4. Key Derivation, Decryption & Session Cache
The MCP server mirrors the exact isomorphic cryptographic primitives from `lib/crypto.ts`:
- **In-Memory Session Store:**
  - `tokens`: Map<projectId, { token: string, expiresAt: number }>
  - `derivedKeys`: Map<projectId, CryptoKey> (derived once per session upon unlock/first access).
- **Auto-Authentication & Token Refresh:**
  - Any tool requiring project access (`search_messages`, `get_chronology`, `extract_financials`) automatically ensures a valid token exists. If expired or missing, it invokes the challenge-response flow automatically using `WHATHAPPEN_PASSPHRASE` / `WHATHAPPEN_PASSPHRASE_HASH` without failing the user.
- **Key Derivation (PBKDF2):**
  - Algorithm: PBKDF2 with SHA-256 (100,000 iterations).
  - Derived Key: AES-GCM 256-bit `CryptoKey`.
- **Decryption:**
  - AES-GCM with 12-byte IV and 16-byte authentication tag.
  - Plaintext resides in memory only during formatting and is never logged.

---

## 5. MCP Tools Specification

### 5.1 `whathappen_list_projects`
- **Description:** List accessible WhatsApp chat projects with metadata (ID, name, message count, timestamps).
- **Parameters:** None.
- **Implementation:** Calls `GET /api/projects`.

### 5.2 `whathappen_unlock_project`
- **Description:** Explicitly verify credentials and pre-warm session token + decryption key for a project.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Security Check:** Reads `WHATHAPPEN_PASSPHRASE` or `WHATHAPPEN_PASSPHRASE_HASH` from process environment. Never takes secrets as tool arguments.
- **Implementation:**
  1. Calls `GET /api/auth/challenge?projectId=<id>` to get challenge nonce.
  2. Computes HMAC-SHA256 proof locally in RAM.
  3. Calls `POST /api/project-token` with `{ projectId, challenge, proof }`.
  4. Caches token in RAM with 2-hour TTL.
  5. Derives and caches AES-GCM key in RAM for subsequent queries.

### 5.3 `whathappen_search_messages`
- **Description:** Search through decrypted chat transcripts.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `query` (string, required): Text search term or pattern.
  - `limit` (number, optional, default: 50, max: 200).
  - `sender` (string, optional): Filter by sender name/number.
  - `startDate` (string, optional): ISO-8601 start date.
  - `endDate` (string, optional): ISO-8601 end date.
- **Implementation:**
  1. Automatically ensures project is unlocked (auto-authenticates if not yet unlocked).
  2. Calls `POST /api/ai-chat/query` with token to fetch ciphertext records.
  3. Decrypts messages in local RAM using cached derived key.
  4. Applies count limit, then applies character clamp (max 100K chars) with explicit truncation banner if exceeded.

### 5.4 `whathappen_get_chronology`
- **Description:** Inspect chronological message history around a specific date/anchor.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `anchorTimestamp` (string, optional): ISO-8601 anchor.
  - `windowSize` (number, optional, default: 20, max: 50).
- **Implementation:**
  1. Auto-ensures project token & derived key via Session Store.
  2. Fetches surrounding ciphertext window from API.
  3. Decrypts in local RAM using cached key and returns ordered context.

### 5.5 `whathappen_extract_financials`
- **Description:** Extract structured financial transactions, bank receipts, and debt obligations from chat history.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Implementation (Client-Side Zero-Knowledge):**
  1. Auto-ensures project token and derived key.
  2. Fetches encrypted project messages via `POST /api/ai-chat/query`.
  3. Decrypts messages entirely in local client RAM.
  4. Runs deterministic regex and ledger parsers locally on the decrypted text (detecting amounts, currencies, IBANs, receipts).
  5. Formats structured JSON financial ledger without ever sending plaintext to external APIs.

### 5.6 `whathappen_trigger_ingest`
- **Description:** Ingest a local WhatsApp `.zip` export file into the processing pipeline.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `filePath` (string, required): Absolute file path to the export archive on local disk.
- **Security & Path Validation:**
  - Path canonicalization: `fs.realpathSync(filePath)` to defeat symlink bypass.
  - Directory boundary: Verified against `WHATHAPPEN_INGEST_ALLOWLIST`.
  - Extension check: Must strictly end with `.zip`.
  - Pre-flight size check: `fs.statSync(filePath).size` must be `<= 100MB`.
- **Implementation:** Streams validated ZIP to `POST /api/process-file` on `:3000`.

---

## 6. Resilience, Retries & Security Guardrails
1. **HTTP Resilience:** All API calls use exponential backoff (3 attempts with jitter) on 429/503 errors.
2. **Transparent Re-Auth:** If an API call receives a 401 token expiry error, the client transparently re-executes the challenge-response flow and retries the request once before throwing.
3. **Zero Secret Leakage:** No credentials in MCP tool schemas or tool call histories.
4. **Fail-Closed Gate:** If `WHATHAPPEN_PASSPHRASE` is missing or invalid, all decryption tools throw `UNAUTHORIZED` and halt.
5. **No Direct Database Bypass:** Zero Supabase client dependencies or service keys in the MCP codebase.
6. **Local Isolation:** Stdio-only execution bound to localhost.

</plan>
