## ROUND FINDINGS
### [P0] Passphrase Exposure Risk in `whathappen_authenticate_project`
- Section: 4.2 `whathappen_authenticate_project`
- Problem: The `passphrase` parameter accepts plaintext passphrases, which could be logged or leaked in memory during the HMAC-SHA256 proof generation process, violating the zero-knowledge invariant.
- Required fix: Remove the `passphrase` parameter entirely and enforce `passphraseHash` as the only input method.

### [P1] Missing Validation for `WHATSAPP_PASSPHRASE_HASH`
- Section: 3. Configuration & Authentication
- Problem: The `WHATSAPP_PASSPHRASE_HASH` environment variable is described as optional but is required for non-interactive challenge solving. This ambiguity could lead to runtime errors.
- Required fix: Clarify that `WHATSAPP_PASSPHRASE_HASH` is mandatory for non-interactive modes and enforce validation at startup.

### [P2] Supabase Direct Access Risk
- Section: 3. Configuration & Authentication
- Problem: The `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables allow direct database access, bypassing the HTTP REST API and potentially exposing sensitive operations.
- Required fix: Remove direct Supabase access fallback and enforce all operations through the HTTP REST API.

### [P2] Missing File Path Validation in `whathappen_trigger_ingest`
- Section: 4.6 `whathappen_trigger_ingest`
- Problem: The `filePath` parameter accepts any absolute path without validation, which could lead to unauthorized file access or injection attacks.
- Required fix: Validate `filePath` against a whitelist of allowed directories and enforce strict file type checks.

### [P3] Token Expiry Documentation Gap
- Section: 5. Security & Boundary Guardrails
- Problem: The `PROJECT_TOKEN_TTL_MS` value is mentioned but not documented or configurable, which could lead to confusion during implementation.
- Required fix: Document `PROJECT_TOKEN_TTL_MS` and make it configurable via environment variables.

## VERDICT
BLOCKED
P0=1 P1=1 P2=2 P3=1