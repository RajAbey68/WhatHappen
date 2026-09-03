# WhatHappen MCP Server Architecture & Implementation Plan (v1.0)

## 1. Goal & Context
Build an official Model Context Protocol (MCP) server for the **WhatHappen** platform to enable AI agent runtimes (Hermes, Claude Desktop, Cursor) to securely inspect, search, and analyze WhatsApp transcripts and project metadata.

### Infrastructure & Security Ground-Truth
- **WhatHappen Server:** Runs on Hermes-Dev (`167.233.236.178:3000`), local dev instance on `http://localhost:3000`.
- **Database:** Supabase Postgres (`pomgvxdokjmxyfbgazls`).
- **Zero-Knowledge Invariant:** Chat transcripts are stored encrypted at rest (AES-GCM-256). Decryption requires a user passphrase.
- **Project Token Boundary:** The MCP server never stores or transmits raw passphrases. It acquires short-lived `x-project-token` access tokens via the challenge-response protocol (`GET /api/auth/challenge` -> HMAC-SHA256 proof -> `POST /api/project-token`).

---

## 2. Server Architecture & Deployment Modes
The MCP server is built using the official `@modelcontextprotocol/sdk` (TypeScript/Node.js).

### Distribution Modes
1. **Local Stdio (Desktop Agent Mode):**
   - Packaged inside the WhatHappen repo under `mcp/` or as a standalone CLI tool `whathappen-mcp`.
   - Runs locally via `node dist/index.js` or `npx whathappen-mcp`.
   - Connects to the WhatHappen API endpoint (`http://localhost:3000` or `http://167.233.236.178:3000`).
2. **Remote SSE / Streamable HTTP (Cloud Mode):**
   - Hosted as a dedicated service behind Nginx / Cloud Run with Bearer/Token auth.

---

## 3. Configuration & Authentication
The MCP server accepts configuration via environment variables:
- `WHATHAPPEN_API_URL`: Base URL (default: `http://localhost:3000`).
- `WHATSAPP_PASSPHRASE_HASH`: Hex SHA256 of the project passphrase (for non-interactive server-side challenge solving, optional).
- `WHATHAPPEN_PROJECT_TOKEN`: Pre-issued short-lived token (optional fallback).
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`: Optional direct database fallback when bypassing the HTTP REST API.

---

## 4. MCP Tools Specification

### 4.1 `whathappen_list_projects`
- **Description:** List all available WhatsApp chat projects with metadata (ID, name, message count, created/updated timestamps).
- **Parameters:** None.
- **Implementation:** Calls `GET /api/projects`.

### 4.2 `whathappen_authenticate_project`
- **Description:** Establish an active session token for a target project using the zero-knowledge challenge-response handshake or passphrase hash proof.
- **Parameters:**
  - `projectId` (string, required): Target project UUID.
  - `passphrase` (string, optional): Plaintext passphrase (ephemeral, immediately discarded after proof generation) OR
  - `passphraseHash` (string, optional): Precomputed SHA-256 hex string.
- **Implementation:**
  1. Calls `GET /api/auth/challenge?projectId=<id>`.
  2. Computes `HMAC-SHA256(key=sha256(passphrase), message=nonce)`.
  3. Calls `POST /api/project-token` with `{ projectId, challenge, proof }`.
  4. Stores returned token in memory with expiry TTL.

### 4.3 `whathappen_search_messages`
- **Description:** Search through encrypted chat messages for a specific project.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `query` (string, required): Search terms or regex pattern.
  - `limit` (number, optional, default: 50, max: 200).
  - `sender` (string, optional): Filter by sender phone/name.
  - `startDate` (string, optional): ISO-8601 start date.
  - `endDate` (string, optional): ISO-8601 end date.
- **Implementation:**
  1. Authorizes via cached `x-project-token`.
  2. Calls `POST /api/ai-chat/query` or queries Supabase messages.
  3. Decrypts messages client-side in RAM using the derived AES-GCM key if ciphertext is returned.

### 4.4 `whathappen_get_chronology`
- **Description:** Retrieve an ordered stream of messages around a specific time anchor or message ID to inspect conversational context.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `anchorTimestamp` (string, optional): ISO-8601 timestamp.
  - `windowSize` (number, optional, default: 20): Number of messages before and after.

### 4.5 `whathappen_extract_financials`
- **Description:** Run the Forensic Ledger Agent extraction across project messages to identify payments, bank receipts, debt obligations, and currencies.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
- **Implementation:** Calls `POST /api/analyze-project` with `analysisType: 'financial'` and project token.

### 4.6 `whathappen_trigger_ingest`
- **Description:** Queue a new WhatsApp export `.zip` or `.txt` for background parsing and batch encryption.
- **Parameters:**
  - `projectId` (string, required): Project UUID.
  - `filePath` (string, required): Absolute file path to the export archive on host.
- **Implementation:** Posts file stream to `http://167.233.236.178:8081` or initiates presigned upload.

---

## 5. Security & Boundary Guardrails
1. **Passphrase Isolation:** Passphrases are strictly held in-memory and zeroed after key derivation. No disk/log persistence.
2. **Fail-Closed Auth:** If challenge fails or token expires, the server throws an explicit `UNAUTHORIZED` MCP error rather than returning unencrypted stubs.
3. **Payload Clamping:** Message searches and chronologies clamp responses to prevent flooding LLM context windows (max 100K chars / 200 messages per call).
4. **Token Hygiene:** Stored tokens expire after 2 hours matching `PROJECT_TOKEN_TTL_MS`.
