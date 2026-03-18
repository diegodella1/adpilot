-- AdPilot schema

-- Conversaciones del chat
CREATE TABLE IF NOT EXISTS adpilot_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  state text NOT NULL DEFAULT 'intake',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Logs de ejecuciones de campañas
CREATE TABLE IF NOT EXISTS adpilot_campaign_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES adpilot_conversations(id),
  action text NOT NULL,
  status text NOT NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- Settings (API keys, LLM config, etc.)
CREATE TABLE IF NOT EXISTS adpilot_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_conversations_state ON adpilot_conversations(state);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON adpilot_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_conv ON adpilot_campaign_logs(conversation_id);

-- Settings iniciales
INSERT INTO adpilot_settings (key, value) VALUES
  ('llm_provider', 'openai'),
  ('llm_model', 'gpt-4o-mini'),
  ('llm_api_key', ''),
  ('openrouter_api_key', ''),
  ('openrouter_model', 'openai/gpt-4o-mini')
ON CONFLICT (key) DO NOTHING;
