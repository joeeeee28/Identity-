-- P2-D: Agent Registry & Governance.
-- Extends the existing ai_agents / agent_versions tables (no duplicate agent
-- tables). `status` remains the UI-facing state (draft/testing/published); the
-- new `lifecycle` column is the authoritative governance state machine.
-- ai_agents and agent_versions already carry tenant_id + RLS (migrations 001/002).

ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS purpose text;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','development','testing','evaluation','security_review','pending_approval','approved','deployed','suspended','rolled_back','retired'));
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical'));
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS autonomy_level text NOT NULL DEFAULT 'assist' CHECK (autonomy_level IN ('assist','recommend','execute_with_approval','bounded_autonomous'));
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS evaluation_status text NOT NULL DEFAULT 'not_evaluated' CHECK (evaluation_status IN ('not_evaluated','pending','pass','fail'));
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','denied'));

-- A version captures the full governance snapshot (immutable once deployed).
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS tool_policy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS data_policy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'medium';
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS autonomy_level text NOT NULL DEFAULT 'assist';

CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant_lifecycle ON ai_agents (tenant_id, lifecycle);
