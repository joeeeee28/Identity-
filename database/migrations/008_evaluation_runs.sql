CREATE TABLE IF NOT EXISTS ai_evaluation_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version text NOT NULL,
  description text,
  case_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version)
);
CREATE TABLE IF NOT EXISTS ai_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES ai_evaluation_datasets(id),
  dataset_version text NOT NULL,
  provider text,
  model text,
  status text NOT NULL DEFAULT 'completed',
  metrics jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_evaluation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES ai_evaluation_runs(id) ON DELETE CASCADE,
  case_key text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL,
  passed boolean NOT NULL,
  latency_ms integer NOT NULL DEFAULT 0,
  intent text,
  response_type text,
  trust_label text,
  citation_count integer NOT NULL DEFAULT 0,
  structured boolean NOT NULL DEFAULT false,
  source_ids jsonb NOT NULL DEFAULT '[]',
  failures jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id, case_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_evaluation_runs_tenant_time ON ai_evaluation_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_evaluation_cases_run ON ai_evaluation_cases (tenant_id, run_id, case_key);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_evaluation_datasets','ai_evaluation_runs','ai_evaluation_cases'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant())', table_name);
  END LOOP;
END $$;
