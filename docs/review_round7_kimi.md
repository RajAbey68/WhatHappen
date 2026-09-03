## ROUND FINDINGS

### [P0] Ingest path validation bypass via symlink race condition
- Section: 5.6 `whathappen_trigger_ingest` - Atomic Authorization & Strict Path Validation
- Problem: The plan uses `fs.realpathSync()` followed by `fs.openSync()` with `O_NOFOLLOW`, but these are separate, non-atomic operations. An attacker can win the race: realpath resolves to allowed path, then symlink is swapped to `/etc/shadow` before open. `O_NOFOLLOW` only prevents following symlinks at open time, not TOCTOU between realpath and open.
- Required fix: Use `openat()`-style semantics or open first with `O_NOFOLLOW|O_PATH`, then `fstat` and `frealpath` (or equivalent) on the file descriptor to verify it remains within bounds, never operating on path strings after open.

### [P0] Session cache lacks memory encryption / swap protection
- Section: 4. In-Memory Session Store & Auto-Refresh
- Problem: The `sessions` Map stores `CryptoKey` objects and tokens in Node.js heap with no protection against core dumps, swap, or memory pressure to disk. On most systems, swap is enabled. A derived AES-GCM key with `extractable: false` is still readable from RAM; if swapped, it's plaintext on disk. This violates the zero-knowledge invariant for "local client RAM only."
- Required fix: Pin session cache to locked memory (e.g., `mlock` equivalent via native addon) or document this as accepted risk with platform-specific mitigation (swapoff, encrypted swap). Without this, the security claim is materially false.

### [P1] `WHATHAPPEN_INGEST_ALLOWLIST` parsing ambiguity
- Section: 3. Configuration & Credential Provisioning
- Problem: "Comma-separated list of absolute directory paths" — no escaping rule defined for paths containing commas or literal commas in directory names. This creates parsing ambiguity and potential bypass if an allowlist entry like `/data/projects,finance` is misinterpreted.
- Required fix: Define strict format: either reject paths containing commas, use null-delimited or newline-delimited format, or document that paths must be JSON-string-escaped and parsed accordingly.

### [P1] Missing `endDate`/`startDate` validation in search
- Section: 5.3 `whathappen_search_messages`
- Problem: `startDate` and `endDate` are declared as ISO-8601 strings with no validation logic specified. Malformed dates or `endDate < startDate` will propagate to the API or cause client-side logic errors. No timezone handling is specified.
- Required fix: Add explicit ISO-8601 parsing with strict validation, reject inverted ranges, and document assumed timezone (UTC or local).

### [P1] `anchorTimestamp` optional but window undefined without it
- Section: 5.4 `whathappen_get_chronology`
- Problem: `anchorTimestamp` is marked optional with no default behavior specified. If omitted, the tool's behavior is undefined — does it use current time, project start, or fail?
- Required fix: Define default behavior (e.g., "most recent messages" or "project midpoint") or make parameter required.

### [P2] No rate limit on `whathappen_unlock_project`
- Section: 5.2 `whathappen_unlock_project`
- Problem: Only `whathappen_list_projects` has client-side rate limiting. `unlock_project` can be hammered to brute-force HMAC proofs or probe project IDs. The server has challenge TTL, but client-side backoff is absent.
- Required fix: Add client-side rate limiting (exponential backoff, max 3 attempts per 10 seconds) to prevent accidental or malicious rapid cycling.

### [P2] `limit` and `windowSize` bounds not enforced at API layer
- Section: 5.3 and 5.4
- Problem: Max values (200, 50) are declared as client-side constraints. Malicious or compromised client can ignore these. The plan does not state server-side enforcement.
- Required fix: Document that server API enforces identical bounds, or move bounds check to server response validation with hard clamp.

### [P2] Memory zeroing ineffective for `CryptoKey` objects
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: `derivedBuffer.fill(0)` zeros the Uint8Array, but `CryptoKey` objects are opaque handles to potentially copied key material in OpenSSL/BoringSSL internal structures. The plan implies this provides memory hygiene, but WebCrypto implementations may retain copies.
- Required fix: Remove claim that this provides complete memory hygiene, or add explicit documentation that this is best-effort and platform-dependent.

### [P3] `WHATHAPPEN_PASSPHRASE` minimum 12 characters is weak
- Section: 3. Configuration & Credential Provisioning
- Problem: 12-character minimum for a high-value decryption passphrase is below modern recommendations (16+ for sensitive data, given PBKDF2 with 100k iterations).
- Required fix: Increase to 16 characters minimum or document risk acceptance.

## VERDICT
BLOCKED
P0=2 P1=4 P2=3 P3=1