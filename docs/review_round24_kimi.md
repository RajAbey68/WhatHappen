## ROUND FINDINGS

### [P0] Missing passphrase validation in search/chronology/financials tools
- Section: 5.5, 5.6, 5.7 (Implementation steps)
- Problem: Tools 5.5-5.7 list "Pre-flight check: validates `WHATHAPPEN_PASSPHRASE` presence (>= 16 chars)" but this check is redundant and misleading. The passphrase was already validated at unlock time (5.3 step 1) and stored in process env. Re-checking presence doesn't verify the *correct* passphrase for this specific project—any 16+ char string would pass. Worse, if env var is unset between unlock and search, the tool fails late with cryptic `DECRYPTION_FAILED` rather than explicit `UNAUTHORIZED`.
- Required fix: Remove redundant presence checks from 5.5-5.7. Instead, rely on session token validity (which embeds passphrase proof) and ensure `DECRYPTION_FAILED` errors are wrapped with context indicating "passphrase may have changed or session corrupted."

### [P0] Race condition on session token refresh
- Section: 4 (Background Refresh) and 5.3/5.5-5.7
- Problem: "Background Refresh: Queued at 90% TTL" is specified but no implementation detail prevents multiple concurrent tools from triggering simultaneous refresh. With "per-project in-flight promise locks" mentioned, the plan doesn't specify whether refresh holds the same lock as decryption operations. Two concurrent `search_messages` calls at 91% TTL could double-refresh, with one refresh's token invalidating the other's in-flight request.
- Required fix: Explicitly state that token refresh holds the per-project mutex and that refresh failures (401/403) atomically purge session before releasing lock.

### [P1] `whathappen_list_projects` lacks authentication
- Section: 5.1
- Problem: Tool calls `GET /api/projects` with no session token or project context. The WhatHappen API likely requires some authentication to list projects (or leaks project existence to any local process). Plan doesn't specify what auth header is sent, yet claims "No Direct Database Bypass" and strict security.
- Required fix: Clarify if `/api/projects` is unauthenticated (security issue) or requires a global API key (add `WHATHAPPEN_API_KEY` env var). If unauthenticated, document this as intentional local-only exposure.

### [P1] `sender` filter implementation unspecified for encrypted data
- Section: 5.5 (Parameters and Implementation)
- Problem: `sender` filter is applied in step 6 "Filters decrypted messages in client memory" but sender information is inside the encrypted payload. The tool must download and decrypt *all* messages to filter by sender, yet `limit` parameter suggests server-side pagination. No API endpoint `/api/ai-chat/${projectId}` is documented to support sender/server-side filtering.
- Required fix: Document that sender filtering requires full download/decrypt (inefficient) or add server-side encrypted-sender-index query parameter to the API contract.

### [P1] `anchorTimestamp` tie-breaking creates non-determinism
- Section: 5.6 (Implementation step 5)
- Problem: "tie-breaking: earlier message wins" for timestamp collisions is ambiguous when multiple messages share identical timestamps (common in WhatsApp exports). "Earlier" by what ordering? Array index? Decryption order? This affects reproducibility for legal archiving.
- Required fix: Specify deterministic tie-breaker: "ascending by message ID (UUID) as secondary sort."

### [P2] No mitigation for passphrase change mid-session
- Section: 4 (Cryptographic Handshake) and 5.3-5.7
- Problem: If user changes project passphrase on server after unlock, cached session token remains valid (server validates token, not passphrase per-request), but subsequent decryption fails with `DECRYPTION_FAILED`. No recovery path is specified—user must manually `lock_project` then `unlock_project`.
- Required fix: Document recovery: on `DECRYPTION_FAILED`, automatically invalidate session and prompt re-unlock, or add explicit `PASSPHRASE_CHANGED` error code.

### [P2] 100,000 byte truncation loses context
- Section: 5.5 (Implementation step 7)
- Problem: "Truncates strictly at whole message boundaries before cumulative plaintext exceeds 100,000 UTF-8 bytes" prevents mid-message cuts but may truncate mid-conversation. No indicator (e.g., `truncated: true`, `nextMessageId`) tells caller more data exists.
- Required fix: Add `truncated: boolean` and `totalMessagesAvailable: number` to response schema.

### [P2] `keywords` parameter injection risk
- Section: 5.7 (Parameters)
- Problem: `keywords` accepts "Comma-separated financial keywords override" with no validation. User could inject regex special characters or extremely long strings (no max length specified) causing ReDoS in client-side filtering.
- Required fix: Add max length (e.g., 500 chars) and validate against allowed pattern `^[a-zA-Z0-9\s,._-]+$`.

### [P3] Missing tool for explicit session health check
- Section: 5.2 vs 5.3
- Problem: `get_project_status` checks session presence but doesn't validate token freshness against server. A stale token (expired server-side but cached client-side) reports `unlocked: true` until first actual API call fails.
- Required fix: Optional: add `validate: boolean` parameter to `get_project_status` to probe server with lightweight HEAD request.

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=1