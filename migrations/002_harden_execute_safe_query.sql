-- WhatHappen migration 002 — harden execute_safe_query() (P0 four-eyes fix)
--
-- Finding (independent review): session scoping must be enforced by the database,
-- not trusted from the model's SQL. A crafted `WHERE 'a'='$1' OR 1=1` previously
-- widened results. Fix: shadow the base tables with session-filtered CTEs of the
-- same name, so any validated (unqualified) SELECT can only ever read THIS session's
-- rows — independent of its own WHERE clause.
--
-- Layering: (1) app-side validateGeneratedSQL  (2) ai-search route verifies the
-- session belongs to the caller BEFORE calling this  (3) this function.

CREATE OR REPLACE FUNCTION execute_safe_query(query_sql TEXT, session_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  -- Defence-in-depth blocklist (app-side validator is the first layer).
  IF query_sql ~* '(;|--|/\*|\*/|\mpg_\w|information_schema|\mCOPY\M|\mUNION\M|\mWITH\M|\mINTO\M|\mINSERT\M|\mUPDATE\M|\mDELETE\M|\mDROP\M|\mALTER\M|\mCREATE\M|\mGRANT\M|\mREVOKE\M|\mTRUNCATE\M|dblink|current_setting|set_config|query_to_xml|lo_import|lo_export)' THEN
    RAISE EXCEPTION 'Blocked pattern in query';
  END IF;

  -- Reject schema-qualified table references (they would dodge the CTE shadow).
  IF query_sql ~* '\m(public|pg_catalog|auth|information_schema)\.' THEN
    RAISE EXCEPTION 'Schema-qualified references are not permitted';
  END IF;

  -- Force session scope: pre-filtered CTEs shadow the real tables by name.
  scoped_sql := format(
      'WITH sessions AS (SELECT * FROM public.sessions WHERE id = %1$L), '
      || 'messages_meta AS (SELECT * FROM public.messages_meta WHERE session_id = %1$L), '
      || 'message_stats AS (SELECT * FROM public.message_stats WHERE session_id = %1$L) '
      || 'SELECT jsonb_agg(row_to_json(t)) FROM ( %2$s ) t',
      session_id_param, query_sql
  );

  -- Read-only + bounded execution. (DEFINER owns the tables, so the CTE filter —
  -- not RLS — is what guarantees single-session results here.)
  PERFORM set_config('statement_timeout', '5000', true);
  PERFORM set_config('default_transaction_read_only', 'on', true);

  EXECUTE scoped_sql INTO result;
  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

-- Keep execution limited to the application roles only.
REVOKE ALL ON FUNCTION execute_safe_query(TEXT, UUID) FROM PUBLIC;
