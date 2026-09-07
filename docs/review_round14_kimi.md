## ROUND FINDINGS

### [P0] Missing API authentication for project listing
- Section: 5.1 `whathappen_list_projects`
- Problem: The endpoint `GET /api/projects` is described as requiring no parameters, yet the WhatHappen server ground-truth requires `x-project-token` header for all data operations per Section 2. An unauthenticated project listing endpoint would leak project existence/metadata to any local process, violating zero-knowledge principles.
- Required fix: Clarify that `whathappen_list_projects` requires a master/admin token or document the explicit unauthenticated endpoint behavior with justification, or remove if not supported by server ground-truth.

### [P0] Session status tool bypasses rate limiting invariant
- Section: 5.2 `whathappen_get_session_status`
- Problem: The tool returns `unlocked: boolean` without requiring authentication, enabling an unthrottled oracle for project existence and lock state. Combined with the deterministic HMAC proof construction, this creates a timing side-channel for passphrase validation (fast rejection vs. challenge fetch).
- Required fix: Require the same rate-limiting gate on status checks as unlock attempts, or merge status into `unlock_project` response to eliminate the oracle.

### [P1] `whathappen_search_messages` streams unbounded ciphertext
- Section: 5.4 Implementation step 2
- Problem: The 50MB abort threshold is checked only after response stream exceeds limit, allowing temporary memory exhaustion and DoS via malicious server response. The `limit` parameter (max 200) applies post-decryption, not to the ciphertext fetch.
- Required fix: Apply `Range` headers or pre-negotiated byte limits on the API request, or stream-process with strict backpressure rather than buffering.

### [P1] `extract_financials` lacks scope boundaries
- Section: 5.6
- Problem: The tool fetches "entire project messages" without date range, sender filter, or result limits, unconditionally pulling all ciphertext for local parsing. This violates the principle of least data access and creates unbounded memory/network consumption.
- Required fix: Inherit the same `startDate`/`endDate`/`sender`/`limit` parameters from `search_messages`, or document explicit server-side filtering support.

### [P2] Missing session cache eviction on passphrase change
- Section: 4 In-Memory Session Store
- Problem: If `WHATHAPPEN_PASSPHRASE` environment variable changes between tool calls, stale cached sessions with derived keys from the old passphrase remain valid until TTL expiry, creating cross-passphrase data access.
- Required fix: Hash the passphrase and store in session cache; validate match on each tool invocation or clear cache on passphrase mismatch.

### [P2] No defense against derived key extraction via memory dump
- Section: 4 Key Derivation / 5.3 Implementation
- Problem: While `CryptoKey` is marked non-extractable, the Node.js process memory contains the decrypted messages and the `CryptoKey` object. No `mlock` equivalent or secure heap is mentioned for the derived key or decrypted plaintext buffers.
- Required fix: Document acknowledged threat model limitation or implement `Buffer.fill(0)` on decrypted message buffers after tool response serialization.

### [P2] UUID normalization inconsistency
- Section: 5.3 Implementation step 1 / 4 In-Memory Session Store
- Problem: UUID validation accepts mixed case but normalizes to lowercase for storage, yet the server ground-truth may return `projectId` in original case from challenge endpoint. Case-sensitive string comparison could cause cache misses or duplicate sessions.
- Required fix: Explicitly document server case-sensitivity contract or normalize server responses to lowercase before cache lookup.

### [P3] Missing tool for explicit session termination
- Section: 5.x Tools Specification
- Problem: No `whathappen_lock_project` or `whathappen_clear_session` tool exists for explicit key eviction. Users must wait for TTL expiry or kill the MCP server process.
- Required fix: Add optional `whathappen_lock_project` tool or document `SIGTERM` as recommended session termination.

## VERDICT
BLOCKED
P0=2 P1=2 P2=3 P3=1