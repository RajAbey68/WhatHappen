/**
 * Hardened SQL validator v2 for LLM-generated queries (P0 security).
 *
 * Defence-in-depth in front of the read-only Postgres role and the
 * execute_safe_query() SECURITY DEFINER function. The app's text-to-SQL only
 * needs FLAT single-table aggregates, so we restrict the grammar to exactly
 * that: one SELECT, one allow-listed table, no CTEs, no subqueries, no UNION.
 *
 * LIMITATION (tracked, roadmap P0-2): regex is not a SQL parser. The authoritative
 * session scoping must be enforced in execute_safe_query() by injecting the
 * session filter itself, NOT by trusting a `$1` in the model's SQL. This layer
 * reduces attack surface; it is not the last line of defence.
 */

const BLOCKED_PATTERNS: RegExp[] = [
  /\bpg_[a-z0-9_]+/i, /information_schema/i,
  /\bcurrent_setting\b/i, /\bset_config\b/i, /\bdblink\b/i,
  /\blo_import\b/i, /\blo_export\b/i, /\bCOPY\b/i,
  /\bquery_to_xml\b/i, /\btable_to_xml\b/i, /\bcursor_to_xml\b/i,
  /\bxmlelement\b/i, /\bxmlforest\b/i,
  /\bUNION\b/i, /\bWITH\b/i,            // no UNION, no CTEs
  /--/, /\/\*/, /\*\//,                 // no comments
  /;\s*\S/,                             // no statement chaining
  /\(\s*SELECT/i,                       // no subqueries
  /\bDROP\b/i, /\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bTRUNCATE\b/i,
  /\bALTER\b/i, /\bCREATE\b/i, /\bGRANT\b/i, /\bREVOKE\b/i, /\bMERGE\b/i, /\bINTO\b/i,
  /1\s*\/\s*0/, /\bCASE\s+WHEN\b[\s\S]*\bpg_/i,
]

export const ALLOWED_TABLES = ['sessions', 'messages_meta', 'message_stats', 'llm_usage']
export interface ValidationResult { valid: boolean; reason: string }
const MAX_SQL_LENGTH = 2000

export function validateGeneratedSQL(sql: string, tables: string[] = ALLOWED_TABLES): ValidationResult {
  const trimmed = (sql ?? '').trim()
  if (trimmed.length === 0) return { valid: false, reason: 'Empty query' }
  if (trimmed.length > MAX_SQL_LENGTH) return { valid: false, reason: `Query exceeds ${MAX_SQL_LENGTH} characters` }
  if (!/^SELECT\b/i.test(trimmed)) return { valid: false, reason: 'Query must start with SELECT' }

  // exactly one SELECT — kills nested/derived selects and stacked reads
  if ((trimmed.match(/\bSELECT\b/gi) || []).length !== 1) {
    return { valid: false, reason: 'Only a single flat SELECT is permitted' }
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) return { valid: false, reason: `Blocked pattern detected: ${pattern}` }
  }

  const tableRegex = /(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_."]*)/gi
  const allow = tables.map(t => t.toLowerCase())
  let m: RegExpExecArray | null, sawTable = false
  while ((m = tableRegex.exec(trimmed)) !== null) {
    sawTable = true
    const raw = m[1].toLowerCase().replace(/"/g, '')
    if (raw.includes('.')) return { valid: false, reason: `Schema-qualified table not allowed: ${m[1]}` }
    if (!allow.includes(raw)) return { valid: false, reason: `Unknown table referenced: ${raw}` }
  }
  if (!sawTable) return { valid: false, reason: 'Query must read from an allowed table' }

  // session scope heuristic: $1 must appear after a WHERE (regex layer only;
  // authoritative enforcement is in execute_safe_query — see file header).
  if (!/\bWHERE\b[\s\S]*\$1/i.test(trimmed)) {
    return { valid: false, reason: 'Query must be session-scoped: $1 must appear in a WHERE clause' }
  }
  return { valid: true, reason: '' }
}
