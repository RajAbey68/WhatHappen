## ROUND FINDINGS

### [P0] Passphrase hash verification mismatch creates security bypass
- Section: 3. Configuration & Credential Provisioning / 4. Key Derivation
- Problem: The plan specifies `WHATHAPPEN_PASSPHRASE_HASH` as "Hex SHA256 pre-computed verifier" matching server's `WHATSAPP_PASSPHRASE_HASH`, but the actual challenge-response in 5.2 uses HMAC-SHA256 proof, not SHA256 hash comparison. This creates two incompatible authentication paths—either the hash is unused (dead code/confusion) or the server accepts both methods (security downgrade). The plan never clarifies which credential is actually used for the HMAC.
- Required fix: Explicitly state whether `WHATHAPPEN_PASSPHRASE_HASH` is used at all, and if so, how it relates to HMAC key derivation. Remove unused credential or document the dual-path logic with server-side validation requirements.

### [P1] Auto-authentication creates silent credential consumption without explicit unlock
- Section: 5.3, 5.4, 5.5 (tool implementations) / 4. Auto-Authentication
- Problem: Tools "automatically ensure project is unlocked" via auto-authentication using environment passphrase. This violates the explicit user intent model—an LLM agent calling `search_messages` will silently consume `WHATHAPPEN_PASSPHRASE` from environment without the user explicitly approving unlock for that specific project. If multiple projects exist, the same passphrase (potentially wrong for that project) gets tried automatically, burning rate limits or creating false "access denied" states that leak project existence.
- Required fix: Remove auto-authentication. Require explicit `whathappen_unlock_project` call first; other tools must fail fast with `PROJECT_LOCKED` error if no valid cached token exists.

### [P1] Challenge-response credential binding is underspecified
- Section: 5.2 whathappen_unlock_project / 4. Key Derivation
- Problem: The plan states HMAC-SHA256 proof is computed "locally in RAM" but never specifies: (a) what the HMAC key is (passphrase? derived key? hash?), (b) what data is being signed (challenge nonce only? nonce+projectId+timestamp?), (c) whether the server verifies project binding or just challenge validity. Without projectId binding in the signed payload, a valid proof for project A could be replayed to unlock project B.
- Required fix: Document exact HMAC construction: `HMAC-SHA256(key=WHATHAPPEN_PASSPHRASE, message=challenge_nonce + ":" + projectId)` or equivalent with project binding.

### [P1] Token refresh lacks concurrency control
- Section: 4. Auto-Authentication & Token Refresh / 6. Transparent Re-Auth
- Problem: "Transparent Re-Auth" retries challenge-response on 401, but with parallel tool calls (common in MCP), multiple simultaneous requests may all hit 401 and trigger redundant challenge-response flows, creating race conditions in token cache updates and potential nonce reuse or HMAC timing attacks.
- Required fix: Add per-project token refresh mutex/lock—only one challenge-response flow executes concurrently per projectId, others await completion.

### [P2] Derived key cache lacks invalidation on token expiry
- Section: 4. In-Memory Session Store
- Problem: `derivedKeys` map caches CryptoKey indefinitely per projectId with no TTL or linkage to token expiry. If token expires and refreshes (new passphrase potentially?), stale derived key remains cached. If passphrase changes (rare but possible), derived key never updates.
- Required fix: Bind derived key cache to token expiry; clear on token refresh or add explicit TTL matching token lifetime.

### [P2] INGEST_ALLOWLIST default is overly permissive
- Section: 3. Configuration & Credential Provisioning
- Problem: Default includes `~/Downloads/`—a high-risk directory for symlink attacks, browser-downloaded malware, and accidental ingestion of unrelated ZIP files. Path canonicalization helps but doesn't prevent TOCTOU race between validation and stream open.
- Required fix: Remove `~/Downloads/` from default; require explicit user configuration. Add file descriptor-based validation (open then verify path) rather than stat-then-open.

### [P2] Character clamp truncation loses semantic context
- Section: 5.3 whathappen_search_messages
- Problem: "Explicit truncation banner" at 100K chars mid-message or mid-conversation destroys context that LLM needs for analysis. No mention of whether truncation is message-boundary aware or just raw character cut.
- Required fix: Specify message-boundary-aware truncation (complete messages only) with count of omitted messages in banner.

### [P3] API_URL validation allows DNS rebinding to 167.233.236.178
- Section: 3. Configuration & Credential Provisioning
- Problem: Allowed origin list includes IP literal `http://167.233.236.178:3000` but validation logic unspecified. If validated by string match, DNS-resolved localhost could bypass (e.g., `http://attacker.com:3000` → 127.0.0.1). Minor since stdio mode requires local execution anyway.
- Required fix: Validate by resolved IP address, not URL string; reject non-localhost/loopback unless explicitly overridden.

## VERDICT
BLOCKED
P0=1 P1=3 P2=3 P3=1