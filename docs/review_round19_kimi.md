## ROUND FINDINGS

### [P0] Session Cache Key Collision Vulnerability
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: The session store keys by `projectId.toLowerCase()` but the plan does not specify validation that `projectId` is actually a valid UUID before normalization. Malformed inputs could collide or bypass intended isolation. More critically, the `saltMap: Map<string, CryptoKey>` uses raw salt strings as keys without hashing—if two projects share salt values (possible in some RNG failure scenarios or intentional collision), keys leak across project boundaries.
- Required fix: Hash the salt before Map keying, or prefix with projectId; add strict UUID validation before any store operation.

### [P0] AbortController Stream Abort Does Not Guarantee Memory Wipe
- Section: 5.5 whathappen_search_messages
- Problem: The plan states "aborts stream if incoming bytes exceed 50MB" using `AbortController`, but aborted streams leave partially-decrypted plaintext in Node.js buffer pools that may not be zeroed. Combined with the 100,000 byte truncation limit, this creates a window where sensitive data exceeds the declared boundary and persists in memory.
- Required fix: Explicitly zero all decryption buffers in `finally` blocks; do not rely on AbortController alone for memory hygiene.

### [P1] Missing HMAC Key Zeroing in Session Store Schema
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: The schema includes `passphraseHash: string` stored in session cache, but the plan only specifies zeroing `keyHex` and passphrase buffers in the unlock handshake. The `passphraseHash` (SHA-256 of passphrase) persists for the session lifetime and is functionally equivalent to a key—if session memory is dumped, this enables offline brute force.
- Required fix: Do not store `passphraseHash` in session; re-derive or use a non-reversible token binding instead.

### [P1] Rate Limit State Not Specified
- Section: 5.3 whathappen_unlock_project and 5.5 whathappen_search_messages
- Problem: "Client-side rate limit" and "per-project rate limit throttle" are declared but no storage mechanism is specified. In stdio mode with process restart per invocation (common in MCP), these limits reset. If persistent, the plan doesn't specify where state lives.
- Required fix: Clarify rate limit state is in-memory only (accepting reset on restart) or implement file-based rate limit with appropriate fs permissions.

### [P1] Token Verification Race Condition
- Section: 5.3 whathappen_unlock_project
- Problem: Step 6 "Mandatory Post-Token Verification" calls `GET /api/projects` to confirm token validity, but this endpoint lists all projects—if the token is scoped to a specific projectId, this verification may pass while the specific project token is invalid. The verification endpoint doesn't match the token's intended scope.
- Required fix: Verify against project-specific endpoint like `GET /api/projects/{projectId}` or validate the returned token actually authorizes the requested projectId.

### [P2] Salt Cache Unbounded Growth
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: "Per-Project Key Cache" caches derived keys per unique salt with no eviction bound. A malicious or buggy server could return unique salts per message, exhausting RAM with `CryptoKey` objects despite the 20-session project limit.
- Required fix: Bound the saltMap size per project (e.g., LRU with 100 entries) or use WeakMap with proper cleanup.

### [P2] Date Validation Ambiguity
- Section: 5.5 whathappen_search_messages and 5.7 whathappen_extract_financials
- Problem: "ISO-8601 UTC date string formatted as `YYYY-MM-DDTHH:mm:ss.sssZ` (or normalized to UTC)" is ambiguous—does normalization accept non-UTC inputs? The parenthetical contradicts the strict format claim. Timezone handling errors could cause data leakage across date boundaries.
- Required fix: Strictly reject non-Z suffixed inputs; do not normalize, require exact format.

### [P2] Missing Tool Description Security Warning
- Section: 5. MCP Tools Specification
- Problem: Tool descriptions will be visible to the LLM and potentially logged in MCP client histories. Descriptions like "Search through decrypted chat transcripts" and "Extract structured financial transactions" expose sensitive operation semantics to any party with log access.
- Required fix: Sanitize descriptions to generic terms like "Search project data" without revealing decryption or financial extraction capabilities.

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=0