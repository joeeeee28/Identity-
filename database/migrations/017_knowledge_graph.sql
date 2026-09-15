-- P2-A: Governed enterprise knowledge graph (PostgreSQL-backed; no graph DB).
-- Entities and relationships are tenant-scoped with provenance, confidence,
-- temporal validity, classification and soft-delete. RLS enforces tenant
-- isolation; the traversal is bounded by a max-depth / max-results guard.

CREATE TABLE IF NOT EXISTS graph_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN (
    'person','team','department','organization','document','policy','project',
    'customer','vendor','system','application','meeting','decision','task',
    'agent','workflow','action','outcome','risk','control'
  )),
  name text NOT NULL,
  external_ref text,                    -- link to the owning record (e.g. document/<id>)
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  classification text NOT NULL DEFAULT 'Internal' CHECK (classification IN ('Public','Internal','Confidential','Restricted','Highly Restricted')),
  provenance text NOT NULL DEFAULT 'measured' CHECK (provenance IN ('measured','synthetic','estimated','projected','not_measured')),
  confidence numeric(3,2) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, entity_type, name)
);
CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON graph_entities (tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_graph_entities_external_ref ON graph_entities (tenant_id, external_ref);
ALTER TABLE graph_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON graph_entities;
CREATE POLICY tenant_isolation ON graph_entities USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

CREATE TABLE IF NOT EXISTS graph_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_entity_id uuid NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'REPORTS_TO','MEMBER_OF','OWNS','CREATED','APPROVED','DEPENDS_ON','RELATED_TO',
    'MENTIONED_IN','DECIDED_IN','ASSIGNED_TO','EXECUTED_BY','AFFECTS','BLOCKS',
    'RESOLVES','GOVERNS','USES','DERIVED_FROM'
  )),
  target_entity_id uuid NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance text NOT NULL DEFAULT 'measured' CHECK (provenance IN ('measured','synthetic','estimated','projected','not_measured')),
  confidence numeric(3,2) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_entity_id <> target_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_graph_relationships_source ON graph_relationships (tenant_id, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_relationships_target ON graph_relationships (tenant_id, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_relationships_type ON graph_relationships (tenant_id, relationship_type);
ALTER TABLE graph_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON graph_relationships;
CREATE POLICY tenant_isolation ON graph_relationships USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant());

-- Helper: resolve an entity by (type, name) for relationship construction.
CREATE OR REPLACE FUNCTION smart_corp_graph_entity_id(p_tenant_id uuid, p_type text, p_name text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM graph_entities WHERE tenant_id = p_tenant_id AND entity_type = p_type AND name = p_name AND deleted_at IS NULL LIMIT 1
$$;
