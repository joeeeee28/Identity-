-- P0 production substrate: transactional outbox, kill switch, approvals,
-- governed (reversible) actions, connector syncs, and multi-agent orchestration.
-- All tenant-owned tables carry tenant_id and RLS. outbox_events is an internal
-- relay table (like sessions): it is claimed by the outbox worker across tenants,
-- so it is intentionally NOT row-level secured — it is only ever written from
-- within tenant-scoped transactions and read by the privileged relay worker.

-- ---------------------------------------------------------------------------
-- 1. Transactional outbox
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_outbox_events_dispatch ON outbox_events (status, available_at, created_at) WHERE status IN ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- 2. Runtime autonomy kill switch (per tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kill_switches (
  tenant_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_enforced_at timestamptz
);
ALTER TABLE kill_switches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kill_switches;
CREATE POLICY tenant_isolation ON kill_switches USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- ---------------------------------------------------------------------------
-- 3. Approval lifecycle (extend the existing approvals table in place)
-- ---------------------------------------------------------------------------
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'medium';
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS action_key text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS resource_ref text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES users(id);
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS decision_reason text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS escalation_target uuid REFERENCES users(id);
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS execution_result jsonb;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_approvals_tenant_status ON approvals (tenant_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Governed (reversible) actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS governed_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  resource_ref text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'preview', 'approved', 'executing', 'completed', 'failed', 'rolled_back', 'cancelled')),
  risk_level text NOT NULL,
  dry_run_result jsonb,
  execution_result jsonb,
  verification jsonb,
  rollback jsonb,
  requested_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approval_id uuid REFERENCES approvals(id),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  rolled_back_at timestamptz,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_governed_actions_tenant_status ON governed_actions (tenant_id, status, created_at DESC);
ALTER TABLE governed_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON governed_actions;
CREATE POLICY tenant_isolation ON governed_actions USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- ---------------------------------------------------------------------------
-- 5. Connector sync ledger + synced resource mapping (external id, ACL, mtime)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connector_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  external_path text,
  acl jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text,
  source_mtime timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, connection_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_connector_resources_document ON connector_resources (tenant_id, document_id);
ALTER TABLE connector_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON connector_resources;
CREATE POLICY tenant_isolation ON connector_resources USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
CREATE TABLE IF NOT EXISTS connector_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE SET NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  items_processed integer NOT NULL DEFAULT 0,
  items_failed integer NOT NULL DEFAULT 0,
  cursor text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connector_syncs_tenant_time ON connector_syncs (tenant_id, created_at DESC);
ALTER TABLE connector_syncs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON connector_syncs;
CREATE POLICY tenant_isolation ON connector_syncs USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- ---------------------------------------------------------------------------
-- 6. OIDC identity resolution helpers (SECURITY DEFINER, cross-tenant safe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION smart_corp_find_organization_by_claim(p_claim text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM organizations WHERE id::text = p_claim OR slug = p_claim LIMIT 1
$$;

CREATE OR REPLACE FUNCTION smart_corp_expire_approvals()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH expired AS (
    UPDATE approvals SET status = 'expired' WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= now() RETURNING id
  ) SELECT count(*)::integer FROM expired
$$;

CREATE OR REPLACE FUNCTION smart_corp_upsert_external_user(
  p_tenant_id uuid, p_subject text, p_email text, p_display_name text, p_role_keys text[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE tenant_id = p_tenant_id AND external_subject = p_subject;
  IF v_user_id IS NULL THEN
    INSERT INTO users (tenant_id, email, external_subject, status) VALUES (p_tenant_id, p_email, p_subject, 'active') RETURNING id INTO v_user_id;
    INSERT INTO user_profiles (user_id, tenant_id, display_name) VALUES (v_user_id, p_tenant_id, p_display_name) ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;
  END IF;
  INSERT INTO user_roles (tenant_id, user_id, role_id)
    SELECT p_tenant_id, v_user_id, id FROM roles WHERE tenant_id = p_tenant_id AND key = ANY(p_role_keys)
    ON CONFLICT DO NOTHING;
  RETURN v_user_id;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Multi-agent orchestration runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orchestration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'budget_exceeded', 'timed_out')),
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  depth integer NOT NULL DEFAULT 0,
  budget_used integer NOT NULL DEFAULT 0,
  error_message text,
  requested_by uuid REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orchestration_runs_tenant_time ON orchestration_runs (tenant_id, created_at DESC);
ALTER TABLE orchestration_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON orchestration_runs;
CREATE POLICY tenant_isolation ON orchestration_runs USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
