-- Migration 006: Lead capture table for landing page free trial requests

CREATE TABLE IF NOT EXISTS adpilot_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  use_case text,
  role text,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON adpilot_leads(status);
