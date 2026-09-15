-- Meeting intelligence: provenance, confidence and topic columns for the
-- existing meeting_summaries / meeting_decisions / meeting_action_items tables.
-- Also adds participant ACL columns so meeting content can be permission-filtered.

ALTER TABLE meeting_summaries ADD COLUMN IF NOT EXISTS topics jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE meeting_summaries ADD COLUMN IF NOT EXISTS model text;

ALTER TABLE meeting_decisions ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'low';
ALTER TABLE meeting_decisions ADD COLUMN IF NOT EXISTS provenance text;
ALTER TABLE meeting_decisions ADD COLUMN IF NOT EXISTS source_segment integer;
ALTER TABLE meeting_decisions ADD COLUMN IF NOT EXISTS owner_name text;

ALTER TABLE meeting_action_items ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'low';
ALTER TABLE meeting_action_items ADD COLUMN IF NOT EXISTS provenance text;
ALTER TABLE meeting_action_items ADD COLUMN IF NOT EXISTS source_segment integer;
ALTER TABLE meeting_action_items ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE meeting_action_items ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

ALTER TABLE meeting_transcripts ADD COLUMN IF NOT EXISTS participants jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_meeting_action_items_status ON meeting_action_items (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_meeting_decisions_tenant ON meeting_decisions (tenant_id, created_at DESC);
