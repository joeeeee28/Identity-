-- Allowlisted structured-data surface. Application code may query only known
-- metric_group values; it must not turn arbitrary user text into SQL.
CREATE TABLE IF NOT EXISTS structured_metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_group text NOT NULL,
  dimension text NOT NULL,
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metric_value numeric NOT NULL,
  delta_percent numeric,
  classification text NOT NULL DEFAULT 'Internal' CHECK (classification IN ('Public', 'Internal', 'Confidential', 'Restricted', 'Highly Restricted')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, metric_group, dimension, period_start)
);
CREATE INDEX IF NOT EXISTS idx_structured_metrics_lookup ON structured_metric_values (tenant_id, metric_group, period_start, metric_value DESC);
DROP TRIGGER IF EXISTS structured_metric_values_updated_at ON structured_metric_values;
CREATE TRIGGER structured_metric_values_updated_at BEFORE UPDATE ON structured_metric_values FOR EACH ROW EXECUTE FUNCTION smart_corp_touch_updated_at();
ALTER TABLE structured_metric_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON structured_metric_values;
CREATE POLICY tenant_isolation ON structured_metric_values USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
