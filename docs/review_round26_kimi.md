## ROUND FINDINGS

### [P0] Passphrase complexity validation creates false security and potential lockout
- Section: 3. Configuration & Canonicalization Ground-Truth / `WHATHAPPEN_PASSPHRASE` validation
- Problem: The plan mandates "minimum 16 characters, mix of uppercase, lowercase, numbers, and symbols" for the passphrase, but WhatHappen's actual crypto system (`lib/crypto.ts`) uses PBKDF2 with user-provided passphrases that may not meet this complexity. If a user created a project with a weaker passphrase via the web UI, the MCP server will reject it at startup, making the project permanently inaccessible via MCP despite being decryptable. The complexity check is not part of the cryptographic ground-truth.
- Required fix: Remove complexity validation; accept any non-empty passphrase. The cryptographic security comes from PBKDF2 iterations, not passphrase complexity enforcement at the MCP layer.

### [P0] `whathappen_list_projects` authentication contradiction
- Section: 5.1 `whathappen_list_projects` Implementation
- Problem: The plan states this endpoint is "intentionally unauthenticated for local loopback discovery" but the WhatHappen server at `http://127.0.0.1:3000` requires authentication for `/api/projects` per the security model. An unauthenticated endpoint would require server-side changes not mentioned in the plan, creating a mismatch between assumed and actual API behavior. If the server requires auth, the tool fails; if implemented as described, it creates an information disclosure vulnerability.
- Required fix: Clarify actual server behavior and implement proper authentication (using a discovery token or session) or document the required server-side change with implementation tracking.

### [P1] `whathappen_get_project_status` returns misleading `ttlRemainingSeconds`
- Section: 5.2 `whathappen_get_project_status` Implementation
- Problem: The tool returns `ttlRemainingSeconds` calculated from local `session.expiresAt`, but the server-side token may have been revoked or expired earlier due to `consumeChallenge()` single-use semantics or server-side invalidation. The MCP server has no mechanism to verify token validity without attempting an actual API call, so `ttlRemainingSeconds` is potentially false.
- Required fix: Rename to `cachedTtlRemainingSeconds` with explicit documentation that this is a local estimate, or perform a lightweight token validation ping (e.g., HEAD request to a lightweight endpoint) before returning status.

### [P1] Rate limiting description contradicts mutex timing
- Section: 5.3 `whathappen_unlock_project` Implementation
- Problem: Step 3 states "rate limited to min 3s interval per project" but step 4 calls `/api/auth/challenge` which has its own "1 request per 5s per project" rate limit (Section 4). The 3s mutex lock is shorter than the 5s server rate limit, allowing a second unlock attempt to hit the server's rate limiter while holding the mutex, causing unnecessary 5-second blocking waits or retry storms.
- Required fix: Align mutex timing to ≥5s to match server rate limit, or implement explicit server rate limit awareness with cached challenge timestamps.

### [P2] Missing `whathappen_rotate_passphrase` or cache invalidation trigger
- Section: 4. Cryptographic Handshake / Passphrase Fingerprinting
- Problem: The plan states "Any passphrase rotation immediately invalidates all cache lookups" but provides no MCP tool to force cache invalidation without waiting for natural expiry. If a user rotates a passphrase via the web UI, the MCP server continues using stale cached keys until the 2-hour clamped expiry or process restart, causing decryption failures that appear as `DECRYPTION_FAILED` errors without clear remediation path.
- Required fix: Add `whathappen_invalidate_project_cache` tool or document that `whathappen_lock_project` followed by `whathappen_unlock_project` is the required remediation workflow.

### [P2] `keywords` pattern validation rejects valid financial terms
- Section: 5.7 `whathappen_extract_financials` / `keywords` parameter
- Problem: The regex `^[a-zA-Z0-9\s,._-]+$` rejects valid financial symbols and terms including: `€`, `£`, `¥`, `₹`, `%`, `+`, `/` (as in "USD/EUR"), `@` (handles), and non-ASCII currency symbols. The default keywords include "eur", "gbp", "lkr" but users cannot search for "€" or "£" or "50%" or "price+tax".
- Required fix: Expand pattern to `^[\p{L}\p{N}\s,._\-/+%@€£¥₹]*$` with Unicode support, or remove client-side validation and rely on server-side sanitization.

### [P2] No handling for server-side challenge expiration during unlock flow
- Section: 5.3 `whathappen_unlock_project` / Steps 4-6
- Problem: The challenge from `GET /api/auth/challenge` includes `expiresAt`, but the plan does not specify checking this before computing proof and submitting to `POST /api/project-token`. Network latency or slow computation could result in submitting an expired challenge, causing unnecessary authentication failures.
- Required fix: Add explicit `expiresAt` validation with buffer time (e.g., reject if `expiresAt - now < 5000ms`) and request fresh challenge if too close to expiry.

### [P3] `startDate`/`endDate` strict `Z` suffix is user-hostile
- Section: 5.5 `whathappen_search_messages` / Parameters
- Problem: Requiring strict ISO-8601 with `Z` suffix rejects common valid ISO formats like `2026-01-01T00:00:00+05:30` or `2026-01-01`. The validation adds implementation complexity without security benefit since the values are used for client-side filtering only.
- Required fix: Accept any valid ISO-8601 timestamp and normalize to UTC internally, or document the strict requirement clearly in user-facing descriptions.

## VERDICT
BLOCKED
P0=2 P1=2 P2=3 P3=1