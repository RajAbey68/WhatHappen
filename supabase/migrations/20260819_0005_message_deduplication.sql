-- RAJ-P1 — message deduplication via content hash
--
-- Adds message_hash column to messages_meta to enable deterministic deduplication.
-- Re-uploads of the same file will skip duplicate messages via UPSERT ... ON CONFLICT.
--
-- Idempotent. Safe to re-run.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

-- Add message_hash column if it doesn't exist
ALTER TABLE public.messages_meta
  ADD COLUMN IF NOT EXISTS message_hash TEXT;

-- Create a unique constraint on (session_id, message_hash) to enforce deduplication
-- within a session. This allows the same message in different sessions.
ALTER TABLE public.messages_meta
  DROP CONSTRAINT IF EXISTS messages_meta_session_hash_unique;

ALTER TABLE public.messages_meta
  ADD CONSTRAINT messages_meta_session_hash_unique
  UNIQUE (session_id, message_hash);

-- Create an index for faster lookups by message_hash
CREATE INDEX IF NOT EXISTS idx_messages_meta_hash ON public.messages_meta(message_hash);

COMMIT;
