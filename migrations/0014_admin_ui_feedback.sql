-- Admin UI feedback (migrated from KV)
CREATE TABLE IF NOT EXISTS admin_ui_feedback (
  field_id TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK(value IN ('up', 'heart', 'down')),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
