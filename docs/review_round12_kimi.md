## ROUND FINDINGS

### [P0] Trial Decryption Gate Uses Wrong Endpoint
- Section: 4. Cryptographic Handshake / Key Derivation & AES-GCM Tag Verification
- Problem: The plan states trial decryption uses `POST /api/ai-chat/query?limit=1`, but this endpoint requires a valid project token that hasn't been issued yet at this stage. The unlock flow (step 5 in 5.2) derives the AES key AFTER receiving the token, making trial decryption circular—can't fetch ciphertext to verify without a token, but the token response doesn't include sample ciphertext.
- Required fix: Either add a `POST /api/project-token` response field containing encrypted sample data for trial decryption, or use a dedicated `/api/auth/verify-key` endpoint that returns challenge ciphertext without requiring full session token.

### [P0] Session Cache Key Collision Across API URLs
- Section: 4. In-Memory Session Store & Auto-Refresh
- Problem: Composite key `${apiUrl}:${projectId.toLowerCase()}` fails to isolate sessions when `apiUrl` contains varying representations of the same endpoint (e.g., `http://127.0.0.1:3000` vs `http://localhost:3000` vs `http://127.0.0.1:3000/`). All three pass startup validation but create distinct cache entries, allowing passphrase/derived key reuse across what the server treats as different origins.
- Required fix: Normalize `apiUrl` to canonical form (lowercase hostname, resolved IP for localhost, no trailing slash, explicit port) before constructing the composite key.

### [P1] Missing Tool for Session Status/Health Check
- Section: 5. MCP Tools Specification
- Problem: No `whathappen_get_session_status` or similar tool exists. Agents cannot determine if a session is valid before expensive operations, nor can they distinguish between `PROJECT_LOCKED` (never unlocked) and `SESSION_EXPIRED` (was valid, now stale) without attempting a failing operation. This forces speculative unlock calls and complicates agent retry logic.
- Required fix: Add `whathappen_get_session_status` tool returning `{ locked: boolean, expiresAt?: number, projectId: string }` or document that `whathappen_list_projects` implicitly validates connectivity and auth health.

### [P1] Rate Limiting Ambiguity Across Tools
- Section: 5.1, 5.2, 6.1
- Problem: `whathappen_list_projects` has "max 1 call per 5 seconds" client-side throttle, but `whathappen_unlock_project` has "exponential backoff" without specified limits, and section 6.1 mentions global "10 req/s" token bucket. These three rate limiting layers overlap unpredictably—unlock's backoff could starve other tools, and the global limiter scope (per-project? per-apiUrl? global process?) is undefined.
- Required fix: Unify rate limiting specification: define scopes (composite key? global?), precedence rules between tool-specific and global limits, and whether unlock's backoff counts against the 10 req/s bucket.

### [P2] Memory Hygiene Incomplete for CryptoKey
- Section: 4. Key Derivation & AES-GCM Tag Verification
- Problem: The plan specifies zeroing `derivedBuffer` after `importKey`, but the resulting `CryptoKey` object in WebCrypto cannot be explicitly destroyed—it's subject to GC. More critically, the `keyHex` buffer (SHA256 of passphrase) used for HMAC proof generation is mentioned as "zeroed" but no explicit timing is given; if retained for the `POST /api/project-token` call, it persists through network I/O.
- Required fix: Explicitly state `keyHex` buffer is zeroed immediately after HMAC computation, before the network request to `/api/project-token`.

### [P2] Truncation Logic Vulnerable to UTF-8 Multi-Byte Split
- Section: 5.3 whathappen_search_messages
- Problem: "Cumulative plaintext exceeds 100,000 UTF-8 characters" truncation stops "before cumulative plaintext exceeds 100,000 UTF-8 characters" but doesn't specify byte vs. codepoint counting. Cutting at character 100,000 mid-multi-byte sequence produces invalid UTF-8, potentially crashing downstream JSON serialization or truncating within a grapheme cluster producing misleading output.
- Required fix: Specify byte-length checking on UTF-8 encoded output, with truncation to last valid codepoint boundary using `TextEncoder`/`TextDecoder` stream handling.

### [P3] SSH Port Forward Mentioned Without Security Context
- Section: 1. Infrastructure & Security Ground-Truth
- Problem: The SSH tunnel example `ssh -L 3000:localhost:3000 root@167.233.236.178` uses `root` login and hardcoded IP, which is advisory context but could be misread as recommended practice.
- Required fix: Add parenthetical note that this is illustrative and production SSH tunnels should use unprivileged users and key-based auth.

## VERDICT
BLOCKED
P0=2 P1=2 P2=2 P3=1