-- WhatsApp live-sync hardening (Option C1: baileys-core ingest).
-- Fixes three pre-integration data-model issues:
--  1. source_id type conflict: 20260906 added TEXT, 20260907's UUID add was a no-op.
--     Convert to UUID where valid so the FK actually enforces.
--  2. occurred_at: messages.timestamp is TEXT (legacy WhatsApp export strings).
--     Add TIMESTAMPTZ for reliable ordering/filtering of live-synced ISO timestamps.
--  3. Indexes for sync hot paths (idempotent upsert + per-chat pull).

-- 1. Null out non-UUID junk before type conversion (invalid TEXT -> NULL, never fail migration)
UPDATE public.messages SET source_id = NULL
WHERE source_id IS NOT NULL
  AND source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Convert TEXT -> UUID (no-op if already UUID)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'source_id'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE public.messages ALTER COLUMN source_id TYPE uuid USING source_id::uuid;
  END IF;
END $$;

-- FK (no-op if already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_source_id_fkey') THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_source_id_fkey FOREIGN KEY (source_id)
      REFERENCES public.sources(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. occurred_at for live sync (ISO timestamps from Baileys)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

-- Backfill: ISO-parseable timestamp TEXT -> occurred_at (best-effort, never fail)
UPDATE public.messages SET occurred_at = timestamp::timestamptz
WHERE occurred_at IS NULL
  AND timestamp ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T';

-- 3. Indexes for sync hot paths
CREATE INDEX IF NOT EXISTS idx_messages_project_occurred ON public.messages (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_project_remote_jid ON public.messages (project_id, remote_jid);
CREATE INDEX IF NOT EXISTS idx_messages_project_message_id ON public.messages (project_id, message_id);
