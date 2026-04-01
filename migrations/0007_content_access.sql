CREATE TABLE IF NOT EXISTS content_access (
  course_uri    TEXT PRIMARY KEY,
  allowed_users TEXT NOT NULL DEFAULT '[]',
  price_cents   INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'SEK',
  vat_percent   REAL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
