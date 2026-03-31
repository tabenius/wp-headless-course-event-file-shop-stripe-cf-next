-- Digital access: tracks which users own which products.
-- Replaces the KV-based single-blob / per-user-key design.

CREATE TABLE IF NOT EXISTS digital_access (
  email      TEXT NOT NULL COLLATE NOCASE,
  product_id TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, product_id)
);

CREATE INDEX IF NOT EXISTS idx_digital_access_product
  ON digital_access (product_id);
