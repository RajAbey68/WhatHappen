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
CREATE OR REPLACE FUNCTION execute_safe_query(query_sql TEXT, session_id_param UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  IF NOT (query_sql ILIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries permitted';
  END IF;

  IF query_sql ~* '(pg_sleep|pg_read_file|pg_catalog|pg_class|COPY\s|information_schema|1/0|UNION\s)' THEN
    RAISE EXCEPTION 'Blocked pattern in query';
  END IF;

  -- Execute as read-only role with 1000-row cap
  SET LOCAL ROLE whathappen_readonly;
  EXECUTE
    'SELECT jsonb_agg(row_to_json(t)) FROM (' || query_sql || ' LIMIT 1000) t'
    INTO result;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;
