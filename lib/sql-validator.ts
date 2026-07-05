/**
 * Light-weight SQL validator for LLM-generated queries.
 * Rejects dangerous patterns before any DB execution.
 * This is a defence-in-depth layer on top of the read-only Postgres role
 * and the execute_safe_query stored function.
 */

const BLOCKED_PATTERNS = [
  /\bSELECT\s+\*/i,        // no SELECT * — force explicit columns (SEC-3)
  /pg_sleep/i,
  /pg_read_file/i,
  /pg_catalog/i,
  /pg_class/i,
  /information_schema/i,
  /COPY\s/i,
  /\bUNION\b/i,
  /--/,        // SQL comment — could be used to truncate parameterised parts
  /;\s*\w/,   // statement chaining: SELECT ...; DROP ...
  /DROP\s/i,
  /INSERT\s/i,
  /UPDATE\s/i,
  /DELETE\s/i,
  /TRUNCATE\s/i,
  /ALTER\s/i,
  /CREATE\s/i,
  /GRANT\s/i,
  /REVOKE\s/i,
  /1\s*\/\s*0/,            // division-by-zero error extraction
  /CASE\s+WHEN.*pg_/i,     // timing-attack via CASE+pg_sleep
]

export const ALLOWED_TABLES = [
  'sessions',
  'messages_meta',
  'message_stats',
  'llm_usage',
]

export interface ValidationResult {
  valid: boolean
  reason: string
}

export function validateGeneratedSQL(
  sql: string,
  tables: string[] = ALLOWED_TABLES
): ValidationResult {
  const trimmed = sql.trim()

  // Must start with SELECT
  if (!trimmed.toUpperCase().startsWith('SELECT')) {
    return { valid: false, reason: 'Query must start with SELECT' }
  }

  // SEC-3: tenancy filter is mandatory. The query must constrain to the caller's
  // session via the bound $1 placeholder. The DB function execute_safe_query ALSO
  // enforces this (RLS + parameter binding); rejecting here gives a clearer error
  // and is defence-in-depth, not the sole control.
  if (!/session_id/i.test(trimmed) || !trimmed.includes('$1')) {
    return { valid: false, reason: 'Query must filter on session_id = $1' }
  }

  // Block dangerous patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Blocked pattern detected: ${pattern}` }
    }
  }

  // Only allowed tables may appear after FROM or JOIN
  const tableRegex = /(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
  let match
  while ((match = tableRegex.exec(trimmed)) !== null) {
    const table = match[1].toLowerCase()
    if (!tables.map(t => t.toLowerCase()).includes(table)) {
      return { valid: false, reason: `Unknown table referenced: ${table}` }
    }
  }

  return { valid: true, reason: '' }
}
