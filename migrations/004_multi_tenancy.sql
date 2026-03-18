-- 004_multi_tenancy.sql — Multi-tenancy support

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS adpilot_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name text,
  role text NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  enabled boolean DEFAULT true,
  llm_monthly_limit_usd numeric(10,2) DEFAULT 10.00,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- user_id en todas las tablas existentes
ALTER TABLE adpilot_conversations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adpilot_users(id);
ALTER TABLE adpilot_campaign_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adpilot_users(id);
ALTER TABLE adpilot_knowledge ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adpilot_users(id);
ALTER TABLE adpilot_metrics ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adpilot_users(id);
ALTER TABLE adpilot_campaign_summary ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adpilot_users(id);
ALTER TABLE adpilot_rules ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adpilot_users(id);
ALTER TABLE adpilot_optimization_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adpilot_users(id);

-- Settings: agregar user_id (NULL = global, non-NULL = per-user)
ALTER TABLE adpilot_settings DROP CONSTRAINT IF EXISTS adpilot_settings_pkey;
ALTER TABLE adpilot_settings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adpilot_users(id);

-- Indices parciales para settings: unique per key+user o key global
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key_user ON adpilot_settings(key, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key_global ON adpilot_settings(key) WHERE user_id IS NULL;

-- Indices de filtrado por user_id
CREATE INDEX IF NOT EXISTS idx_conversations_user ON adpilot_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_user ON adpilot_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_metrics_user ON adpilot_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_summary_user ON adpilot_campaign_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_rules_user ON adpilot_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_user ON adpilot_campaign_logs(user_id);

-- Metrics unique: ahora per-user (drop old constraint first)
ALTER TABLE adpilot_metrics DROP CONSTRAINT IF EXISTS adpilot_metrics_campaign_id_date_key;
DROP INDEX IF EXISTS adpilot_metrics_campaign_id_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_user_campaign_date ON adpilot_metrics(user_id, campaign_id, date);

-- Campaign summary: cambiar PK a composite con user_id
ALTER TABLE adpilot_campaign_summary DROP CONSTRAINT IF EXISTS adpilot_campaign_summary_pkey;
ALTER TABLE adpilot_campaign_summary ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
DO $$ BEGIN
  ALTER TABLE adpilot_campaign_summary ADD PRIMARY KEY (id);
EXCEPTION WHEN others THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_user_campaign ON adpilot_campaign_summary(user_id, campaign_id);

-- LLM usage tracking per-user
CREATE TABLE IF NOT EXISTS adpilot_llm_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES adpilot_users(id),
  model text NOT NULL,
  prompt_tokens int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  total_tokens int NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6) DEFAULT 0,
  endpoint text,  -- 'chat', 'analysis', 'optimizer', 'embedding'
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_user ON adpilot_llm_usage(user_id, created_at);

-- Actualizar match_knowledge para filtrar por user_id
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  filter_category text DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, category text, title text, content text, metadata jsonb, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT k.id, k.category, k.title, k.content, k.metadata,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM adpilot_knowledge k
  WHERE (filter_category IS NULL OR k.category = filter_category)
    AND (filter_user_id IS NULL OR k.user_id = filter_user_id)
    AND k.embedding IS NOT NULL
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
