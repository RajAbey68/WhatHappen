## ROUND FINDINGS
### [P0] Passphrase exposure via tool parameters
- Section: 4.2 whathappen_authenticate_project
- Problem: Accepting `passphrase` as a JSON tool parameter exposes plaintext secrets to MCP client logs (e.g., Claude Desktop’s conversation.sqlite), AI context history, and JSON-RPC message buffers. This violates the "Raw passphrases must NEVER touch disk or be leaked over network unencrypted" invariant.
- Required fix: Remove `passphrase` from tool parameters; accept secrets only via secure stdio input or OS keychain prompts, never through JSON-RPC.

### [P0] Supabase Service Role Key bypass
- Section: 3 (Configuration) and 4.3
- Problem: Configuring `SUPABASE_SERVICE_ROLE_KEY` grants the MCP server unrestricted database access, bypassing the API’s project-level authentication and encryption boundaries. This creates an arbitrary decrypt capability for all projects and violates zero-knowledge architecture.
- Required fix: Remove Supabase direct access configuration; force all data access through the authenticated HTTP API with project tokens.

### [P0] Passphrase hash persistence in environment variables
- Section: 3 (Configuration)
- Problem: Storing `WHATSAPP_PASSPHRASE_HASH` in environment variables persists the secret-equivalent hash to disk (visible in /proc/<pid>/environ, shell history, and process listings). Since the challenge-response uses this hash as the HMAC key, compromise of the hash equals compromise of the passphrase.
- Required fix: Require interactive secure input for the passphrase/hash at runtime; do not store cryptographic secrets in environment variables.

### [P0] Cloud Mode decryption impossibility
- Section: 2 (Distribution Modes) and 4.3
- Problem: Cloud Mode (Remote SSE) cannot perform the specified "client-side" decryption because the passphrase is never available to the remote server (only hash or pre-issued tokens exist). Without the passphrase, the AES-GCM key cannot be derived, making the decryption step in 4.3 impossible to execute.
- Required fix: Restrict decryption-capable operations to Local Stdio mode only, or explicitly state that Cloud Mode requires server-side decryption with associated key management risks.

### [P1] Unverifiable ingest endpoint
- Section: 4.6 whathappen_trigger_ingest
- Problem: The hardcoded endpoint `http://167.233.236.178:8081` is not listed in the Infrastructure Ground-Truth (only :3000 is specified). This appears to be a nonexistent or unverifiable service that will cause the ingest implementation to fail.
- Required fix: Verify the correct ingest endpoint (likely :3000 or a documented microservice) and update the implementation plan.

### [P1] Missing decryption key source for Supabase fallback
- Section: 3 and 4.3
- Problem: If the MCP server uses the Supabase fallback (bypassing API), it receives encrypted ciphertext but has no mechanism to obtain the project passphrase—the API challenge-response yields a token, not the passphrase, and tokens cannot derive AES keys. This creates an unresolvable dependency for decryption.
- Required fix: Remove the Supabase fallback option or specify a secure key escrow mechanism for passphrase retrieval.

### [P2] File path ambiguity in Remote mode
- Section: 4.6 whathappen_trigger_ingest
- Problem: The `filePath` parameter refers to the "host" filesystem, which is ambiguous when running in Remote SSE mode (server filesystem vs. client filesystem). This will mislead implementers about file upload capabilities.
- Required fix: Clarify that `whathappen_trigger_ingest` is only supported in Local Stdio mode, or implement explicit file upload streaming for remote deployments.

## VERDICT
BLOCKED
P0=4 P1=2 P2=1 P3=0