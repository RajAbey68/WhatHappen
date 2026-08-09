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
CREATE POLICY "Enable all access for service role" ON public.media_processing_queue FOR ALL USING (true) WITH CHECK (true);
