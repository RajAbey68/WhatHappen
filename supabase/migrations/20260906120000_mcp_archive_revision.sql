-- Monotonic corpus revision: every mutation, including project moves, invalidates cursors.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS archive_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS source_id text;

CREATE OR REPLACE FUNCTION public.bump_archive_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE projects SET archive_revision = archive_revision + 1 WHERE id = OLD.project_id;
    RETURN OLD;
  END IF;
  UPDATE projects SET archive_revision = archive_revision + 1 WHERE id = NEW.project_id;
  IF TG_OP = 'UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    UPDATE projects SET archive_revision = archive_revision + 1 WHERE id = OLD.project_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_archive_revision ON public.messages;
CREATE TRIGGER messages_archive_revision AFTER INSERT OR UPDATE OR DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_archive_revision();

-- A single statement observes revision, exact count, latest timestamp and page
-- in the same MVCC snapshot. Subsequent pages must present the same revision.
CREATE OR REPLACE FUNCTION public.mcp_archive_page(p_project_id uuid, p_offset integer, p_limit integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT jsonb_build_object(
   'revision', p.archive_revision::text,
   'totalMessages', (SELECT count(*) FROM messages WHERE project_id = p.id),
   'archiveLatestMessage', (SELECT max(timestamp) FROM messages WHERE project_id = p.id),
   'rows', COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.timestamp, page.id)
     FROM (SELECT * FROM messages WHERE project_id = p.id ORDER BY timestamp, id
       OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 500)) page), '[]'::jsonb)
 ) FROM projects p WHERE p.id = p_project_id;
$$;
REVOKE ALL ON FUNCTION public.mcp_archive_page(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_archive_page(uuid, integer, integer) TO service_role;

-- TRUNCATE does not fire row triggers; invalidate every project explicitly.
CREATE OR REPLACE FUNCTION public.bump_archive_revision_on_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE projects SET archive_revision = archive_revision + 1;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS messages_archive_revision_truncate ON public.messages;
CREATE TRIGGER messages_archive_revision_truncate AFTER TRUNCATE ON public.messages
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_archive_revision_on_truncate();
