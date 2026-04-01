ALTER TABLE page_vitals ADD COLUMN user_email TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_page_vitals_user ON page_vitals (user_email, created_at);
