import { validateGeneratedSQL, ALLOWED_TABLES } from '@/lib/sql-validator'

describe('validateGeneratedSQL', () => {
  it('accepts a valid aggregation query', () => {
    const sql = 'SELECT sender, COUNT(*) FROM messages_meta WHERE session_id = $1 GROUP BY sender'
    expect(validateGeneratedSQL(sql, ALLOWED_TABLES).valid).toBe(true)
  })

  it('rejects UPDATE statement', () => {
    expect(validateGeneratedSQL('UPDATE sessions SET processing_status = $1', ALLOWED_TABLES).valid).toBe(false)
  })

  it('rejects DELETE statement', () => {
    expect(validateGeneratedSQL('DELETE FROM sessions WHERE id = $1', ALLOWED_TABLES).valid).toBe(false)
  })

  it('rejects pg_sleep timing attack', () => {
    expect(validateGeneratedSQL("SELECT pg_sleep(5)", ALLOWED_TABLES).valid).toBe(false)
  })

  it('rejects UNION injection', () => {
    const sql = "SELECT id FROM sessions WHERE id = $1 UNION SELECT password FROM auth.users"
    expect(validateGeneratedSQL(sql, ALLOWED_TABLES).valid).toBe(false)
  })

  it('rejects SQL comment injection', () => {
    expect(validateGeneratedSQL("SELECT * FROM sessions -- bypass", ALLOWED_TABLES).valid).toBe(false)
  })

  it('rejects unknown table reference', () => {
    expect(validateGeneratedSQL('SELECT * FROM auth.users', ALLOWED_TABLES).valid).toBe(false)
  })

  it('rejects information_schema access', () => {
    expect(validateGeneratedSQL('SELECT * FROM information_schema.tables', ALLOWED_TABLES).valid).toBe(false)
  })

  it('rejects query not starting with SELECT', () => {
    expect(validateGeneratedSQL('EXECUTE some_proc()', ALLOWED_TABLES).valid).toBe(false)
  })

  it('accepts multi-table JOIN on allowed tables', () => {
    const sql = `SELECT s.file_name, ms.sender, ms.message_count
      FROM sessions s
      JOIN message_stats ms ON ms.session_id = s.id
      WHERE s.id = $1`
    expect(validateGeneratedSQL(sql, ALLOWED_TABLES).valid).toBe(true)
  })
})
