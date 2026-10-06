## ROUND FINDINGS

### [P0] Session cache key collision vulnerability
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: Session cache is keyed by `projectId.toLowerCase()` but the API may treat project IDs case-sensitively. If the server mints tokens for `UUID-ABC` and `uuid-abc` as distinct projects, the client collapses them into one cache slot, causing cross-project session pollution and potential decryption key misuse.
- Required fix: Use exact case-sensitive projectId as cache key, or validate server-side case sensitivity and reject mismatches.

### [P0] Missing server certificate validation for SSH tunnel dev mode
- Section: 1. Infrastructure & Security Ground-Truth / 3. Configuration
- Problem: The plan permits `WHATHAPPEN_API_URL` pointing to `167.233.236.178:3000` via SSH forwarding for dev, but provides no mechanism to pin or validate the server's identity. A local attacker or DNS/ARP poisoner could intercept the forwarded port and harvest the HMAC proof (which authenticates to the real server), enabling replay attacks against production.
- Required fix: Require TLS with certificate pinning for any non-loopback target, or explicitly document that dev mode tunnels must use Unix domain sockets or SSH host key verification with `StrictHostKeyChecking=yes`.

### [P1] Rate limit state is process-local and non-durable
- Section: 4. Verified Endpoint Protocol / 5.2 whathappen_unlock_project
- Problem: "Strict in-memory throttle on unlock attempts" and "client-side rate limit (min 3s interval)" are both process-local. Multiple MCP client instances (separate Node processes, or Claude + Cursor + Hermes simultaneously) bypass each other's rate limits, allowing 3x+ the intended attempt rate against the server's challenge endpoint.
- Required fix: Document that rate limiting is best-effort per-process only, or implement a file-based or OS-level semaphore for cross-process coordination.

### [P1] `expiresAt` timestamp trust assumption
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: The plan stores `expiresAt` from server response without validation and uses it for TTL calculations. A malicious or compromised server could send `expiresAt: 9999999999999`, causing sessions to persist indefinitely in RAM despite passphrase changes or intended revocation.
- Required fix: Clamp `expiresAt` to a maximum client-enforced duration (e.g., 24 hours) regardless of server claim, or require refresh at fixed intervals.

### [P1] Background refresh queue lacks failure handling specification
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: "If refresh fails, session is invalidated and purged" is stated but no mechanism is specified for distinguishing transient network errors from authentication failures. A brief network blip could evict a valid session, causing data loss for in-progress analysis.
- Required fix: Define retry policy for refresh failures (e.g., 3 attempts with backoff) before eviction, and distinguish 401/403 (immediate eviction) from 5xx/timeout (retry).

### [P2] No specification for `buf.fill(0)` failure on optimized buffers
- Section: 4. Verified Endpoint Protocol / Key Derivation
- Problem: `Buffer.fill(0)` and `buf.fill(0)` may be optimized away by V8 for TypedArrays/Buffers not subsequently read. The plan asserts zeroing occurs but doesn't specify use of `crypto.secureZero` or explicit subsequent read to prevent optimization.
- Required fix: Document that zeroing must use a secure wipe pattern or explicit read-after-write to guarantee memory clearing.

### [P2] Truncation byte counting ambiguity
- Section: 5.4 whathappen_search_messages
- Problem: "cumulative byte length exceeds 100,000 UTF-8 bytes" is specified, but JavaScript strings are UTF-16 internally. `Buffer.byteLength(string, 'utf8')` must be used; naive `.length` checks are wrong. The plan doesn't specify which measurement is used.
- Required fix: Explicitly require `Buffer.byteLength(result, 'utf8')` for truncation decisions.

### [P2] Missing input validation on `query` parameter
- Section: 5.4 whathappen_search_messages
- Problem: The `query` parameter accepts "Text search term or pattern" with no length limit or sanitization specified. Extremely long queries (MB+) could cause memory pressure or be forwarded to backend search systems.
- Required fix: Add maximum length validation (e.g., 1000 characters) and reject control characters.

### [P3] `WHATHAPPEN_PASSPHRASE` rotation requires manual tool call
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: Passphrase change detection evicts stale sessions, but the agent must explicitly re-call `whathappen_unlock_project`. No automatic retry or notification mechanism is specified.
- Required fix: Document expected agent behavior on `SESSION_EXPIRED` due to passphrase rotation.

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=1