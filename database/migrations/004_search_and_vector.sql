-- Search/indexing helpers. The vector block is optional so local PostgreSQL can run
-- without installing pgvector; production should install it and set a fixed model dimension.
-- Two dedicated trigger functions: the shared function previously referenced
-- NEW.document_id, which does not exist on `documents` (only on document_chunks),
-- so any insert/update of a document raised a PL/pgSQL type error at runtime.
CREATE OR REPLACE FUNCTION smart_corp_refresh_document_search_from_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE documents d
  SET search_vector = to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(d.source_name, '') || ' ' || COALESCE((SELECT string_agg(c.content, ' ') FROM document_chunks c WHERE c.document_id = d.id), '')),
      updated_at = now()
  WHERE d.id = COALESCE(NEW.id, OLD.id);
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS document_search_refresh_on_document ON documents;
CREATE TRIGGER document_search_refresh_on_document AFTER INSERT OR UPDATE OF title, source_name ON documents FOR EACH ROW EXECUTE FUNCTION smart_corp_refresh_document_search_from_document();

CREATE OR REPLACE FUNCTION smart_corp_refresh_document_search_from_chunk() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE documents d
  SET search_vector = to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(d.source_name, '') || ' ' || COALESCE((SELECT string_agg(c.content, ' ') FROM document_chunks c WHERE c.document_id = d.id), '')),
      updated_at = now()
  WHERE d.id = COALESCE(NEW.document_id, OLD.document_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DROP TRIGGER IF EXISTS document_search_refresh_on_chunk ON document_chunks;
CREATE TRIGGER document_search_refresh_on_chunk AFTER INSERT OR UPDATE OR DELETE ON document_chunks FOR EACH ROW EXECUTE FUNCTION smart_corp_refresh_document_search_from_chunk();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    BEGIN
      ALTER TABLE document_embeddings ADD COLUMN embedding_vector vector(1536);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON document_embeddings USING hnsw (embedding_vector vector_cosine_ops) WHERE embedding_vector IS NOT NULL;
  END IF;
END $$;
