-- Migration: Media Enrichment Queue & Distributed Ingestion
-- Ticket: RAJ-784 (Decoupled Hermes Ingestion & Media Queue)

-- lock_timeout 10s: a busy prod database holding locks (long transactions,
-- autovacuum) should not fail the deployment. statement_timeout stays generous.
SET lock_timeout = '10s';
SET statement_timeout = '60s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.media_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  project_id      UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path    TEXT        NOT NULL,
  media_type      TEXT        NOT NULL CHECK (media_type IN ('image', 'audio', 'document', 'other')),
  media_name      TEXT        NOT NULL,
  media_sha256    TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  priority        INTEGER     NOT NULL DEFAULT 1,
  attempts        INTEGER     NOT NULL DEFAULT 0,
  max_attempts    INTEGER     NOT NULL DEFAULT 3,
  locked_by       TEXT,
  locked_at       TIMESTAMPTZ,
  extracted_text  TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast index for queue polling & claim
CREATE INDEX IF NOT EXISTS idx_media_jobs_claim 
  ON public.media_jobs(status, priority DESC, created_at)
  WHERE status = 'pending';

-- Deduplication index on content hash
CREATE INDEX IF NOT EXISTS idx_media_jobs_sha256
  ON public.media_jobs(media_sha256)
  WHERE media_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_jobs_session
  ON public.media_jobs(session_id);

CREATE INDEX IF NOT EXISTS idx_media_jobs_project
  ON public.media_jobs(project_id);

-- Enable RLS
ALTER TABLE public.media_jobs ENABLE ROW LEVEL SECURITY;

-- Helper RPC for atomic claim with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_media_job(
  p_worker_id TEXT,
  p_limit INT DEFAULT 1
)
RETURNS SETOF public.media_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  -- Reaper step: unlock stalled/crashed jobs older than 5 minutes
  UPDATE public.media_jobs
  SET status = 'pending',
      locked_by = NULL,
      locked_at = NULL
  WHERE status = 'processing'
    AND locked_at < now() - interval '5 minutes'
    AND attempts < max_attempts;

  -- Mark expired jobs past max_attempts as failed
  UPDATE public.media_jobs
  SET status = 'failed',
      error_message = 'Exceeded maximum retry attempts'
  WHERE status = 'processing'
    AND locked_at < now() - interval '5 minutes'
    AND attempts >= max_attempts;

  -- Atomic claim with SKIP LOCKED
  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM public.media_jobs
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.media_jobs j
  SET status = 'processing',
      locked_by = p_worker_id,
      locked_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*;
END;
$$;

COMMIT;
