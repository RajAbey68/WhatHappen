import { validateGeneratedSQL, ALLOWED_TABLES } from '@/lib/sql-validator'

const reject = (sql: string) => expect(validateGeneratedSQL(sql, ALLOWED_TABLES).valid).toBe(false)
const accept = (sql: string) => expect(validateGeneratedSQL(sql, ALLOWED_TABLES).valid).toBe(true)

describe('validateGeneratedSQL — P0 hardening', () => {
  it('accepts a valid session-scoped aggregation', () =>
    accept('SELECT sender, COUNT(*) FROM messages_meta WHERE session_id = $1 GROUP BY sender'))

  it('rejects block-comment obfuscation', () =>
    reject('SELECT COUNT(*) FROM messages_meta WHERE session_id = $1 /* hi */'))
  it('rejects current_setting() info disclosure', () =>
    reject("SELECT current_setting('is_superuser') FROM sessions WHERE id = $1"))
  it('rejects any pg_* function beyond the legacy blocklist', () =>
    reject('SELECT pg_read_server_files() FROM sessions WHERE id = $1'))
  it('rejects a query with no session scope ($1)', () =>
    reject('SELECT sender, COUNT(*) FROM messages_meta GROUP BY sender'))
  it('rejects a tableless probe (SELECT 1)', () => reject('SELECT 1'))
  it('rejects schema-qualified tables', () => reject('SELECT * FROM auth.users WHERE id = $1'))
  it('rejects SELECT ... INTO writes', () =>
    reject('SELECT * INTO evil FROM sessions WHERE id = $1'))
})
