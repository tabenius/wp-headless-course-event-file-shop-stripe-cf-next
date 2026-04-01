CREATE TABLE IF NOT EXISTS media_assets (
  id         TEXT PRIMARY KEY,
  source     TEXT NOT NULL DEFAULT 'r2',
  source_id  TEXT NOT NULL DEFAULT '',
  key        TEXT NOT NULL DEFAULT '',
  title      TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL DEFAULT '',
  mime_type  TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER,
  width      INTEGER,
  height     INTEGER,
  metadata   TEXT NOT NULL DEFAULT '{}',
  rights     TEXT NOT NULL DEFAULT '{}',
  asset_info TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  saved_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_assets_key ON media_assets (key);
CREATE INDEX IF NOT EXISTS idx_media_assets_mime ON media_assets (mime_type);
