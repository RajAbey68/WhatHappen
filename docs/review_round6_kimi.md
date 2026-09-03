## ROUND FINDINGS

### [P0] Ingest allowlist bypass via symlink race condition
- Section: 5.6 `whathappen_trigger_ingest` - Atomic Authorization & Path Validation
- Problem: The TOCTOU defense is insufficient. `fs.realpathSync` resolves symlinks, but the subsequent boundary check uses `startsWith` comparison against allowlist directories. A malicious symlink can point to `/allowed/path/../../../../etc/passwd` which `realpathSync` resolves to `/etc/passwd`, but if the allowlist contains `/allowed/path`, the `startsWith` check passes because the resolved path doesn't start with the allowlist prefix. Additionally, `O_NOFOLLOW` is conditionally applied with `|| 0` fallback, making symlink following behavior platform-dependent and unreliable.
- Required fix: Use `fs.openSync` with `O_NOFOLLOW` strictly (no fallback), and validate that the resolved canonical path is **within** the allowlist directory (not merely starting with it), using proper path traversal checks like `path.relative(allowlistDir, realPath).startsWith('..') === false`.

### [P0] Session cache key extraction vulnerability
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: The `CryptoKey` is marked non-extractable in WebCrypto terms, but Node.js `crypto.createHmac` and PBKDF2 operations use Node's legacy crypto API, not WebCrypto. The derived AES key is likely a `Buffer` or string before WebCrypto import, creating a window where key material exists as extractable raw bytes. The plan mentions "non-extractable `CryptoKey`" but doesn't specify WebCrypto `subtle.importKey` usage with `extractable: false`, and mixing Node crypto with WebCrypto creates implementation ambiguity.
- Required fix: Explicitly document the complete key flow: PBKDF2 output must be imported via `crypto.subtle.importKey('raw', derivedBuffer, 'AES-GCM', false, ['encrypt', 'decrypt'])` with `extractable: false`, and the raw buffer must be zeroed immediately after import.

### [P1] Missing API authentication for project listing
- Section: 5.1 `whathappen_list_projects`
- Problem: `GET /api/projects` is called without any authentication token, yet the plan states all data access routes through `x-project-token` authentication. Either the endpoint is unauthenticated (security hole) or the plan omits required authentication headers.
- Required fix: Clarify authentication mechanism for project listing—either document that this endpoint requires a separate auth token (user-level, not project-level) or implement `x-project-token` header if projects are scoped to authenticated users.

### [P1] Challenge-replay attack window
- Section: 5.2 `whathappen_unlock_project` implementation step 3-5
- Problem: The challenge nonce is fetched via `GET /api/auth/challenge` and used in a subsequent `POST /api/project-token` call. If the server doesn't bind the challenge to a specific session/client, an attacker could intercept a valid proof and replay it. The plan doesn't specify challenge expiration, single-use enforcement, or client binding.
- Required fix: Document server-side requirements: challenges must be single-use, time-bound (e.g., 60 seconds), and cryptographically bound to the project ID in the response to prevent replay across projects or time windows.

### [P1] Environment variable injection timing vulnerability
- Section: 3. Configuration & Credential Provisioning
- Problem: Secrets are injected via environment variables at process startup, but the MCP server runs as a child process of the AI agent runtime (Claude Desktop, Cursor, etc.). These hosts may log environment variables, core dump on crash, or expose them via `/proc/<pid>/environ` on Linux. The plan assumes "process startup" isolation but doesn't address host runtime risks.
- Required fix: Document threat model acknowledgment: require host runtime verification that it doesn't log env vars or use secure memory channels; alternatively, implement a local file descriptor or named pipe secret delivery with `O_CLOEXEC`.

### [P2] No certificate pinning for localhost API
- Section: 3. Configuration & Credential Provisioning - `WHATHAPPEN_API_URL`
- Problem: While restricted to loopback, if a local attacker compromises DNS resolution or uses `/etc/hosts` manipulation, `http://127.0.0.1:3000` could resolve to a malicious endpoint. The plan uses plain HTTP on loopback, which is acceptable for localhost but provides no authentication of the WhatHappen server itself.
- Required fix: Add optional TLS certificate pinning or public key verification for `https://localhost:3000` deployments, or document that the threat model assumes uncompromised local network stack.

### [P2] Missing rate limit on project listing
- Section: 5.1 `whathappen_list_projects`
- Problem: No rate limiting or caching is specified for the unauthenticated project listing endpoint, enabling enumeration attacks if the endpoint is accessible.
- Required fix: Add client-side rate limiting (max 1 call per 5 seconds) and document server-side rate limiting requirements.

### [P2] Session refresh race condition
- Section: 4. In-Memory Session Store & Auto-Refresh
- Problem: "Background Auto-Refresh" at 90% of TTL uses "cached key derivation without interrupting active agent queries." If a query is in-flight during refresh, and refresh fails (network error, server restart), the session may be evicted while the query expects the token to be valid, causing unnecessary failures.
- Required fix: Implement refresh-with-fallback: on refresh failure, retain stale session until explicit re-authentication or query failure confirms invalidity.

### [P3] Buffer zeroing implementation unspecified
- Section: 3. `WHATHAPPEN_PASSPHRASE` - Pre-flight Validation
- Problem: `buf.fill(0)` is mentioned for passphrase buffer wiping, but Node.js Buffers are pooled and may be copied by V8's garbage collector. Secure memory wiping in JavaScript is best-effort only.
- Required fix: Document limitation: passphrase may persist in memory due to V8 internals; recommend external secret management (Keychain, Secret Service) for high-security deployments.

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=1