-- P2-C: Intelligent model routing — governed registry, policies, and decision
-- ledger. Model IDENTITY lives in the static catalog (server/ai/models.ts); these
-- tables store the per-tenant POLICY/STATUS overlay (approval, health, allowed
-- data classifications, cost) and the routing-decision audit trail.

-- Per-tenant model status/policy overlay (merged with the static catalog).
CREATE TABLE IF NOT EXISTS model_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','degraded','disabled','retired','pending_approval')),
  approval text NOT NULL DEFAULT 'pending' CHECK (approval IN ('approved','pending','denied')),
  health text NOT NULL DEFAULT 'healthy' CHECK (health IN ('healthy','degraded','unavailable')),
  allowed_classifications text[] NOT NULL DEFAULT '{Public,Internal,Confidential}'::text[],
  latency_class text NOT NULL DEFAULT 'standard' CHECK (latency_class IN ('fast','standard','slow')),
  quality_class text NOT NULL DEFAULT 'balanced' CHECK (quality_class IN ('fast','balanced','frontier')),
  input_cost_usd_per_million numeric(12,4),
  output_cost_usd_per_million numeric(12,4),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, model_id)
);
CREATE INDEX IF NOT EXISTS idx_model_registry_tenant ON model_registry (tenant_id, status, approval);
ALTER TABLE model_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON model_registry;
CREATE POLICY tenant_isolation ON model_registry USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- Tenant routing policy (a single active policy per tenant for now).
CREATE TABLE IF NOT EXISTS model_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  allowed_providers text[] NOT NULL DEFAULT '{openai,anthropic,google}'::text[],
  prefer_lowest_cost boolean NOT NULL DEFAULT true,
  max_cost_per_request_cents numeric(12,2),
  max_latency_class text NOT NULL DEFAULT 'standard' CHECK (max_latency_class IN ('fast','standard','slow')),
  allow_fallback boolean NOT NULL DEFAULT true,
  high_risk_requires_frontier boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_key)
);
ALTER TABLE model_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON model_policies;
CREATE POLICY tenant_isolation ON model_policies USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- Persisted routing decisions (audit + cost/telemetry reconciliation).
CREATE TABLE IF NOT EXISTS routing_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id text,
  actor_id uuid REFERENCES users(id),
  task text NOT NULL,
  complexity text NOT NULL,
  risk text NOT NULL,
  classification text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  policy text,
  reason_category text NOT NULL,
  fallback_chain text[] NOT NULL DEFAULT '{}'::text[],
  estimated_cost_cents numeric(12,4),
  fail_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_tenant_time ON routing_decisions (tenant_id, created_at DESC);
ALTER TABLE routing_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON routing_decisions;
CREATE POLICY tenant_isolation ON routing_decisions USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
