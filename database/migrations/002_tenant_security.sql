-- Defense-in-depth tenant policies for the remaining tenant-owned entities.
-- The application role should not own these tables; grant only the operations it needs.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'departments','user_profiles','roles','role_permissions','user_roles','groups','group_members','api_keys','service_accounts',
    'document_metadata','document_tags','document_processing_jobs','document_embeddings','knowledge_sources','knowledge_collections',
    'knowledge_conflicts','knowledge_gaps','knowledge_reviews','knowledge_risks','meetings','agent_versions','agent_permissions',
    'agent_knowledge_sources','agent_routing_rules','agent_tools','conversation_members','meeting_participants','meeting_transcripts',
    'meeting_summaries','meeting_decisions','meeting_action_items','workflow_versions','workflow_steps','workflow_execution_steps',
    'notifications','notification_preferences','usage_metrics','retention_policies','ai_policies','approval_policies',
    'feature_flags','integration_sync_jobs','ai_sources','ai_evidence','ai_feedback'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = smart_corp_current_tenant()) WITH CHECK (tenant_id = smart_corp_current_tenant())', table_name);
  END LOOP;
END $$;

-- The session lookup is intentionally token-based and does not use a client-supplied tenant.
-- Keep sessions protected by an application role grant and the token_hash index.
CREATE INDEX IF NOT EXISTS idx_documents_tenant_review ON documents (tenant_id, next_review_at) WHERE deleted_at IS NULL AND status IN ('ready', 'review');
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_tenant_status ON knowledge_gaps (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_conflicts_tenant_status ON knowledge_conflicts (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (tenant_id, user_id, created_at DESC) WHERE read_at IS NULL;
