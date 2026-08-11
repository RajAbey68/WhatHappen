-- RAJ-782 (follow-up) — let a session point at a Supabase Storage object.
--
-- APPLIED TO PRODUCTION 2026-08-03. Purely additive; no existing column or
-- constraint is altered.
--
-- WHY: `process-file` RECONSTRUCTED the object location as
--   uploads/${sessions.user_id}/${sessionId}/${sessions.file_name}
-- in GCS. Objects in the new `evidence` Supabase bucket are not at that path
-- and never could be, so a file would upload successfully and then never be
-- processed. Four-eyes review caught this after the first version of the fix
-- shipped green tests: every test mocked storage, so none of them exercised the
-- contract between the route, the client and process-file.
--
-- The path is now recorded explicitly instead of derived.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS storage_provider TEXT
    CHECK (storage_provider IS NULL OR storage_provider IN ('supabase', 'gcs'));

-- Confirms the bytes actually landed. A row minted by /api/upload-url is only a
-- promise of an upload; without this the retention sweep would archive objects
-- that were never written.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS upload_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_project ON public.sessions(project_id);

-- Same reasoning for media_objects.
ALTER TABLE public.media_objects
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploaded', 'archived', 'failed'));

-- NOTE: `sessions.user_id` remains NOT NULL. There is no login UI, so no real
-- user can own a session; rather than weaken the constraint on a production
-- table, /api/upload-url writes a deterministic uuidv5 derived from projectId.
-- Same project always yields the same id, so rows stay groupable and the
-- constraint keeps its meaning.
