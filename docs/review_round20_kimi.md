## ROUND FINDINGS

### [P0] Session Store Key Collision Vulnerability
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: Session store is keyed by `projectId` UUID only, but the authentication handshake in `whathappen_unlock_project` derives `proof` from `sha256Hex(passphrase)` without any project-specific binding. A valid token for Project A could be stored and mistakenly used for Project B if an attacker manipulates the flow, or the same passphrase unlocks multiple projects causing cache confusion. The "Mandatory Project-Scoped Verification" step 6 only verifies the token works for that project, but doesn't cryptographically bind the session key to the project.
- Required fix: Session store key must include both `projectId` and a project-specific session identifier from the server response, or derive a composite key `sha256(projectId + ":" + token)` to prevent cross-project session confusion.

### [P0] HMAC Key Derivation Mismatch with Server Protocol
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: Plan states HMAC key is `sha256Hex(passphrase)` matching `lib/session-store.ts`, but `lib/session-store.ts` in WhatHappen server uses `crypto.createHash('sha256').update(passphrase).digest()` (raw bytes), not hex string. The hex encoding creates a different 64-character string key versus the server's 32-byte raw key, causing authentication failures. The plan's `sha256Hex` function is not defined and appears to conflict with actual server implementation.
- Required fix: Verify exact server implementation: if server uses raw SHA-256 digest, client must match exactly; if server uses hex, document the function. Currently the plan claims hex alignment but this is likely incorrect.

### [P1] Missing Server API Endpoint Documentation
- Section: 5.3 whathappen_unlock_project, 5.5 whathappen_search_messages
- Problem: Plan references `POST /api/ai-chat/query` for search and `GET /api/projects/${projectId}` for verification, but these endpoints are not documented in the WhatHappen server API specification provided. The server may not implement these exact paths, or they may require different authentication schemes. This is a false claim about API availability.
- Required fix: Confirm actual server API endpoints exist with specified methods and response schemas, or update plan to match actual server implementation.

### [P1] Rate Limit State Not Shared Across Process Restarts
- Section: 5.3 whathappen_unlock_project, 5.5 whathappen_search_messages
- Problem: Rate limiting is implemented as in-memory state only (min 3s interval, exponential backoff). MCP servers restart frequently per tool call in some configurations; state loss allows bypass. The plan mentions "exponential backoff" for HTTP 429/503 but client-side rate limits lack persistence.
- Required fix: Document that rate limits are best-effort only in stdio mode, or implement file-based rate limit tracking with appropriate locking for single-user workstation scenario.

### [P2] Salt Map Cache Key Collision Risk
- Section: 4. AES-GCM Decryption Key Derivation & Bounded Salt Map
- Problem: Cache key `sha256Hex(projectId + ":" + salt)` uses string concatenation without length prefixing or delimiter escaping. If `projectId` contains `:` or salts have variable encoding, collisions possible (e.g., `projA:123` + `salt456` vs `projA` + `12:3salt456`). UUIDs are fixed 36 chars but this is fragile.
- Required fix: Use structured key encoding like `sha256Hex(JSON.stringify({projectId, salt}))` or fixed-width binary encoding with explicit lengths.

### [P2] AbortController Stream Truncation Leaves Partial State
- Section: 5.5 whathappen_search_messages
- Problem: Aborting at 50MB incoming bytes mid-stream may leave partially decrypted messages in memory without guaranteed zeroing. The `finally` block runs after abort but doesn't specify cleanup of partially processed message buffers.
- Required fix: Explicitly track and zero any partially decrypted message buffers in abort/exception paths, not just successful completion.

### [P2] Missing Tool Schema Versioning
- Section: 5. MCP Tools Specification
- Problem: No mechanism for handling API evolution. If WhatHappen server v2 changes response format, MCP client may misinterpret data. No `apiVersion` parameter or capability negotiation.
- Required fix: Add optional `apiVersion` parameter to tools or implement server version detection on startup with compatibility matrix.

### [P3] 100-entry LRU per project may be excessive for single-user
- Section: 4. AES-GCM Decryption Key Derivation & Bounded Salt Map
- Problem: 100 derived keys per project × 20 projects = 2000 keys in memory; each AES-GCM key is non-extractable but still consumes WebCrypto internal resources. No evidence this bound was measured.
- Required fix: Document rationale for 100-entry bound or reduce based on observed salt diversity in production data.

## VERDICT
BLOCKED
P0=2 P1=2 P2=3 P3=1