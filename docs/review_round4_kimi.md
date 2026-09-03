## ROUND FINDINGS

### [P0] Hostname validation allows arbitrary subdomains of allowed IPs
- Section: 3. Configuration & Credential Provisioning
- Problem: The hostname validation rule permits `167.233.236.178` but does not restrict subdomains. An attacker controlling DNS or using a hostname like `167.233.236.178.evil.com` could bypass the localhost-only intent and exfiltrate data to a remote server. The plan mentions "explicit remote IP" but doesn't specify exact string matching or IP parsing.
- Required fix: Validate `WHATHAPPEN_API_URL` using strict URL parsing with explicit allowlist of exact hostnames (`localhost`, `127.0.0.1`, `167.233.236.178`) rejecting any other host, port injection, or userinfo components.

### [P0] Session cache eviction does not clear CryptoKey material
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: The plan states "Token and derived `CryptoKey` are strictly evicted together" but provides no mechanism for secure memory wiping. Node.js `CryptoKey` objects in a Map hold references to key material that may not be immediately garbage collected, and the plan lacks explicit `subtleCrypto.exportKey` cleanup or `CryptoKey` invalidation. Passphrase-derived keys may persist in memory beyond TTL.
- Required fix: Explicitly document secure key destruction using `crypto.subtle.exportKey` followed by buffer zeroing, or use ephemeral key handles with explicit `CryptoKey` unexportable marking and session Map deletion with immediate garbage collection hints.

### [P1] `whathappen_trigger_ingest` lacks project ownership verification
- Section: 5.6 `whathappen_trigger_ingest`
- Problem: The tool accepts any `projectId` and streams a file to `POST /api/process-file` without verifying the MCP session has unlocked that project. An agent could ingest data into an arbitrary project ID if the API accepts unauthenticated or mis-scoped requests. The plan does not specify token authentication for the ingest endpoint.
- Required fix: Require prior `whathappen_unlock_project` for the target `projectId`, and include the session token in the `POST /api/process-file` request headers for authorization validation.

### [P1] `whathappen_search_messages` character clamping is underspecified
- Section: 5.3 `whathappen_search_messages`
- Problem: "Message-boundary-aware character clamping" lacks implementation detail. If messages contain multi-byte UTF-8 characters, naive character counting could split code points. The plan does not specify whether the 100K limit applies to decrypted plaintext bytes, characters, or JSON-serialized output, leading to inconsistent truncation and potential JSON parsing failures.
- Required fix: Specify clamping operates on Unicode code points after JSON stringification, with explicit handling of surrogate pairs and validation that truncated output remains valid JSON.

### [P2] No rate limiting on unlock attempts
- Section: 5.2 `whathappen_unlock_project`
- Problem: The concurrency lock prevents race conditions but does not rate-limit failed authentication attempts. An agent or compromised process could brute-force passphrases via repeated `whathappen_unlock_project` calls without backoff or account lockout.
- Required fix: Implement exponential backoff on authentication failures per `projectId`, with maximum retry count before requiring process restart or manual intervention.

### [P2] `WHATHAPPEN_INGEST_ALLOWLIST` directory traversal via symlinks
- Section: 5.6 `whathappen_trigger_ingest`
- Problem: `fs.realpathSync` resolves symlinks, but the validation order is unspecified. If `fs.openSync` occurs before `realpathSync` validation, a TOCTOU race allows symlink swapping between check and use. The plan does not specify atomic validation.
- Required fix: Validate allowlist containment strictly after `realpathSync` resolution, with explicit documentation that `openSync` must not precede path validation, or use `O_NOFOLLOW` flags where available.

### [P2] Missing validation of `projectId` format
- Section: Multiple tools (5.2, 5.3, 5.4, 5.5, 5.6)
- Problem: `projectId` is accepted as arbitrary strings without UUID validation or sanitization. Malformed IDs could cause log injection, unexpected API behavior, or session cache pollution with invalid keys.
- Required fix: Validate `projectId` against UUID v4 format before any network or cache operations.

## VERDICT
BLOCKED
P0=2 P1=2 P2=3 P3=0