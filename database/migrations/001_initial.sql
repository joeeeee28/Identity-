-- Smart-Corp AI relational foundation.
-- PostgreSQL is the system of record. Every tenant-owned table carries tenant_id.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'enterprise',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'provisioning')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organization_settings (
  tenant_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  ai_policy text NOT NULL DEFAULT 'citations_required',
  default_classification text NOT NULL DEFAULT 'Internal',
  timezone text NOT NULL DEFAULT 'UTC',
  retention_days integer NOT NULL DEFAULT 365 CHECK (retention_days > 0),
  monthly_ai_budget_cents bigint,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  manager_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'deprovisioned')),
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  external_subject text,
  last_active_at timestamptz,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, external_subject)
);
ALTER TABLE departments ADD CONSTRAINT departments_manager_fk FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  locale text DEFAULT 'en-US',
  timezone text DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS role_permissions (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS user_roles (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, role_id)
);
CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS group_members (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, group_id, user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip_hash text,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  external_id text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  source_name text NOT NULL,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  classification text NOT NULL DEFAULT 'Internal' CHECK (classification IN ('Public', 'Internal', 'Confidential', 'Restricted', 'Highly Restricted')),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'review', 'failed', 'archived')),
  effective_at timestamptz,
  expires_at timestamptz,
  next_review_at timestamptz,
  trust_score numeric(5,2),
  search_vector tsvector,
  deleted_at timestamptz,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  version_label text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes >= 0),
  storage_key text NOT NULL,
  checksum_sha256 text,
  extraction_status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_id, version_number),
  UNIQUE (tenant_id, storage_key)
);
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  section_label text,
  page_number integer,
  content text NOT NULL,
  token_count integer,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_version_id, chunk_index)
);
CREATE TABLE IF NOT EXISTS document_metadata (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, key)
);
CREATE TABLE IF NOT EXISTS document_permissions (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  principal_type text NOT NULL CHECK (principal_type IN ('user', 'group', 'role', 'department')),
  principal_id uuid NOT NULL,
  actions text[] NOT NULL DEFAULT '{read}',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, principal_type, principal_id)
);
CREATE TABLE IF NOT EXISTS document_tags (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, tag)
);
CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('security_scan', 'ingestion', 'ocr', 'embedding', 'indexing', 'reindex')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS document_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_chunk_id uuid NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model_version text NOT NULL,
  dimension integer NOT NULL,
  embedding jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_chunk_id, model_version)
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL, source_type text NOT NULL, status text NOT NULL DEFAULT 'active', owner_id uuid REFERENCES users(id), last_synced_at timestamptz, config jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS knowledge_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL, description text, classification text NOT NULL DEFAULT 'Internal', owner_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL, document_ids uuid[] NOT NULL, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'resolved', 'dismissed')), authority_note text, owner_id uuid REFERENCES users(id), due_at timestamptz, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  question text NOT NULL, frequency integer NOT NULL DEFAULT 1, department_id uuid REFERENCES departments(id), impact text NOT NULL DEFAULT 'medium', owner_id uuid REFERENCES users(id), status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'dismissed')), related_document_ids uuid[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE, reviewer_id uuid REFERENCES users(id), status text NOT NULL DEFAULT 'queued', due_at timestamptz NOT NULL, notes text, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL, severity text NOT NULL DEFAULT 'medium', owner_name text NOT NULL, due_label text NOT NULL, kind text NOT NULL, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL, description text NOT NULL, category text NOT NULL, status text NOT NULL DEFAULT 'draft', version_label text NOT NULL DEFAULT 'v0.1', model_name text NOT NULL, knowledge_source_count integer NOT NULL DEFAULT 0, tool_count integer NOT NULL DEFAULT 0, monthly_queries bigint NOT NULL DEFAULT 0, trust_score numeric(5,2), accent text NOT NULL DEFAULT 'violet', owner_name text NOT NULL, system_prompt_encrypted text, deleted_at timestamptz, created_by uuid REFERENCES users(id), updated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE, version_number integer NOT NULL, version_label text NOT NULL, model_policy jsonb NOT NULL DEFAULT '{}', retrieval_policy jsonb NOT NULL DEFAULT '{}', prompt_version text NOT NULL, status text NOT NULL DEFAULT 'draft', created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, agent_id, version_number)
);
CREATE TABLE IF NOT EXISTS agent_permissions (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE, principal_type text NOT NULL, principal_id uuid NOT NULL, actions text[] NOT NULL DEFAULT '{execute}', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, agent_id, principal_type, principal_id)
);
CREATE TABLE IF NOT EXISTS agent_knowledge_sources (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE, source_id uuid REFERENCES knowledge_sources(id) ON DELETE CASCADE, collection_id uuid REFERENCES knowledge_collections(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), CHECK (source_id IS NOT NULL OR collection_id IS NOT NULL), PRIMARY KEY (tenant_id, agent_id, source_id, collection_id)
);
CREATE TABLE IF NOT EXISTS agent_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE, priority integer NOT NULL DEFAULT 100, condition jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE, tool_key text NOT NULL, permission_key text NOT NULL, input_schema jsonb NOT NULL, enabled boolean NOT NULL DEFAULT false, timeout_ms integer NOT NULL DEFAULT 10000, rate_limit_per_minute integer NOT NULL DEFAULT 10, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, agent_id, tool_key)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, title text, agent_id uuid REFERENCES ai_agents(id), created_by uuid NOT NULL REFERENCES users(id), classification text NOT NULL DEFAULT 'Internal', deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_members (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, role text NOT NULL DEFAULT 'member', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')), content text NOT NULL, content_redacted boolean NOT NULL DEFAULT false, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, conversation_id uuid REFERENCES conversations(id), message_id uuid REFERENCES messages(id), agent_id uuid REFERENCES ai_agents(id), agent_version_id uuid REFERENCES agent_versions(id), provider text NOT NULL, model text NOT NULL, prompt_version text NOT NULL, trust_score numeric(5,2), retrieval_score numeric(5,2), grounding_score numeric(5,2), policy_score numeric(5,2), warnings jsonb NOT NULL DEFAULT '[]', input_tokens integer NOT NULL DEFAULT 0, output_tokens integer NOT NULL DEFAULT 0, latency_ms integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, ai_response_id uuid NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE, document_id uuid REFERENCES documents(id), document_version_id uuid REFERENCES document_versions(id), section_label text, page_number integer, relevance numeric(5,4), excerpt text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, ai_response_id uuid NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE, evidence_type text NOT NULL, claim text NOT NULL, source_ids uuid[] NOT NULL DEFAULT '{}', validation_status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, ai_response_id uuid NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id), feedback_type text NOT NULL CHECK (feedback_type IN ('helpful', 'not_helpful', 'incorrect', 'outdated', 'missing_source', 'wrong_agent', 'other')), comment text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, ai_response_id, user_id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, title text NOT NULL, source text, start_at timestamptz, end_at timestamptz, owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'Internal', status text NOT NULL DEFAULT 'ingested', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meeting_participants (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id), display_name text NOT NULL, speaker_label text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, meeting_id, display_name)
);
CREATE TABLE IF NOT EXISTS meeting_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, storage_key text, transcript_text text, status text NOT NULL DEFAULT 'processing', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meeting_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, summary text NOT NULL, model text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, meeting_id)
);
CREATE TABLE IF NOT EXISTS meeting_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, decision text NOT NULL, owner_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, title text NOT NULL, owner_id uuid REFERENCES users(id), due_at timestamptz, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name text NOT NULL, description text NOT NULL, status text NOT NULL DEFAULT 'draft', trigger_label text NOT NULL, last_run_label text, success_rate numeric(5,2) NOT NULL DEFAULT 0, execution_count bigint NOT NULL DEFAULT 0, requires_approval boolean NOT NULL DEFAULT false, step_count integer NOT NULL DEFAULT 0, deleted_at timestamptz, created_by uuid REFERENCES users(id), updated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE, version_number integer NOT NULL, status text NOT NULL DEFAULT 'draft', created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, workflow_id, version_number)
);
CREATE TABLE IF NOT EXISTS workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE, step_order integer NOT NULL, step_type text NOT NULL, config jsonb NOT NULL, requires_approval boolean NOT NULL DEFAULT false, timeout_seconds integer NOT NULL DEFAULT 300, retry_policy jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, workflow_version_id, step_order)
);
CREATE TABLE IF NOT EXISTS workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, workflow_id uuid NOT NULL REFERENCES workflows(id), workflow_version_id uuid REFERENCES workflow_versions(id), triggered_by uuid REFERENCES users(id), status text NOT NULL DEFAULT 'queued', idempotency_key text NOT NULL, current_step integer, error_code text, error_message text, started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS workflow_execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, workflow_execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE, workflow_step_id uuid REFERENCES workflow_steps(id), status text NOT NULL DEFAULT 'queued', attempt_count integer NOT NULL DEFAULT 0, input jsonb, output jsonb, error_message text, started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, workflow_execution_id uuid REFERENCES workflow_executions(id), requested_by uuid REFERENCES users(id), approver_id uuid REFERENCES users(id), approval_type text NOT NULL, status text NOT NULL DEFAULT 'pending', reason text, decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name text NOT NULL, category text NOT NULL, description text NOT NULL, status text NOT NULL DEFAULT 'draft', scope_label text NOT NULL, owner_name text NOT NULL, rules jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1, created_by uuid REFERENCES users(id), updated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name text NOT NULL, model_allowlist text[] NOT NULL DEFAULT '{}', sensitive_classifications text[] NOT NULL DEFAULT '{Highly Restricted}', max_tokens integer, require_citations boolean NOT NULL DEFAULT true, require_human_approval boolean NOT NULL DEFAULT true, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, action_key text NOT NULL, risk_level text NOT NULL, approver_roles text[] NOT NULL, min_approvers integer NOT NULL DEFAULT 1, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, action_key)
);
CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, resource_type text NOT NULL, retention_days integer NOT NULL, legal_hold_enabled boolean NOT NULL DEFAULT true, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, resource_type)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id), type text NOT NULL, title text NOT NULL, body text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_preferences (
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, channel text NOT NULL, event_type text NOT NULL, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, user_id, channel, event_type)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, event_type text NOT NULL, description text NOT NULL, actor_id uuid REFERENCES users(id), actor_name text NOT NULL, resource_type text, resource_id uuid, resource_ref text, outcome text NOT NULL, severity text NOT NULL DEFAULT 'low', request_id text, correlation_id text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES organizations(id) ON DELETE CASCADE, event_type text NOT NULL, actor_id uuid REFERENCES users(id), ip_hash text, user_agent_hash text, resource_ref text, outcome text NOT NULL, risk_score numeric(5,2), metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, event_name text NOT NULL, user_id uuid REFERENCES users(id), department_id uuid REFERENCES departments(id), agent_id uuid REFERENCES ai_agents(id), properties jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS usage_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, period_start date NOT NULL, period_end date NOT NULL, period_label text NOT NULL, metric_name text NOT NULL, metric_value numeric NOT NULL, dimensions jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, period_start, metric_name, dimensions)
);
CREATE TABLE IF NOT EXISTS model_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id), agent_id uuid REFERENCES ai_agents(id), department_id uuid REFERENCES departments(id), provider text NOT NULL, model text NOT NULL, input_tokens bigint NOT NULL DEFAULT 0, output_tokens bigint NOT NULL DEFAULT 0, estimated_cost_cents bigint NOT NULL DEFAULT 0, latency_ms integer NOT NULL DEFAULT 0, success boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, provider text NOT NULL, name text NOT NULL, status text NOT NULL DEFAULT 'pending', scopes text[] NOT NULL DEFAULT '{}', encrypted_credentials text, last_sync_at timestamptz, error_message text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, provider, name)
);
CREATE TABLE IF NOT EXISTS integration_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE, sync_type text NOT NULL, status text NOT NULL DEFAULT 'queued', cursor text, attempt_count integer NOT NULL DEFAULT 0, idempotency_key text NOT NULL, last_error text, started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES organizations(id) ON DELETE CASCADE, key text NOT NULL, enabled boolean NOT NULL DEFAULT false, environment text NOT NULL DEFAULT 'all', role_keys text[] NOT NULL DEFAULT '{}', rollout_percentage integer NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, key, environment)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_status ON users (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_token_expiry ON sessions (token_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tenant_status ON documents (tenant_id, status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tenant_classification ON documents (tenant_id, classification);
CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_document_versions_tenant_document ON document_versions (tenant_id, document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_document ON document_chunks (tenant_id, document_id, document_version_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue ON document_processing_jobs (status, available_at) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_ai_responses_tenant_created ON ai_responses (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_time ON analytics_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_time ON audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_tenant_time ON security_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_tenant_status ON workflow_executions (tenant_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION smart_corp_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organizations','organization_settings','departments','users','user_profiles','roles','groups','service_accounts','documents','document_metadata','document_processing_jobs','knowledge_sources','knowledge_collections','knowledge_conflicts','knowledge_gaps','knowledge_reviews','knowledge_risks','ai_agents','conversations','meetings','meeting_action_items','workflows','governance_policies','ai_policies','retention_policies','integration_connections','feature_flags'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION smart_corp_touch_updated_at()', table_name, table_name);
  END LOOP;
END $$;

-- Audit records are append-only. Corrections must be represented as new events.
CREATE OR REPLACE FUNCTION smart_corp_prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events are append-only'; END;
$$;
DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION smart_corp_prevent_audit_mutation();

-- RLS is enabled for defense in depth. The API transaction sets app.tenant_id and app.user_id.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION smart_corp_current_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organization_settings','users','documents','document_versions','document_chunks','document_permissions','ai_agents','conversations','messages','ai_responses','workflows','workflow_executions','approvals','governance_policies','audit_events','security_events','analytics_events','model_usage','integration_connections'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant())', table_name);
  END LOOP;
END $$;
DROP POLICY IF EXISTS organization_isolation ON organizations;
CREATE POLICY organization_isolation ON organizations USING (id = smart_corp_current_tenant()) WITH CHECK (id = smart_corp_current_tenant());
