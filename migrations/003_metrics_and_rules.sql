-- Fase 2+3: Métricas, reglas de optimización

-- Cache de métricas (sync desde Google Ads)
CREATE TABLE IF NOT EXISTS adpilot_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  campaign_status text DEFAULT 'UNKNOWN',
  date date NOT NULL,
  impressions int DEFAULT 0,
  clicks int DEFAULT 0,
  conversions numeric(10,2) DEFAULT 0,
  cost_micros bigint DEFAULT 0,
  cpc_micros bigint DEFAULT 0,
  ctr numeric(8,4) DEFAULT 0,
  conversion_rate numeric(8,4) DEFAULT 0,
  cpa_micros bigint DEFAULT 0,
  roas numeric(10,4) DEFAULT 0,
  conversion_value_micros bigint DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, date)
);

-- Resumen por campaña (materializado por el sync)
CREATE TABLE IF NOT EXISTS adpilot_campaign_summary (
  campaign_id text PRIMARY KEY,
  campaign_name text NOT NULL,
  campaign_status text DEFAULT 'UNKNOWN',
  budget_micros bigint DEFAULT 0,
  bidding_strategy text,
  -- Últimos 7 días
  spend_7d_micros bigint DEFAULT 0,
  clicks_7d int DEFAULT 0,
  impressions_7d int DEFAULT 0,
  conversions_7d numeric(10,2) DEFAULT 0,
  cpa_7d_micros bigint DEFAULT 0,
  ctr_7d numeric(8,4) DEFAULT 0,
  roas_7d numeric(10,4) DEFAULT 0,
  -- Últimos 30 días
  spend_30d_micros bigint DEFAULT 0,
  clicks_30d int DEFAULT 0,
  impressions_30d int DEFAULT 0,
  conversions_30d numeric(10,2) DEFAULT 0,
  cpa_30d_micros bigint DEFAULT 0,
  ctr_30d numeric(8,4) DEFAULT 0,
  roas_30d numeric(10,4) DEFAULT 0,
  -- Alertas
  alerts jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Reglas de optimización
CREATE TABLE IF NOT EXISTS adpilot_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  enabled boolean DEFAULT true,
  -- Condición: {"metric": "cpa_7d", "operator": ">", "value": 10, "scope": "campaign"}
  condition jsonb NOT NULL,
  -- Acción: {"type": "pause_campaign|adjust_bid|alert|pause_keyword", "params": {...}}
  action jsonb NOT NULL,
  auto_execute boolean DEFAULT false, -- true = ejecutar sin aprobación
  last_triggered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Log de optimizaciones ejecutadas
CREATE TABLE IF NOT EXISTS adpilot_optimization_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id uuid REFERENCES adpilot_rules(id),
  campaign_id text,
  campaign_name text,
  action text NOT NULL,
  status text NOT NULL, -- 'pending', 'approved', 'executed', 'rejected', 'failed'
  recommendation text, -- Texto legible de la recomendación
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_metrics_campaign_date ON adpilot_metrics(campaign_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_date ON adpilot_metrics(date DESC);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON adpilot_rules(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_optim_logs_status ON adpilot_optimization_logs(status);
CREATE INDEX IF NOT EXISTS idx_optim_logs_created ON adpilot_optimization_logs(created_at DESC);

-- Permisos
GRANT ALL ON adpilot_metrics TO service_role, anon;
GRANT ALL ON adpilot_campaign_summary TO service_role, anon;
GRANT ALL ON adpilot_rules TO service_role, anon;
GRANT ALL ON adpilot_optimization_logs TO service_role, anon;
