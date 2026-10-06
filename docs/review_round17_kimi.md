## ROUND FINDINGS

### [P0] Memory Hygiene Implementation Gap
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: The plan specifies `crypto.randomFillSync(buf)` for secure buffer overwriting, but this is incorrect. `randomFillSync` fills a buffer with random bytes—it does not securely wipe sensitive data. Secure deletion requires explicit zeroing (`buf.fill(0)`), and even this is unreliable in JavaScript due to GC copying and optimization. The plan's "Memory Hygiene" claims are false.
- Required fix: Replace `crypto.randomFillSync` with `buf.fill(0)` and add explicit documentation that Node.js cannot guarantee secure memory wiping due to V8's garbage collector and potential heap snapshots.

### [P0] HMAC Key Derivation Weakness
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: The proof uses `HMAC-SHA256(key=sha256Hex(passphrase), message=challenge.nonce)`. Hex-encoding the SHA-256 of the passphrase reduces entropy to 4 bits per byte and creates a 64-character hex string used as HMAC key. This is unnecessary normalization that weakens the key material and deviates from standard practice (use raw bytes directly).
- Required fix: Use `HMAC-SHA256(key=rawSHA256Bytes(passphrase), message=challenge.nonce)` without hex encoding intermediate step.

### [P1] Session Cache Key Collision Risk
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: Normalizing `projectId.toLowerCase()` for cache keys assumes case-insensitive UUIDs, but RFC 4122 UUIDs are case-insensitive by specification. However, if the server treats them case-sensitively in some contexts, this creates a mismatch. More critically, the plan does not specify what happens if two different users on a multi-user system run this MCP server—sessions are not namespaced by user.
- Required fix: Document that the MCP server is single-user only, or add `process.uid` or similar to session cache keys.

### [P1] Missing Tool: No Project Status/Health Check
- Section: 5. MCP Tools Specification
- Problem: There is no `whathappen_project_status` or similar tool to check if a project is unlocked, session TTL remaining, or verify connectivity without attempting an operation. Users must call `unlock_project` (which re-authenticates) or `search_messages` (which may fail) to check state.
- Required fix: Add `whathappen_project_status` tool that returns `{ projectId, locked: boolean, expiresAt?: number, ttlRemainingSeconds?: number }` without network call if cached.

### [P2] Date Validation Ambiguity
- Section: 5.4 whathappen_search_messages, 5.6 whathappen_extract_financials
- Problem: "Strict ISO-8601 UTC date string" is specified but the validation logic is not defined. ISO-8601 permits many formats (e.g., `2026-01-01`, `2026-01-01T00:00`, `2026-01-01T00:00:00+00:00`). The examples show `Z` suffix but the validation requirements are unclear.
- Required fix: Specify exact accepted format: `YYYY-MM-DDTHH:mm:ss.sssZ` only, or document that any valid ISO-8601 UTC instant is accepted with normalization.

### [P2] Missing Abort Controller Cleanup
- Section: 5.4 whathappen_search_messages
- Problem: The 50MB stream abort is mentioned but no cleanup of the `AbortController` or stream resources is specified. Unhandled stream aborts can leak memory or leave HTTP connections in CLOSE_WAIT.
- Required fix: Add explicit `finally` block to destroy stream and signal on abort or completion.

### [P2] LRU Eviction Side Channel
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: Hard limit of 10 sessions with LRU eviction means an attacker with MCP access can probe which projects are "hot" by triggering evictions and measuring timing. This leaks usage patterns.
- Required fix: Document this as accepted trade-off for local-only deployment, or add random eviction instead of LRU.

### [P3] Passphrase Length Upper Bound
- Section: 3. Configuration & Canonicalization Ground-Truth
- Problem: 256-character passphrase maximum is arbitrary and may reject legitimate high-entropy passphrases (e.g., 5-word diceware with spaces: ~30 chars; but 12-word: ~70 chars; 256 is generous but why limit at all?).
- Required fix: Remove upper bound or justify with specific memory constraint.

## VERDICT
BLOCKED
P0=2 P1=2 P2=3 P3=1