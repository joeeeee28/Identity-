-- Phase 6 product-learning telemetry and governed improvement records.
-- Customer content is never copied into product analytics; metadata is redacted at ingestion.
CREATE TABLE IF NOT EXISTS ai_observation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  department text NOT NULL DEFAULT 'Organization',
  kind text NOT NULL CHECK (kind IN ('ai_response', 'search', 'feedback', 'workflow', 'permission_check', 'knowledge_signal')),
  provenance text NOT NULL CHECK (provenance IN ('synthetic_pilot', 'development_observed', 'production_observed')),
  intent text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'safe_refusal', 'clarification', 'failure', 'pending', 'denied')),
  model text,
  agent text,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  input_tokens bigint CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens IS NULL OR output_tokens >= 0),
  feedback_type text,
  failure_category text,
  quality_scores jsonb NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_observation_events_tenant_time ON ai_observation_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_observation_events_tenant_failure ON ai_observation_events (tenant_id, failure_category, created_at DESC);

CREATE TABLE IF NOT EXISTS product_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recommendation_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'accepted', 'deferred', 'rejected')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, recommendation_id)
);
CREATE INDEX IF NOT EXISTS idx_product_recommendations_tenant_status ON product_recommendations (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS product_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  experiment_key text NOT NULL,
  hypothesis text NOT NULL,
  variants jsonb NOT NULL DEFAULT '[]',
  primary_metric text NOT NULL,
  guardrails jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'rolled_back')),
  approval_required boolean NOT NULL DEFAULT true,
  result text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, experiment_key)
);
CREATE INDEX IF NOT EXISTS idx_product_experiments_tenant_status ON product_experiments (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS phase6_benchmark_tasks (
  task_key text PRIMARY KEY,
  benchmark_version text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  persona text NOT NULL,
  department text NOT NULL,
  input text NOT NULL,
  expected_behavior text NOT NULL,
  expected_evidence text NOT NULL,
  expected_action text NOT NULL,
  failure_conditions jsonb NOT NULL DEFAULT '[]',
  evaluation_method text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (benchmark_version, task_key)
);

CREATE TABLE IF NOT EXISTS phase6_benchmark_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  benchmark_version text NOT NULL,
  execution_mode text NOT NULL CHECK (execution_mode IN ('fixture_subset', 'tenant_pilot', 'production_regression')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'approval_required')),
  total_tasks integer NOT NULL DEFAULT 0,
  executed_tasks integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS phase6_benchmark_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES phase6_benchmark_runs(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'not_run', 'blocked')),
  scores jsonb NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '[]',
  failure_category text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id, task_key)
);
CREATE INDEX IF NOT EXISTS idx_phase6_benchmark_runs_tenant_time ON phase6_benchmark_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase6_benchmark_results_run ON phase6_benchmark_results (tenant_id, run_id, task_key);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_observation_events','product_recommendations','product_experiments','phase6_benchmark_runs','phase6_benchmark_results'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant())', table_name);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS product_experiments_updated_at ON product_experiments;
CREATE TRIGGER product_experiments_updated_at BEFORE UPDATE ON product_experiments FOR EACH ROW EXECUTE FUNCTION smart_corp_touch_updated_at();
