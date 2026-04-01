CREATE TABLE IF NOT EXISTS support_tickets (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'moderate',
  status      TEXT NOT NULL DEFAULT 'open',
  build_time  TEXT NOT NULL DEFAULT '',
  git_sha     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  text       TEXT NOT NULL DEFAULT '',
  author     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments (ticket_id);
