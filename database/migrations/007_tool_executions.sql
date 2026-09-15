CREATE TABLE IF NOT EXISTS tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_key text NOT NULL,
  requested_by uuid REFERENCES users(id),
  risk_level text NOT NULL,
  status text NOT NULL,
  approval_required boolean NOT NULL DEFAULT false,
  input_redacted jsonb NOT NULL DEFAULT '{}',
  output_redacted jsonb,
  error_code text,
  error_message text,
  workflow_execution_id uuid REFERENCES workflow_executions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tool_executions_tenant_time ON tool_executions (tenant_id, created_at DESC);
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tool_executions;
CREATE POLICY tenant_isolation ON tool_executions USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
