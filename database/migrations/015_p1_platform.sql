-- P1 platform capabilities: webhook delivery, agent version deployments,
-- scheduled executions, and provider-linked AI cost ledger. All tenant-owned
-- tables carry tenant_id and RLS.

-- ---------------------------------------------------------------------------
-- 1. Webhook endpoints + delivery history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret_hash text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, url)
);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON webhook_endpoints (tenant_id, status);
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON webhook_endpoints;
CREATE POLICY tenant_isolation ON webhook_endpoints USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_response_status integer,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, endpoint_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_dispatch ON webhook_deliveries (status, available_at, created_at) WHERE status IN ('pending');
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON webhook_deliveries;
CREATE POLICY tenant_isolation ON webhook_deliveries USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- ---------------------------------------------------------------------------
-- 2. Agent version deployments (rollback support)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  version_id uuid REFERENCES agent_versions(id) ON DELETE SET NULL,
  version_label text NOT NULL,
  model_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rolled_back')),
  deployed_by uuid REFERENCES users(id),
  reason text,
  deployed_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_deployments_agent_time ON agent_deployments (tenant_id, agent_id, deployed_at DESC);
ALTER TABLE agent_deployments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_deployments;
CREATE POLICY tenant_isolation ON agent_deployments USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- ---------------------------------------------------------------------------
-- 3. Scheduled executions (recurring agent/workflow runs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES workflows(id) ON DELETE CASCADE,
  schedule text NOT NULL,               -- e.g. 'every 1 hour', cron expression
  interval_seconds integer NOT NULL DEFAULT 3600,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running')),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_run_status text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (agent_id IS NOT NULL OR workflow_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_due ON scheduled_executions (tenant_id, next_run_at) WHERE enabled AND status = 'idle';
ALTER TABLE scheduled_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON scheduled_executions;
CREATE POLICY tenant_isolation ON scheduled_executions USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- ---------------------------------------------------------------------------
-- 4. Provider-linked AI cost ledger (estimated vs actual, budget reconciliation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_cents numeric(12,4) NOT NULL DEFAULT 0,
  actual_cost_cents numeric(12,4),
  kind text NOT NULL DEFAULT 'estimated' CHECK (kind IN ('estimated', 'actual')),
  agent_id uuid,
  workflow_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_tenant_time ON ai_cost_ledger (tenant_id, recorded_at DESC);
ALTER TABLE ai_cost_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ai_cost_ledger;
CREATE POLICY tenant_isolation ON ai_cost_ledger USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
