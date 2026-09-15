-- P2-B: Governed enterprise memory.
-- This is the general governed-memory layer (six scopes, nine memory types).
-- It is DISTINCT from `organizational_memory` (decision/outcome lineage) but
-- integrates with it: decision-derived memory references it via source_type/id.
-- Every record carries tenant_id + RLS, provenance, confidence, authority,
-- classification, validity window, retention policy, ACL and a version number.

CREATE TABLE IF NOT EXISTS enterprise_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('session','task','user','team','organizational','agent')),
  memory_type text NOT NULL CHECK (memory_type IN ('fact','preference','decision','task','context','instruction','summary','inference','observation')),
  subject_id text,                        -- the thing this memory is ABOUT (free-form ref)
  content text NOT NULL,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,   -- user/agent-scope owner
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,   -- team scope
  agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE, -- agent scope
  source_type text NOT NULL DEFAULT 'user' CHECK (source_type IN ('document','meeting','decision','conversation','workflow','agent','user','system','connector')),
  source_id text,                          -- e.g. document/<id>, meeting/<id>, decision/<id>
  provenance text NOT NULL DEFAULT 'measured' CHECK (provenance IN ('measured','synthetic','estimated','projected','not_measured')),
  confidence numeric(3,2) NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  authority text,
  classification text NOT NULL DEFAULT 'Internal' CHECK (classification IN ('Public','Internal','Confidential','Restricted','Highly Restricted')),
  access_policy jsonb NOT NULL DEFAULT '{}'::jsonb,   -- ACL: {principals:[...], roles:[...], public:false}
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  expires_at timestamptz,
  retention_policy text NOT NULL DEFAULT 'organization',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','stale','expired','superseded','invalidated','deleted')),
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enterprise_memory_tenant_scope ON enterprise_memory (tenant_id, scope);
CREATE INDEX IF NOT EXISTS idx_enterprise_memory_owner ON enterprise_memory (tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_memory_group ON enterprise_memory (tenant_id, group_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_memory_agent ON enterprise_memory (tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_memory_status ON enterprise_memory (tenant_id, status);
ALTER TABLE enterprise_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON enterprise_memory;
CREATE POLICY tenant_isolation ON enterprise_memory USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- Append-only version history for corrections/updates of important memory.
CREATE TABLE IF NOT EXISTS enterprise_memory_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES enterprise_memory(id) ON DELETE CASCADE,
  version integer NOT NULL,
  prior_content text NOT NULL,
  new_content text NOT NULL,
  reason text,
  actor_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enterprise_memory_versions_memory ON enterprise_memory_versions (tenant_id, memory_id, version DESC);
ALTER TABLE enterprise_memory_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON enterprise_memory_versions;
CREATE POLICY tenant_isolation ON enterprise_memory_versions USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());
