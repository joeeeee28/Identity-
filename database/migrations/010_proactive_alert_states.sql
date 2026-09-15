CREATE TABLE IF NOT EXISTS proactive_alert_states (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('dismissed', 'snoozed')),
  snoozed_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, alert_id)
);
CREATE INDEX IF NOT EXISTS idx_proactive_alert_states_user ON proactive_alert_states (tenant_id, user_id, state, snoozed_until);
ALTER TABLE proactive_alert_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON proactive_alert_states;
CREATE POLICY tenant_isolation ON proactive_alert_states USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
DROP TRIGGER IF EXISTS proactive_alert_states_updated_at ON proactive_alert_states;
CREATE TRIGGER proactive_alert_states_updated_at BEFORE UPDATE ON proactive_alert_states FOR EACH ROW EXECUTE FUNCTION smart_corp_touch_updated_at();
