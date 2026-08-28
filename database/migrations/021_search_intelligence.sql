-- P2-E: Enterprise search & retrieval intelligence.
-- Adds the persistence layer for the unified search stack:
--   1. Chunk-level lexical index (generated tsvector + GIN) so retrieval ranks
--      chunks, not whole documents.
--   2. pg_trgm (guarded) for typo-tolerant suggestion matching on titles and
--      graph entity names.
--   3. `embedding_cache` — tenant-scoped embedding reuse keyed by
--      (model_version, input_hash) so repeated queries and re-indexing never
--      pay twice for the same vector.
--   4. `search_events` — per-query observability records (mode, latency,
--      degradation reasons, result counts) for tenant-visible search analytics.
-- Every new tenant-owned table gets the same defense-in-depth RLS policy used
-- since 002. All extension creation is guarded so the migration is safe on
-- PostgreSQL without contrib modules and on PGlite-based test clusters.

-- ---------------------------------------------------------------------------
-- 1. Chunk-level lexical index
-- ---------------------------------------------------------------------------
-- to_tsvector with an explicit regconfig is IMMUTABLE, so a STORED generated
-- column is allowed and stays in sync with content automatically (including on
-- backfill for rows written before this migration).
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

DROP INDEX IF EXISTS idx_document_chunks_search_tsv;
CREATE INDEX IF NOT EXISTS idx_document_chunks_search_tsv
  ON document_chunks USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_doc
  ON document_chunks (tenant_id, document_id);

-- ---------------------------------------------------------------------------
-- 2. pg_trgm for fuzzy suggestions (guarded)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
      ON documents USING gin (title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_graph_entities_name_trgm
      ON graph_entities USING gin (name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_meetings_title_trgm
      ON meetings USING gin (title gin_trgm_ops);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Suggestions degrade to prefix matching when pg_trgm is unavailable.
  NULL;
END $$;

-- Embedding lookup index for retrieval joins.
CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk_model
  ON document_embeddings (document_chunk_id, model_version);

-- ---------------------------------------------------------------------------
-- 3. Embedding cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embedding_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  model_version text NOT NULL,
  input_hash text NOT NULL,                    -- sha256 of normalized input
  embedding jsonb NOT NULL,                    -- finite number[] payload
  dim integer NOT NULL CHECK (dim > 0),
  provider text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, model_version, input_hash)
);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_lookup
  ON embedding_cache (tenant_id, model_version, input_hash);
ALTER TABLE embedding_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON embedding_cache;
CREATE POLICY tenant_isolation ON embedding_cache
  USING (tenant_id = smart_corp_current_tenant())
  WITH CHECK (tenant_id = smart_corp_current_tenant());

-- ---------------------------------------------------------------------------
-- 4. Search observability events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  department_id uuid,
  query text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('auto', 'lexical', 'semantic', 'hybrid', 'graph')),
  resolved_mode text NOT NULL,
  kinds text[] NOT NULL DEFAULT '{}',
  result_count integer NOT NULL DEFAULT 0,
  candidate_count integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  embedding_cache_hit boolean NOT NULL DEFAULT false,
  degraded_reason text,
  top_score numeric(6,4),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_events_tenant_time
  ON search_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_user_time
  ON search_events (tenant_id, user_id, created_at DESC);
ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON search_events;
CREATE POLICY tenant_isolation ON search_events
  USING (tenant_id = smart_corp_current_tenant())
  WITH CHECK (tenant_id = smart_corp_current_tenant());
