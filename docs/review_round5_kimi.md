## ROUND FINDINGS

### [P0] Incomplete TLS verification for remote host
- Section: 3. Configuration & Credential Provisioning / `WHATHAPPEN_API_URL` validation
- Problem: The plan allows `https:` for remote host `167.233.236.178` but specifies no certificate pinning, CA validation, or TLS fingerprint verification. An attacker controlling DNS or network path can MITM the connection and steal the `x-project-token` or inject malicious ciphertext.
- Required fix: Add explicit TLS certificate pinning or SPKI hash verification for the remote host, or remove remote host support entirely.

### [P0] TOCTOU race condition in path validation
- Section: 5.6 `whathappen_trigger_ingest` / Authorization & Security Validation
- Problem: `fs.realpathSync(filePath)` followed by boundary check is vulnerable to time-of-check-time-of-use race condition. Malicious actor can swap file between `realpathSync` and `fs.statSync` or stream operations, potentially escaping allowlist via symlink racing.
- Required fix: Use `fs.open()` with `O_NOFOLLOW` and `O_PATH` (Linux) or atomic open-and-verify pattern; validate path after obtaining file descriptor and before any subsequent operations.

### [P1] Missing passphrase entropy validation
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: No minimum passphrase length or entropy check is specified. Weak passphrases (e.g., "password") will produce predictable HMAC proofs and derived keys, defeating security despite the zero-knowledge architecture.
- Required fix: Add minimum 12-character passphrase requirement with entropy estimation (e.g., zxcvbn) or explicit rejection of common passwords.

### [P1] Unclear token refresh semantics
- Section: 5.2 `whathappen_unlock_project` / Implementation step 7
- Problem: Session cache has "2-hour TTL" but no mechanism is defined for token refresh before expiry. Long-running AI sessions will fail mid-operation with opaque errors.
- Required fix: Specify automatic background refresh at 90% of TTL or explicit re-authentication flow with clear error codes.

### [P1] Regex UUID validation is insufficient
- Section: 5.2 `whathappen_unlock_project` / Parameters
- Problem: The regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` allows non-standard UUID versions (e.g., all-numeric "00000000-0000-0000-0000-000000000000") and accepts uppercase hex which may cause cache key fragmentation if downstream APIs are case-sensitive.
- Required fix: Use RFC 4122 compliant validation requiring version bits and lowercase normalization, or delegate validation to API and handle 404.

### [P2] No memory hardening for passphrase buffer
- Section: 3. Configuration & Credential Provisioning / `WHATHAPPEN_PASSPHRASE`
- Problem: Passphrase is read into Node.js string (immutable, copied by GC) with no explicit zeroing. Process memory dumps or core dumps may retain passphrase indefinitely.
- Required fix: Use `Buffer` with explicit `fill(0)` after HMAC computation, or document acceptance of this limitation with process-level protections (mlock, no dump).

### [P2] Missing output sanitization for decrypted content
- Section: 5.3 `whathappen_search_messages` / Implementation step 5
- Problem: Truncation message `[Truncated at message boundary. X messages omitted.]` is injected into JSON output without escaping. If decrypted message content contains this exact string, client parsing may fail or be ambiguous.
- Required fix: Use structured JSON field for truncation metadata instead of inline string injection.

### [P2] No rate limit on project listing
- Section: 5.1 `whathappen_list_projects`
- Problem: Unauthenticated `whathappen_list_projects` calls `GET /api/projects` with no rate limiting specified, enabling enumeration attacks against the API.
- Required fix: Add per-IP or per-process rate limiting specification, or require unlock token for listing.

### [P3] Hardcoded remote IP address
- Section: 3. Configuration & Credential Provisioning / Allowed hostnames
- Problem: `167.233.236.178` is hardcoded as allowed remote host, creating operational fragility if server migrates and encouraging users to trust IP-based authentication.
- Required fix: Remove hardcoded IP or document as temporary with DNS migration plan.

## VERDICT
BLOCKED
P0=2 P1=4 P2=3 P3=1