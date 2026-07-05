-- SEC-3 — Enforce per-session tenancy in the LLM (text-to-SQL) query path.
-- Hardens execute_safe_query from migrations/001_whathappen_schema.sql.
--
-- BEFORE: session_id_param was accepted but never used; the function
-- string-concatenated the LLM's SQL and bound no parameter. A query that
-- omitted "WHERE session_id = $1" — or an injected "... OR 1=1" — read across
-- EVERY user's rows in sessions / messages_meta / message_stats.
--
-- AFTER: tenancy is enforced in TWO ways that do NOT depend on the LLM behaving:
--   1) Row-Level Security on the read-only role, keyed off a request-scoped GUC
--      (app.current_session) that the function sets from session_id_param.
--      Even a crafted "OR 1=1" cannot escape the RLS predicate.
--   2) session_id_param is bound to $1, and the query is refused unless it
--      references both session_id and the $1 placeholder.

-- 1. RLS policies for the read-only role, scoped by the GUC the function sets.
ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS readonly_session_scope ON sessions;
DROP POLICY IF EXISTS readonly_session_scope ON messages_meta;
DROP POLICY IF EXISTS readonly_session_scope ON message_stats;

CREATE POLICY readonly_session_scope ON sessions
  FOR SELECT TO whathappen_readonly
  USING (id = current_setting('app.current_session', true)::uuid);

CREATE POLICY readonly_session_scope ON messages_meta
  FOR SELECT TO whathappen_readonly
  USING (session_id = current_setting('app.current_session', true)::uuid);

CREATE POLICY readonly_session_scope ON message_stats
  FOR SELECT TO whathappen_readonly
  USING (session_id = current_setting('app.current_session', true)::uuid);

-- 2. Hardened executor.
CREATE OR REPLACE FUNCTION execute_safe_query(query_sql TEXT, session_id_param UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  -- Single SELECT only.
  IF NOT (query_sql ILIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries permitted';
  END IF;

  -- Dangerous patterns (defence-in-depth only — NOT the primary control).
  -- Block dangerous tokens and statement-stacking (';' followed by more SQL).
  -- A bare/trailing ';' and CTEs (WITH ...) are intentionally allowed.
  IF query_sql ~* '(pg_sleep|pg_read_file|pg_catalog|pg_class|COPY\s|information_schema|1\s*/\s*0|UNION\s|;\s*\S)' THEN
    RAISE EXCEPTION 'Blocked pattern in query';
  END IF;

  -- Mandatory tenancy: the query must filter on session_id via the bound $1.
  IF position('$1' IN query_sql) = 0 OR query_sql !~* 'session_id' THEN
    RAISE EXCEPTION 'Query must filter on session_id = $1';
  END IF;

  -- Request-scoped session id drives the RLS policies above. is_local = true
  -- resets it at transaction end.
  PERFORM set_config('app.current_session', session_id_param::text, true);

  -- Run as the read-only role (RLS now applies), 1000-row cap, $1 bound.
  SET LOCAL ROLE whathappen_readonly;
  EXECUTE
    'SELECT jsonb_agg(row_to_json(t)) FROM (' || query_sql || ' LIMIT 1000) t'
    INTO result
    USING session_id_param;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

-- 3. P0 grants: the app now calls the DB AS the authenticated user (RLS-enforced),
-- not via the service-role key. Ensure that role can reach what it needs.
-- (sessions: list + insert by the user; the metadata tables are read only through
-- execute_safe_query as the read-only role, so they need no direct grant here.)
GRANT SELECT, INSERT ON sessions TO authenticated;
GRANT EXECUTE ON FUNCTION execute_safe_query(text, uuid) TO authenticated;

-- The SECURITY DEFINER function runs as its owner (postgres) and does
-- `SET LOCAL ROLE whathappen_readonly`. SET ROLE requires the owner to be a
-- MEMBER of the target role, so grant it. Without this the function raises
-- "permission denied to set role" at runtime. (Independent review: Gemini.)
GRANT whathappen_readonly TO postgres;

-- Explicit INSERT policy for sessions. A FOR ALL policy's USING expression also
-- serves as the WITH CHECK when none is given (so migration 001 already permits
-- this), but we state it explicitly to remove any doubt for INSERTs by the user.
DROP POLICY IF EXISTS users_insert_own_sessions ON sessions;
CREATE POLICY users_insert_own_sessions
  ON sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
