-- Search/indexing helpers. The vector block is optional so local PostgreSQL can run
-- without installing pgvector; production should install it and set a fixed model dimension.
CREATE OR REPLACE FUNCTION smart_corp_refresh_document_search() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_document uuid;
BEGIN
  target_document := COALESCE(NEW.document_id, OLD.document_id);
  UPDATE documents d
  SET search_vector = to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(d.source_name, '') || ' ' || COALESCE((SELECT string_agg(c.content, ' ') FROM document_chunks c WHERE c.document_id = d.id), '')),
      updated_at = now()
  WHERE d.id = target_document;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DROP TRIGGER IF EXISTS document_search_refresh_on_document ON documents;
CREATE TRIGGER document_search_refresh_on_document AFTER INSERT OR UPDATE OF title, source_name ON documents FOR EACH ROW EXECUTE FUNCTION smart_corp_refresh_document_search();
DROP TRIGGER IF EXISTS document_search_refresh_on_chunk ON document_chunks;
CREATE TRIGGER document_search_refresh_on_chunk AFTER INSERT OR UPDATE OR DELETE ON document_chunks FOR EACH ROW EXECUTE FUNCTION smart_corp_refresh_document_search();

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
