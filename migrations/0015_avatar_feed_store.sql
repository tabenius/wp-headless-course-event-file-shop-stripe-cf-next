-- Avatar feed store (migrated from KV blob to D1 tables)

CREATE TABLE IF NOT EXISTS avatar_feed_assets (
  asset_id TEXT PRIMARY KEY,
  owner_uri TEXT NOT NULL DEFAULT '/',
  uri TEXT NOT NULL,
  slug TEXT,
  title TEXT,
  creator_type TEXT NOT NULL DEFAULT 'admin',
  creator_id TEXT NOT NULL DEFAULT 'admins',
  rights TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT '{}',
  variants TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS avatar_collection_feeds (
  feed_id TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'collection',
  title TEXT,
  description TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(avatar_id, slug)
);

CREATE TABLE IF NOT EXISTS avatar_feed_follows (
  follower_avatar_id TEXT NOT NULL,
  target_avatar_id TEXT NOT NULL,
  feed_slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_avatar_id, target_avatar_id, feed_slug)
);

CREATE TABLE IF NOT EXISTS avatar_feed_items (
  item_id TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL,
  feed_slug TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  caption TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_avatar_feed_assets_creator ON avatar_feed_assets(creator_type, creator_id);
CREATE INDEX IF NOT EXISTS idx_avatar_collection_feeds_avatar ON avatar_collection_feeds(avatar_id);
CREATE INDEX IF NOT EXISTS idx_avatar_feed_follows_follower ON avatar_feed_follows(follower_avatar_id);
CREATE INDEX IF NOT EXISTS idx_avatar_feed_items_avatar_feed ON avatar_feed_items(avatar_id, feed_slug);
