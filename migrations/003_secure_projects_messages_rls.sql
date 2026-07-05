-- P0 security hardening for legacy project chat tables.
-- Adds owner linkage and enforces tenant isolation via RLS.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);

-- Backfill message ownership from project ownership when available.
UPDATE messages m
SET user_id = p.user_id
FROM projects p
WHERE p.id = m.project_id
  AND m.user_id IS NULL
  AND p.user_id IS NOT NULL;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_owner_read ON projects;
DROP POLICY IF EXISTS projects_owner_insert ON projects;
DROP POLICY IF EXISTS projects_owner_update ON projects;
DROP POLICY IF EXISTS projects_owner_delete ON projects;

DROP POLICY IF EXISTS messages_owner_read ON messages;
DROP POLICY IF EXISTS messages_owner_insert ON messages;
DROP POLICY IF EXISTS messages_owner_update ON messages;
DROP POLICY IF EXISTS messages_owner_delete ON messages;

DROP POLICY IF EXISTS ai_conversations_owner_read ON ai_conversations;
DROP POLICY IF EXISTS ai_conversations_owner_insert ON ai_conversations;
DROP POLICY IF EXISTS ai_conversations_owner_update ON ai_conversations;
DROP POLICY IF EXISTS ai_conversations_owner_delete ON ai_conversations;

CREATE POLICY projects_owner_read
  ON projects
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY projects_owner_insert
  ON projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_owner_update
  ON projects
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_owner_delete
  ON projects
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY messages_owner_read
  ON messages
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = messages.project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY messages_owner_insert
  ON messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = messages.project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY messages_owner_update
  ON messages
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = messages.project_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = messages.project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY messages_owner_delete
  ON messages
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = messages.project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY ai_conversations_owner_read
  ON ai_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = ai_conversations.project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY ai_conversations_owner_insert
  ON ai_conversations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = ai_conversations.project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY ai_conversations_owner_update
  ON ai_conversations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = ai_conversations.project_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = ai_conversations.project_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY ai_conversations_owner_delete
  ON ai_conversations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = ai_conversations.project_id
        AND p.user_id = auth.uid()
    )
  );