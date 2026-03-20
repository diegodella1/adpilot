-- Migration 005: Campaign management - ad group metrics table
-- Supports Phase 6: Optimizer rules at ad group granularity

CREATE TABLE IF NOT EXISTS adpilot_ad_group_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id text NOT NULL,
  ad_group_id text NOT NULL,
  ad_group_name text,
  date date NOT NULL,
  impressions int DEFAULT 0,
  clicks int DEFAULT 0,
  conversions numeric(10,2) DEFAULT 0,
  cost_micros bigint DEFAULT 0,
  cpa_micros bigint DEFAULT 0,
  ctr numeric(8,4) DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES adpilot_users(id),
  UNIQUE(user_id, ad_group_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ad_group_metrics_campaign ON adpilot_ad_group_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_group_metrics_user_date ON adpilot_ad_group_metrics(user_id, date);
