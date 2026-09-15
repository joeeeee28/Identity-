-- Phase 8 operating-intelligence contracts: signals, decisions, actions, outcomes,
-- organizational memory and process observations. Content remains tenant-scoped.
CREATE TABLE IF NOT EXISTS operating_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  purpose text NOT NULL,
  source_ref text NOT NULL,
  source_mode text NOT NULL CHECK (source_mode IN ('indexed', 'live', 'event', 'mixed')),
  classification text NOT NULL CHECK (classification IN ('Public', 'Internal', 'Confidential', 'Restricted')),
  owner_name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  state text NOT NULL CHECK (state IN ('normal', 'unusual', 'important', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  priority_score integer NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  affected_users integer,
  business_impact integer NOT NULL DEFAULT 1 CHECK (business_impact BETWEEN 1 AND 5),
  urgency integer NOT NULL DEFAULT 1 CHECK (urgency BETWEEN 1 AND 5),
  risk integer NOT NULL DEFAULT 1 CHECK (risk BETWEEN 1 AND 5),
  detected_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '[]',
  recommended_action text NOT NULL,
  provenance text NOT NULL DEFAULT 'measured' CHECK (provenance IN ('measured', 'synthetic', 'estimated', 'projected', 'not_measured')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operating_signals_tenant_priority ON operating_signals (tenant_id, status, priority_score DESC, detected_at DESC);

CREATE TABLE IF NOT EXISTS decision_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  context_redacted text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]',
  alternatives jsonb NOT NULL DEFAULT '[]',
  recommendation text NOT NULL,
  decision text,
  decision_maker uuid REFERENCES users(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  proposed_workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  risk text NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  classification text NOT NULL CHECK (classification IN ('Public', 'Internal', 'Confidential', 'Restricted')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'action_pending', 'completed', 'outcome_recorded')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decision_records_tenant_status ON decision_records (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS decision_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES decision_records(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  execution_id uuid REFERENCES workflow_executions(id) ON DELETE SET NULL,
  status text NOT NULL,
  message text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, decision_id)
);
CREATE INDEX IF NOT EXISTS idx_decision_actions_tenant_status ON decision_actions (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS operating_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES decision_records(id) ON DELETE CASCADE,
  expected text NOT NULL,
  actual text NOT NULL,
  before_metrics jsonb NOT NULL DEFAULT '[]',
  after_metrics jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL CHECK (status IN ('measured', 'expected', 'not_measured', 'failed')),
  evidence jsonb NOT NULL DEFAULT '[]',
  provenance text NOT NULL DEFAULT 'measured' CHECK (provenance IN ('measured', 'synthetic', 'estimated', 'projected', 'not_measured')),
  measured_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operating_outcomes_tenant_time ON operating_outcomes (tenant_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS organizational_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  memory_type text NOT NULL CHECK (memory_type IN ('decision', 'policy', 'process', 'meeting', 'lesson', 'outcome', 'event')),
  title text NOT NULL,
  summary text NOT NULL,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source_ref text NOT NULL,
  memory_date timestamptz NOT NULL DEFAULT now(),
  authority text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('Public', 'Internal', 'Confidential', 'Restricted')),
  permissions jsonb NOT NULL DEFAULT '[]',
  retention_label text NOT NULL,
  version_label text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
  provenance text NOT NULL DEFAULT 'measured' CHECK (provenance IN ('measured', 'synthetic', 'estimated', 'projected', 'not_measured')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizational_memory_tenant_date ON organizational_memory (tenant_id, status, memory_date DESC);

CREATE TABLE IF NOT EXISTS process_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  department text NOT NULL,
  current_state text NOT NULL,
  owner_name text NOT NULL,
  cycle_time_hours numeric,
  wait_time_hours numeric,
  rework_rate numeric,
  failure_rate numeric,
  escalations integer,
  manual_steps integer,
  automation_rate numeric,
  bottleneck text NOT NULL,
  recommendation text NOT NULL,
  provenance text NOT NULL DEFAULT 'measured' CHECK (provenance IN ('measured', 'synthetic', 'estimated', 'projected', 'not_measured')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_process_observations_tenant_time ON process_observations (tenant_id, observed_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['operating_signals','decision_records','decision_actions','operating_outcomes','organizational_memory','process_observations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant())', table_name);
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['operating_signals','decision_records','organizational_memory','process_observations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION smart_corp_touch_updated_at()', table_name, table_name);
  END LOOP;
END $$;
