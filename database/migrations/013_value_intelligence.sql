-- Phase 9 value intelligence. A value event is not an AI activity event;
-- it requires an evidence link, attribution and explicit provenance.
CREATE TABLE IF NOT EXISTS value_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  department text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('question_resolved', 'manual_task_eliminated', 'workflow_completed', 'approval_accelerated', 'incident_resolved', 'decision_accelerated', 'knowledge_gap_closed', 'duplicate_work_avoided', 'process_cycle_time_reduced', 'risk_identified', 'risk_mitigated', 'customer_response_accelerated')),
  title text NOT NULL,
  linked_resource text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL CHECK (status IN ('measured', 'estimated', 'projected', 'not_measured')),
  confidence text NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN')),
  attribution text NOT NULL CHECK (attribution IN ('DIRECT', 'STRONGLY_ASSOCIATED', 'PARTIALLY_ATTRIBUTABLE', 'ESTIMATED', 'UNKNOWN')),
  minutes_saved numeric,
  value_usd numeric,
  cost_usd numeric,
  before_metrics jsonb NOT NULL DEFAULT '[]',
  after_metrics jsonb NOT NULL DEFAULT '[]',
  provenance text NOT NULL CHECK (provenance IN ('synthetic', 'development_observed', 'production_observed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_value_events_tenant_time ON value_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_value_events_tenant_kind ON value_events (tenant_id, kind, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_value_events_tenant_department ON value_events (tenant_id, department, created_at DESC);
ALTER TABLE value_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON value_events;
CREATE POLICY tenant_isolation ON value_events USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
