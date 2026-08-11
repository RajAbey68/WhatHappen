-- RAJ-780 — authorization hardening.
--
-- Idempotent. Safe to run against the live database more than once.
--
-- Context: every server route uses the service-role key (`getServiceClient()`),
-- which BYPASSES row-level security. RLS therefore protects only direct
-- PostgREST access with the public anon key, not the application's own API.
-- The application-layer fix lives in lib/api-auth.ts; this migration closes the
-- database-layer gaps that remain.

-- Bound how long we are willing to wait for the ACCESS EXCLUSIVE locks that
-- ALTER TABLE / ENABLE ROW LEVEL SECURITY take. Without this, a long-running
-- reader can make these statements queue behind it and block every subsequent
-- query on the table, exhausting the API connection pool. Failing fast and
-- retrying during a quiet window is strictly better than a stalled table.
SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─── 1. Project ownership column ─────────────────────────────────────────────
-- `projects.user_id` already exists in the live database and is what the
-- `users_own_projects` policy keys on, but it is absent from the repo's
-- supabase_schema.sql. Adding it here idempotently so a rebuild from source
-- cannot produce a database without it.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);

-- ─── 2. RLS on the project-scoped tables ─────────────────────────────────────
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_projects"      ON public.projects;
DROP POLICY IF EXISTS "users_own_messages"      ON public.messages;
DROP POLICY IF EXISTS "users_own_conversations" ON public.ai_conversations;

CREATE POLICY "users_own_projects"
  ON public.projects FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_messages"
  ON public.messages FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE auth.uid() = user_id));

CREATE POLICY "users_own_conversations"
  ON public.ai_conversations FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE auth.uid() = user_id));

-- ─── 3. execute_safe_query must not be reachable by anonymous callers ────────
-- The function is SECURITY DEFINER, so it runs as its owner and bypasses RLS.
-- It filters only on the caller-supplied `session_id_param` and performs NO
-- ownership check, so any caller able to execute it can read the metadata of any
-- session whose UUID they hold. It is called server-side only (app/api/ai-search),
-- which uses the service role — so `anon` and `authenticated` do not need EXECUTE.
REVOKE ALL ON FUNCTION public.execute_safe_query(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_safe_query(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.execute_safe_query(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_safe_query(text, uuid) TO service_role;

-- ─── 4. Pin the trigger function's search_path ───────────────────────────────
-- Flagged by the Supabase security linter (0011_function_search_path_mutable):
-- a mutable search_path lets a caller with CREATE on a schema earlier in the
-- path shadow a referenced object.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
