CREATE TABLE IF NOT EXISTS page_vitals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  url             TEXT NOT NULL DEFAULT '',
  ttfb            INTEGER NOT NULL DEFAULT 0,
  dom_complete    INTEGER NOT NULL DEFAULT 0,
  lcp             INTEGER,
  fcp             INTEGER,
  inp             INTEGER,
  cls             REAL,
  navigation_type TEXT NOT NULL DEFAULT 'navigate',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_vitals_created ON page_vitals (created_at);
CREATE INDEX IF NOT EXISTS idx_page_vitals_url ON page_vitals (url, created_at);
