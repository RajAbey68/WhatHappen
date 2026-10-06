## ROUND FINDINGS

### [P0] Trial Decryption Gate Implementation Gap
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth / Trial Decryption Gate
- Problem: The plan states the server verifies the key by test-decrypting the first message payload, but `POST /api/ai-chat/query?limit=1` returns ciphertext from the server. The MCP server must perform this decryption locally using the derived key—yet the plan doesn't specify how the MCP server obtains the *plaintext* to verify against. Without a known-good plaintext or MAC verification, trial decryption cannot distinguish valid key from corrupted data vs. wrong passphrase.
- Required fix: Specify that trial decryption uses authenticated decryption with AES-GCM tag verification, and define explicit failure mode when tag verification fails (not just generic decryption failure).

### [P0] Session Cache Key Collision Risk
- Section: 4. In-Memory Session Store & Auto-Refresh
- Problem: The `sessions` Map uses `projectId` as key, but the same WhatHappen server instance may host multiple users/projects with identical project IDs across different API URLs (e.g., user switches between `localhost:3000` and `localhost:3001`). This causes session cache poisoning or cross-contamination.
- Required fix: Change session key to composite `(apiUrl, projectId)` tuple or hash.

### [P1] UUID Validation Regex Incorrect
- Section: 5.2 whathappen_unlock_project / Parameters
- Problem: The regex `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$` incorrectly restricts the UUID variant nibble to `[89abAB]` which only covers RFC 4122 variant 1 (10xx). This rejects valid variant 2 (110x = `c`/`d`) UUIDs and is case-sensitive in the character class despite "case-insensitive" claim.
- Required fix: Use `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$` or proper RFC 4122 variant validation, and normalize to lowercase before regex test.

### [P1] Missing Response Size Limit Enforcement
- Section: 5.3 whathappen_search_messages / Implementation
- Problem: The plan mentions "clamped to max 50MB response stream" but doesn't specify where this clamping occurs. If the WhatHappen API returns >50MB before streaming headers complete, the MCP server may buffer entire response in memory before clamping, causing DoS via memory exhaustion.
- Required fix: Specify use of streaming response with `highWaterMark` or `pipeline` with size-limited transform, aborting on exceeding 50MB.

### [P1] Chronology Default Anchor Race Condition
- Section: 5.4 whathappen_get_chronology / Parameters
- Problem: `anchorTimestamp` defaults to `Date.now()` "if omitted"—but this is evaluated at tool call time, not at parameter parsing. If the AI agent omits the parameter, the MCP server generates `Date.now()` locally, which may drift from server time and return empty windows for recent messages. No timezone handling is specified.
- Required fix: Remove client-side default; require explicit ISO-8601 timestamp or use server-reported `now` from `/api/projects` metadata endpoint.

### [P2] Memory Zeroing Incompleteness
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth / Memory Hygiene
- Problem: `buf.fill(0)` on Node.js Buffer objects is not guaranteed to overwrite underlying memory due to Buffer pooling and potential copies. The plan doesn't address `Buffer.allocUnsafe` pool contamination or V8 string interning of the passphrase.
- Required fix: Use `crypto.createSecretKey` with explicit `keyObject.export()` control, or document acceptance of Node.js memory model limitations with process exit on sensitive failure.

### [P2] Missing Tool Result Size Limit
- Section: 5.3 whathappen_search_messages / Implementation (truncation)
- Problem: Truncation at "100,000 UTF-8 characters" occurs after full decryption and formatting. For 200 messages × 10KB each, this requires ~2GB RAM before truncation. No intermediate limit prevents memory pressure.
- Required fix: Apply streaming decryption with cumulative character counter, aborting decryption pipeline when limit approached.

### [P2] Rate Limit State Not Shared Across Tools
- Section: 5.1, 5.2 / Rate Limit
- Problem: Client-side rate limits are specified per-tool but no global rate limiter prevents `list_projects` + `unlock_project` burst from different tool calls. The "max 3 attempts per 10s" is only for unlock refresh, not query tools.
- Required fix: Add global rate limiter (token bucket) across all tools per API endpoint.

### [P3] HMAC Key Derivation Suboptimal
- Section: 4. HMAC Proof Generation
- Problem: `sha256(passphrase)` as HMAC key provides no domain separation from other SHA256 uses in system. While not exploitable given current threat model, lacks defense in depth.
- Required fix: Prefix with fixed domain separator: `sha256("WhatHappen-MCP-v1:" + passphrase)`.

---

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=1