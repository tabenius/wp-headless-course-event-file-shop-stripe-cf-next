CREATE TABLE IF NOT EXISTS avatars (
  id                TEXT PRIMARY KEY,
  owner_user_id     TEXT NOT NULL,
  canonical_name    TEXT UNIQUE COLLATE NOCASE,
  is_public         INTEGER NOT NULL DEFAULT 0,
  profile_image_url TEXT NOT NULL DEFAULT '',
  bio               TEXT NOT NULL DEFAULT '',
  details           TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS avatar_relationships (
  from_avatar_id TEXT NOT NULL,
  to_avatar_id   TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'follow',
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_avatar_id, to_avatar_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_avatars_owner ON avatars (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_avatar_rel_to ON avatar_relationships (to_avatar_id);
