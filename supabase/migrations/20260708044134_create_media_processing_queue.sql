-- Migration: Create Media Processing Queue Table
-- Ticket: RAJ-645

CREATE TABLE IF NOT EXISTS public.media_processing_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and define access policy
ALTER TABLE public.media_processing_queue ENABLE ROW LEVEL SECURITY;
-- CodeRabbit CRITICAL, 2026-08-10: the original policy here was
--   CREATE POLICY "Enable all access for service role" ... FOR ALL USING (true) WITH CHECK (true);
-- With no TO clause PostgreSQL applies a policy to PUBLIC, which includes the
-- anon role. USING (true) WITH CHECK (true) would therefore have let any
-- unauthenticated PostgREST caller read and modify every queue row. The name
-- said service role; the grant said everyone.
--
-- service_role bypasses RLS entirely and needs no policy at all, so the correct
-- fix is to have none. RLS stays enabled, which denies everything else by
-- default. Verified against the live database on 2026-08-10: this policy was
-- never applied there, so this is a latent defect in the migration file rather
-- than a live exposure.
DROP POLICY IF EXISTS "Enable all access for service role" ON public.media_processing_queue;
