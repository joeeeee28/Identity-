-- Persist the execution contract beside every AI response so quality and
-- routing regressions can be investigated without exposing private reasoning.
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS intent text;
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS response_type text;
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS route_metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS delegation jsonb NOT NULL DEFAULT '{}';
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS structured_result jsonb;
CREATE INDEX IF NOT EXISTS idx_ai_responses_tenant_intent ON ai_responses (tenant_id, intent, created_at DESC);
