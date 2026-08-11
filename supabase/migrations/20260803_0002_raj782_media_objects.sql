-- RAJ-782 — media_objects: the record of what was uploaded and when it expires.
--
-- Idempotent. Safe to re-run.
--
-- Replaces the never-applied `media_processing_queue` as the source of truth for
-- stored files. That table's migration was never run against the live database,
-- which is why BOTH purge paths (project delete and /api/projects/[id]/media)
-- currently query a non-existent table, catch the error, log a warning, and
-- report success while deleting nothing.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.media_objects (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path     TEXT        NOT NULL,
  -- 'supabase' while in the hot tier, 'gcs' once the sweep has archived it.
  storage_provider TEXT        NOT NULL DEFAULT 'supabase'
                                 CHECK (storage_provider IN ('supabase', 'gcs')),
  file_name        TEXT        NOT NULL,
  file_size_bytes  BIGINT,
  mime_type        TEXT,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the retention sweep may archive this object to GCS.
  expires_at       TIMESTAMPTZ NOT NULL,
  archived_at      TIMESTAMPTZ,
  -- RAJ-783 (legal hold): an object under hold is NEVER swept, regardless of
  -- expires_at. Auto-deleting material relevant to a live dispute is
  -- spoliation; this column is the mechanism that prevents it. The sweep must
  -- filter on it, and that filter must be covered by a test.
  legal_hold       BOOLEAN     NOT NULL DEFAULT false,
  UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_media_objects_project ON public.media_objects(project_id);

-- Partial index: the sweep only ever scans un-archived, un-held rows.
CREATE INDEX IF NOT EXISTS idx_media_objects_sweep
  ON public.media_objects(expires_at)
  WHERE archived_at IS NULL AND legal_hold = false;

ALTER TABLE public.media_objects ENABLE ROW LEVEL SECURITY;

-- Mirrors the users_own_* policies on the other project-scoped tables. Note the
-- application itself uses the service-role key and bypasses RLS entirely; this
-- protects direct PostgREST access with the public anon key only.
DROP POLICY IF EXISTS "users_own_media_objects" ON public.media_objects;
CREATE POLICY "users_own_media_objects"
  ON public.media_objects FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE auth.uid() = user_id));

-- Per-project retention window, surfaced in the UI. Default 7 days, which is
-- what the product was believed to already do.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archive_days INTEGER NOT NULL DEFAULT 7
    CHECK (archive_days >= 0 AND archive_days <= 3650);

COMMIT;
