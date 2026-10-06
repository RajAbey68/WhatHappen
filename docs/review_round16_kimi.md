## ROUND FINDINGS

### [P0] Session Cache Key Canonicalization Bug
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: The plan states session keys use "exact canonical string `projectId` (case-preserved matching server UUID representation)" but tool parameters accept arbitrary UUID strings. If a user calls `unlock_project` with lowercase `a1b2c3d4...` then `search_messages` with uppercase `A1B2C3D4...`, the session lookup will fail due to case-sensitive Map key mismatch, causing `PROJECT_LOCKED` error despite valid session. RFC 4122 UUIDs are case-insensitive by specification.
- Required fix: Normalize all `projectId` inputs to lowercase (or uppercase) before any session store operation or API call.

### [P0] Missing Server-Side Token Validation on Unlock
- Section: 5.2 `whathappen_unlock_project`
- Problem: Step 7 stores token in cache but never validates the token actually works before claiming "unlocked" status. If the server mints a malformed token or the handshake has a logic error, the client falsely reports success. Subsequent operations fail with cryptic errors instead of immediate detection.
- Required fix: Add mandatory validation step: make authenticated test call (e.g., `GET /api/projects` with new token) before returning "unlocked" status.

### [P1] Date Range Validation Ordering Gap
- Section: 5.4 `whathappen_search_messages` and 5.6 `whathappen_extract_financials`
- Problem: Plan validates `endDate >= startDate` but does not specify timezone handling. ISO-8601 strings without timezone offsets (e.g., `2024-01-01`) are interpreted differently by JavaScript (`local time`) vs the server (likely UTC). A valid local-time date range may invert when server-parsed, or vice versa.
- Required fix: Explicitly require timezone-aware ISO-8601 strings (with `Z` or offset) in parameter validation, or document that both client and server must normalize to UTC before comparison.

### [P1] Unbounded Session Map Growth
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: No maximum session count limit is defined. A malicious or buggy agent could call `unlock_project` on thousands of unique project IDs (or randomized UUIDs), filling RAM with derived keys and tokens. Background refresh keeps expired entries alive via retry loops.
- Required fix: Add hard limit (e.g., 10 concurrent sessions) with LRU eviction; reject new unlocks with `SESSION_POOL_FULL` error.

### [P1] `WHATHAPPEN_API_URL` Validation Incomplete
- Section: 3. Configuration & Canonicalization Ground-Truth
- Problem: The plan accepts `http://localhost:3000` but `localhost` can resolve to non-loopback addresses via `/etc/hosts` manipulation or DNS rebinding. This violates the strict loopback security invariant.
- Required fix: Reject `localhost`; require exact `http://127.0.0.1:3000` after DNS resolution, or verify socket peer address is `127.0.0.1` post-connection.

### [P2] `anchorTimestamp` Validation Ambiguity
- Section: 5.5 `whathappen_get_chronology`
- Problem: "Validates ISO-8601 timestamp" is underspecified. Does this reject timestamps outside project date range? Does it handle sub-millisecond precision? Malformed timestamps could cause server errors or unexpected windows.
- Required fix: Define validation rules: must be valid ISO-8601, must parse to finite Date, precision truncated to milliseconds, and optional bounds check against project metadata.

### [P2] Missing Ciphertext Integrity Verification
- Section: 4. Cryptographic Handshake and tool implementations
- Problem: AES-GCM decryption is mentioned but no explicit authentication tag verification failure handling is specified. Corrupted or tampered ciphertext from server (accidental or malicious) could trigger implementation-dependent behavior.
- Required fix: Specify that decryption must verify auth tag and throw explicit `DECRYPTION_FAILED` error on verification failure, with no plaintext exposure.

### [P2] No Tool Call Idempotency Key
- Section: 5.4, 5.5, 5.6 (search/query tools)
- Problem: Network retries on 5xx errors may cause duplicate API calls with same token. Server may implement deduplication or logging; client has no idempotency key to prevent duplicate side effects or confusing audit trails.
- Required fix: Add `idempotencyKey` parameter (UUID v4) to all mutating/search API calls, generated per tool invocation.

### [P3] `crypto.randomFillSync` for Buffer Zeroing Misleading
- Section: 4. Cryptographic Handshake
- Problem: `crypto.randomFillSync` overwrites with random data, not zeros. The plan says "securely wiped using `crypto.randomFillSync` and `buf.fill(0)`" which is contradictory. Random overwrite is actually safer, but the description is confused.
- Required fix: Remove `buf.fill(0)` from description; use `crypto.randomFillSync` alone or document explicit secure erase pattern.

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=1