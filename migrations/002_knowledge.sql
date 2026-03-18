-- Knowledge base para RAG

-- Habilitar pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de conocimiento
CREATE TABLE IF NOT EXISTS adpilot_knowledge (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL, -- 'campaign_result', 'best_practice', 'user_feedback', 'optimization'
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(1536), -- OpenAI text-embedding-3-small
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índice para búsqueda por similitud
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON adpilot_knowledge
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON adpilot_knowledge(category);

-- Función de búsqueda por similitud
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id, k.category, k.title, k.content, k.metadata,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM adpilot_knowledge k
  WHERE (filter_category IS NULL OR k.category = filter_category)
    AND k.embedding IS NOT NULL
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
