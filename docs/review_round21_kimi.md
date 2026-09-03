## ROUND FINDINGS

### [P0] Missing API authentication token in tool implementations
- Section: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7 (all tool implementations)
- Problem: The plan describes `x-project-token` header usage in Section 2 ("All project data operations route through WhatHappen HTTP endpoints (`x-project-token`)"), but no tool implementation specifies how this token is obtained or passed. Section 5.3 stores a token in session cache, but no subsequent tool describes retrieving it from cache and injecting it as `x-project-token` header. The API calls are described as bare `GET /api/projects`, `POST /api/ai-chat/query`, etc. without header construction.
- Required fix: Explicitly document that all authenticated API calls must include `x-project-token: ${session.token}` header, with session retrieved from cache via composite key lookup.

### [P0] Session cache key construction mismatch
- Section: 4 (In-Memory Session Store), 5.3 (whathappen_unlock_project), 5.4 (whathappen_lock_project)
- Problem: Section 4 states session key is `sha256Hex(projectId.toLowerCase() + ":" + token)`, but Section 5.3 stores token under "composite key" without defining it, and Section 5.4 deletes session matching `projectId` directly without the token component. This creates ambiguity: is the key just `projectId` or the full composite? If tools only have `projectId` parameter, they cannot reconstruct the composite key without also having the token.
- Required fix: Clarify that session lookup uses `projectId` alone as primary key (single active session per project), or provide token retrieval mechanism; fix Section 5.4 to use correct key construction.

### [P1] Non-existent API endpoint `/api/ai-chat/query`
- Section: 5.5, 5.6, 5.7
- Problem: The plan references `POST /api/ai-chat/query` for search, chronology, and financial extraction, but this endpoint is not documented in the WhatHappen server API. The canonical endpoints are `/api/projects`, `/api/auth/challenge`, `/api/project-token`. No `/api/ai-chat/*` routes exist in the server codebase.
- Required fix: Replace with actual WhatHappen API endpoints (likely `/api/projects/{id}/messages` or similar); verify against server OpenAPI spec.

### [P1] `whathappen_get_chronology` implementation underspecified
- Section: 5.6
- Problem: The implementation claims to "fetch surrounding ciphertext window via API" but no WhatHappen API endpoint supports anchor-timestamp-based window queries. The server provides bulk message retrieval, not chronology navigation. The plan invents API capability that doesn't exist.
- Required fix: Remove tool or implement client-side filtering against `/api/projects/{id}/messages` with full result set pagination.

### [P1] `whathappen_extract_financials` deterministic regex claim is false
- Section: 5.7
- Problem: The plan claims "deterministic regex and ledger parsers" run locally, but no such parser exists in the WhatHappen codebase or plan. This is aspirational functionality without implementation path. Financial extraction from unstructured WhatsApp text requires ML/NLP, not regex.
- Required fix: Remove tool or scope to returning raw decrypted messages for external LLM processing; do not claim structured extraction.

### [P2] Rate limit throttle lacks enforcement mechanism
- Section: 5.1, 5.5
- Problem: "Throttled to max 1 call per 5 seconds" and "min 1s interval" are stated but no mechanism described (in-memory timestamps? shared state?). Multiple MCP client processes could bypass this. No 429 handling from server-side rate limits described.
- Required fix: Document per-process in-memory timestamp tracking with `Date.now()` comparison, or remove claim if unenforced.

### [P2] AbortController 50MB limit is ineffective DoS protection
- Section: 5.5
- Problem: 50MB stream limit on encrypted ciphertext provides minimal protection; a malicious server could send infinite 49MB chunks. No connection timeout specified. Memory exhaustion possible via many concurrent tool calls.
- Required fix: Add total connection timeout (e.g., 30s) and concurrent request limit (e.g., max 3 in-flight).

### [P2] SaltMap LRU eviction doesn't wipe CryptoKey material
- Section: 4 (Bounded Per-Project Key Cache)
- Problem: LRU Map eviction at 100 entries removes reference but `CryptoKey` objects (non-extractable) remain in V8 heap until GC. No explicit `crypto.subtle.exportKey` call possible (extractable: false), but plan claims "Raw derived buffers are wiped" — this applies to pre-import buffers, not post-import keys. No mechanism to force key destruction.
- Required fix: Document that `CryptoKey` objects cannot be explicitly destroyed in WebCrypto; accept GC dependency or switch to extractable keys with manual wiping.

### [P3] `WHATHAPPEN_API_URL` pathname strict `/` check breaks valid URLs
- Section: 3
- Problem: `http://127.0.0.1:3000/` with trailing slash is required, but `http://127.0.0.1:3000` (no trailing slash) is semantically identical and commonly used. Strict rejection is user-hostile without security benefit.
- Required fix: Normalize URL with `new URL()` and compare `origin` only, or accept both.

---

## VERDICT
BLOCKED
P0=2 P1=4 P2=3 P3=1