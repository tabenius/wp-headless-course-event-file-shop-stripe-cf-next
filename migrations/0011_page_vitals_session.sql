ALTER TABLE page_vitals ADD COLUMN session_id TEXT NOT NULL DEFAULT '';
ALTER TABLE page_vitals ADD COLUMN referrer TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_page_vitals_session ON page_vitals (session_id, id);
