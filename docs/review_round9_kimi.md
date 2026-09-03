## ROUND FINDINGS

### [P0] Ingest allowlist bypass via symlink race condition
- Section: 5.6 `whathappen_trigger_ingest` — Atomic Open-Then-Verify Security Validation
- Problem: The TOCTOU defense validates `realPath` against allowlist after opening, but `fs.realpathSync` follows symlinks. A malicious process can swap a legitimate file for a symlink pointing outside the allowlist between `openSync` and `realpathSync`, or use a symlink that points inside during validation then redirect outside before read. The inode check only catches some races, not symlink target switching.
- Required fix: Use `O_NOFOLLOW` equivalent (Node's `fs.constants.O_NOFOLLOW` with `fs.open`) to prevent symlink following entirely, or validate the path string against allowlist *before* any filesystem operations, then use `fs.realpathSync` and re-validate, rejecting if either check fails or if the path changed.

### [P0] Project token authorization bypass in ingest endpoint
- Section: 5.6 Implementation — `POST /api/process-file`
- Problem: The plan states upload uses `x-project-token` header, but the API endpoint `/api/process-file` is not described in the plan's auth challenge/token flow. If this endpoint accepts the same `x-project-token` used for message queries, and tokens are scoped only to project read access, the ingest endpoint may lack explicit authorization validation or may accept tokens from any unlocked project for any project's ingest. The plan does not specify token-to-project binding verification on the server side for this endpoint.
- Required fix: Explicitly specify that `/api/process-file` validates the `x-project-token` matches the `projectId` in the request body/header, and that tokens are project-scoped; or document the separate auth mechanism for ingest if different.

### [P1] UUID v4 regex rejects valid UUIDs and accepts invalid ones
- Section: 5.2 Parameters, 5.3-5.6 Parameters
- Problem: The regex `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` requires lowercase hex but many UUID generators produce uppercase; it also incorrectly restricts the first character of the third segment to `4` (correct) but the first character of the fourth segment to `[89ab]` which is correct for UUID v4, however the pattern `[0-9a-f]{12}` for the final segment should be `[0-9a-f]{12}` — actually that's fine. The real issue: the regex lacks `i` flag and will reject uppercase UUIDs, causing interoperability failures with common UUID libraries.
- Required fix: Add case-insensitivity flag or explicit `[0-9a-fA-F]` character classes to the UUID validation regex.

### [P1] Missing passphrase validation on unlock vs. stored hash mismatch
- Section: 4 Cryptographic Handshake, 5.2 Implementation
- Problem: The plan derives `keyHex = sha256Hex(passphrase)` for HMAC proof, but never verifies this derived key actually decrypts anything. A user could enter any 16+ character passphrase, successfully authenticate to the API (if the server only validates HMAC proof against a stored challenge), derive a garbage AES key, and then fail silently or with opaque errors during decryption. The "Fail-Fast" invariants only check session presence, not key validity.
- Required fix: After deriving the AES key, perform a trial decryption of a known ciphertext (e.g., first message or a project metadata field) and throw `PASSPHRASE_INVALID` if decryption fails, before caching the session.

### [P1] `WHATHAPPEN_API_URL` http-only restriction breaks legitimate https localhost
- Section: 3 Configuration — `WHATHAPPEN_API_URL`
- Problem: The strict protocol check `http:` only blocks `https:` on localhost, which is valid for local development with self-signed certificates or reverse proxies. The security goal is preventing remote access, not preventing TLS. This creates a false security boundary that breaks legitimate local HTTPS setups without improving security.
- Required fix: Allow `https:` when hostname is `localhost` or `127.0.0.1`, or document that TLS is intentionally prohibited and why (e.g., certificate validation burden). If TLS is truly prohibited, this is P2; if it's an unintended over-restriction, it's P1.

### [P2] No mitigation for memory dump attacks on derived keys
- Section: 4 Cryptographic Handshake — Buffer Zeroing
- Problem: The plan acknowledges "memory protection relies on OS encrypted swap/FileVault" as defense-in-depth, but provides no mitigation for core dumps, debugger attachment, or `/proc/pid/mem` access on Linux where swap encryption may not be enabled. Node.js `Buffer.fill(0)` is not guaranteed to be elision-free and may be copied by GC or retained in old space.
- Required fix: Document the threat model explicitly (local attacker with memory access = game over) or implement `crypto.subtle` exclusively with `ArrayBuffer` transfer to minimize copies, with explicit documentation of residual risk.

### [P2] Session refresh race condition with concurrent tool calls
- Section: 4 In-Memory Session Store & Auto-Refresh
- Problem: The "single in-flight unlock promise per projectId" lock only applies to unlock, not to background refresh. If a refresh fires while another tool call is using the token, and the refresh fails with 401, the session is invalidated mid-operation. The "existing session retained until expiry or explicit 401" fallback is ambiguous—does the calling tool get the stale token or a failure?
- Required fix: Specify that session mutations (refresh, invalidation) are queued behind in-flight operations, or that tokens are versioned with atomic compare-and-swap semantics.

### [P2] `whathappen_search_messages` output truncation logic is underspecified
- Section: 5.3 Implementation
- Problem: "Stops appending complete message objects before exceeding 100,000 UTF-8 characters" does not specify whether this is measured on the JSON string, the message content, or individual fields. Partial message truncation (cutting off mid-object) would produce invalid JSON. The `omittedCount` field is not defined in relation to `totalCount` (is `totalCount` pre-truncation or returned?).
- Required fix: Clarify that truncation occurs at message boundaries only, and define `totalCount` as total matches before truncation, `omittedCount` as matches excluded due to size limit.

### [P3] `WHATHAPPEN_INGEST_ALLOWLIST` JSON parsing failure mode unspecified
- Section: 3 Configuration — `WHATHAPPEN_INGEST_ALLOWLIST`
- Problem: "If unset, empty, or invalid, the ingest tool returns an explicit `INGEST_DISABLED` error" — but "invalid" JSON (e.g., `["/path"]` with trailing comma) may throw during server startup or per-request. The plan doesn't specify whether parsing happens at config load time or tool execution time, affecting error visibility.
- Required fix: Document eager parsing at server startup with fatal error vs. lazy per-request validation.

## VERDICT
BLOCKED
P0=2 P1=4 P2=3 P3=1