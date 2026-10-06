-- ==============================================================================
-- Migration: 20260903_learning_rag_schema.sql
-- Description: Adaptive Learning RAG: Lexicon, Golden Q&A Cache, and User Feedback
-- ==============================================================================

CREATE TABLE IF NOT EXISTS rag_lexicon (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  synonyms TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_project_term UNIQUE(project_id, term)
);

CREATE TABLE IF NOT EXISTS rag_golden_qa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  verified_response TEXT NOT NULL,
  cited_message_ids TEXT[] NOT NULL DEFAULT '{}',
  embedding JSONB,
  accuracy_score NUMERIC DEFAULT 1.0,
  verified_by TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_feedback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  golden_qa_id UUID REFERENCES rag_golden_qa(id) ON DELETE SET NULL,
  raw_query TEXT NOT NULL,
  raw_response TEXT,
  feedback_type TEXT NOT NULL, -- 'confirmed', 'corrected', 'disputed'
  user_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_lexicon_project ON rag_lexicon(project_id);
CREATE INDEX IF NOT EXISTS idx_rag_golden_project ON rag_golden_qa(project_id);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_project ON rag_feedback_log(project_id);
