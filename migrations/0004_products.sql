CREATE TABLE IF NOT EXISTS products (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  image_url    TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'digital_file',
  product_mode TEXT NOT NULL DEFAULT 'digital_file',
  price_cents  INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'SEK',
  free         INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  file_url     TEXT NOT NULL DEFAULT '',
  content_uri  TEXT NOT NULL DEFAULT '',
  mime_type    TEXT NOT NULL DEFAULT '',
  asset_id     TEXT NOT NULL DEFAULT '',
  vat_percent  REAL,
  categories   TEXT NOT NULL DEFAULT '{}',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_type ON products (type);
CREATE INDEX IF NOT EXISTS idx_products_active ON products (active);
CREATE INDEX IF NOT EXISTS idx_products_asset_id ON products (asset_id);
