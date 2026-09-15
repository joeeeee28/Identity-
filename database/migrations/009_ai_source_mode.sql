ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS source_mode text NOT NULL DEFAULT 'internal';
CREATE INDEX IF NOT EXISTS idx_ai_responses_tenant_source_mode ON ai_responses (tenant_id, source_mode, created_at DESC);
