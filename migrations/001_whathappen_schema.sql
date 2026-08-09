-- WhatHappen v1.2 schema
-- Shared What* platform: source_app column isolates WhatHappen, WhatToDo, etc.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── SESSIONS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL,
  file_name         TEXT        NOT NULL,
  file_size_bytes   BIGINT,
  source_app        TEXT        NOT NULL DEFAULT 'whathappen',
  source_type       TEXT        NOT NULL
    CHECK (source_type IN ('whatsapp', 'email_pst', 'email_csv')),
  total_messages    INT         DEFAULT 0,
  date_range_start  TIMESTAMPTZ,
  date_range_end    TIMESTAMPTZ,
  processing_status TEXT        DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'complete', 'error')),
  processing_error  TEXT,
  processing_ms     INT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ─── MESSAGES META (metadata only — NO content column) ────────────────────
CREATE TABLE IF NOT EXISTS messages_meta (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id        UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_type       TEXT        NOT NULL,
  timestamp         TIMESTAMPTZ,
  sender            TEXT,
  recipient         TEXT,
  word_count        INT,
  sentiment_score   NUMERIC(4,3),
  has_media         BOOLEAN     DEFAULT false,
  is_system_message BOOLEAN     DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (timestamp);

CREATE TABLE IF NOT EXISTS messages_meta_2024
  PARTITION OF messages_meta FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE IF NOT EXISTS messages_meta_2025
  PARTITION OF messages_meta FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS messages_meta_2026
  PARTITION OF messages_meta FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS messages_meta_future
  PARTITION OF messages_meta FOR VALUES FROM ('2027-01-01') TO ('2099-01-01');

-- ─── MESSAGE STATS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_stats (
  session_id      UUID           REFERENCES sessions(id) ON DELETE CASCADE,
  sender          TEXT           NOT NULL,
  message_count   INT            DEFAULT 0,
  avg_sentiment   NUMERIC(4,3),
  avg_word_count  NUMERIC(8,2),
  peak_hour       INT,
  media_count     INT            DEFAULT 0,
  PRIMARY KEY (session_id, sender)
);

-- ─── LLM USAGE TRACKING ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_usage (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  model             TEXT        NOT NULL,
  prompt_tokens     INT,
  completion_tokens INT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_user     ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_app      ON sessions(source_app);
CREATE INDEX IF NOT EXISTS idx_messages_session  ON messages_meta(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages_meta(sender);
CREATE INDEX IF NOT EXISTS idx_messages_ts       ON messages_meta(timestamp);

-- ─── ROW-LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_sessions"   ON sessions;
DROP POLICY IF EXISTS "users_own_messages"   ON messages_meta;
DROP POLICY IF EXISTS "users_own_stats"      ON message_stats;

CREATE POLICY "users_own_sessions"
  ON sessions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_messages"
  ON messages_meta FOR ALL
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

CREATE POLICY "users_own_stats"
  ON message_stats FOR ALL
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

-- ─── READ-ONLY ROLE FOR LLM QUERIES ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'whathappen_readonly') THEN
    CREATE ROLE whathappen_readonly;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO whathappen_readonly;
GRANT SELECT ON sessions, messages_meta, message_stats TO whathappen_readonly;

-- ─── HARDENED SAFE QUERY EXECUTOR ────────────────────────────────────────────
--
-- RAJ-780 / SCHEMA DRIFT WARNING.
--
-- The version previously written here was NOT the version deployed to the live
-- database, and it was dangerous: it concatenated `query_sql` straight into an
-- EXECUTE with no statement-separator filtering, so a payload such as
--     SELECT 1) t; RESET ROLE; <arbitrary SQL>; --
-- broke out of the wrapper and ran as the function owner. Because this file uses
-- CREATE OR REPLACE, re-running it against production would have SILENTLY
-- DOWNGRADED the hardened function back to the exploitable one.
--
-- The definition below is now the hardened one that is actually deployed:
--   * `SET search_path TO ''` — no unqualified object resolution.
--   * Statement separators and comment markers are rejected outright.
--   * Schema-qualified references are rejected, so the query can only reach the
--     three CTEs below.
--   * `session_id_param` is interpolated with %L (literal-quoted), not raw.
--   * The CTEs scope every readable table to the requested session.
--   * Read-only transaction with a 5s statement timeout.
--
-- NOTE: this function is SECURITY DEFINER and performs NO ownership check on
-- `session_id_param`. EXECUTE is therefore revoked from anon/authenticated in
-- supabase/migrations/20260803_0001_raj780_authz_hardening.sql; it is called
-- server-side with the service role only.
CREATE OR REPLACE FUNCTION public.execute_safe_query(query_sql TEXT, session_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  result JSONB;
  scoped_sql TEXT;
BEGIN
  IF session_id_param IS NULL THEN
    RAISE EXCEPTION 'session_id_param is required';
  END IF;

  IF btrim(query_sql) !~* '^SELECT\s' THEN
    RAISE EXCEPTION 'Only SELECT queries permitted';
  END IF;

  IF query_sql ~* '(;|--|/\*|\*/|\mpg_\w|information_schema|\mCOPY\M|\mUNION\M|\mWITH\M|\mINTO\M|\mINSERT\M|\mUPDATE\M|\mDELETE\M|\mDROP\M|\mALTER\M|\mCREATE\M|\mGRANT\M|\mREVOKE\M|\mTRUNCATE\M|dblink|current_setting|set_config|query_to_xml|lo_import|lo_export)' THEN
    RAISE EXCEPTION 'Blocked pattern in query';
  END IF;

  IF query_sql ~* '\m(public|pg_catalog|auth|information_schema)\.' THEN
    RAISE EXCEPTION 'Schema-qualified references are not permitted';
  END IF;

  scoped_sql := format(
      'WITH sessions AS (SELECT * FROM public.sessions WHERE id = %1$L), '
      || 'messages_meta AS (SELECT * FROM public.messages_meta WHERE session_id = %1$L), '
      || 'message_stats AS (SELECT * FROM public.message_stats WHERE session_id = %1$L) '
      || 'SELECT jsonb_agg(row_to_json(t)) FROM ( %2$s ) t',
      session_id_param, query_sql
  );

  PERFORM set_config('statement_timeout', '5000', true);
  PERFORM set_config('default_transaction_read_only', 'on', true);

  EXECUTE scoped_sql INTO result;
  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.execute_safe_query(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_safe_query(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.execute_safe_query(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_safe_query(text, uuid) TO service_role;
