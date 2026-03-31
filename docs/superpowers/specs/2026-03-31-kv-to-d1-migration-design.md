# KV-to-D1 Migration Design

## Goal

Migrate 8 KV-backed stores to Cloudflare D1 (SQLite at edge) to eliminate race conditions, monolithic blob scaling issues, and enable proper relational queries. KV fallback preserved for graceful degradation.

## Architecture

- **Single D1 database:** `sofiacerne` (ID: `64f99034-504d-4389-ab45-fd85cf63ae3f`)
- **Binding name:** `DB` (renamed from `D1_DIGITAL_ACCESS` — now multi-purpose)
- **Pattern:** Each store module calls `tryGetD1()` from shared `d1Bindings.js`. If D1 is available, use SQL. Otherwise fall back to existing KV logic.
- **Migration files:** One per store, numbered sequentially in `migrations/`
- **Existing `digital_access` table** (migration 0001) is already live and stays as-is.

## Binding Change

`d1Bindings.js` currently returns `ctx?.env?.D1_DIGITAL_ACCESS`. Update to `ctx?.env?.DB`.

`wrangler.jsonc` binding changes from `D1_DIGITAL_ACCESS` to `DB`.

The existing `digitalAccessStore.js` references `tryGetD1()` which calls `getD1Database()` — no changes needed in the store itself, only in `d1Bindings.js` and `wrangler.jsonc`.

## Migration Order and Table Designs

### 1. Rate Limiting (`0002_rate_limits.sql`)

**Why first:** Critical correctness issue — payment endpoint protection has a read-modify-write race.

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,   -- "endpoint:identifier:window"
  count      INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL       -- ISO8601, for cleanup
);
```

**D1 operations:**
- `INCREMENT`: `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1` — atomic, no race.
- `CHECK`: `SELECT count FROM rate_limits WHERE key = ? AND expires_at > datetime('now')`
- `CLEANUP`: `DELETE FROM rate_limits WHERE expires_at < datetime('now')` — periodic, replaces KV TTL.

**Store:** `rateLimit.js` — add D1 path alongside existing KV.

### 2. Users (`0003_users.sql`)

**Why second:** Foundational — auth checks hit this on every request.

```sql
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL DEFAULT '',
  username       TEXT NOT NULL DEFAULT '',
  avatar_public  INTEGER NOT NULL DEFAULT 0,
  password_hash  TEXT NOT NULL DEFAULT '',
  oauth_accounts TEXT NOT NULL DEFAULT '[]',   -- JSON array
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
```

**D1 operations:**
- `REGISTER`: `INSERT INTO users (...) VALUES (...)` — unique email constraint prevents duplicates.
- `LOGIN`: `SELECT * FROM users WHERE email = ? LIMIT 1`
- `UPDATE`: `UPDATE users SET ... WHERE id = ?`
- `LINK_OAUTH`: Update `oauth_accounts` JSON column.
- `LIST`: `SELECT * FROM users` (admin only)

**Store:** `userStore.js` — add D1 path. OAuth accounts stored as JSON column (small, rarely queried independently).

### 3. Products (`0004_products.sql`)

**Why third:** Very hot read path — every shop page.

```sql
CREATE TABLE IF NOT EXISTS products (
  slug           TEXT PRIMARY KEY,
  name           TEXT NOT NULL DEFAULT '',
  title          TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  image_url      TEXT NOT NULL DEFAULT '',
  type           TEXT NOT NULL DEFAULT 'digital_file',
  product_mode   TEXT NOT NULL DEFAULT 'digital_file',
  price_cents    INTEGER NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'SEK',
  free           INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  file_url       TEXT NOT NULL DEFAULT '',
  content_uri    TEXT NOT NULL DEFAULT '',
  mime_type      TEXT NOT NULL DEFAULT '',
  asset_id       TEXT NOT NULL DEFAULT '',
  vat_percent    REAL,
  categories     TEXT NOT NULL DEFAULT '[]',    -- JSON array
  metadata       TEXT NOT NULL DEFAULT '{}',    -- JSON object for extensibility
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_type ON products (type);
CREATE INDEX IF NOT EXISTS idx_products_active ON products (active);
```

**D1 operations:**
- `LIST`: `SELECT * FROM products WHERE active = 1` (shop) or `SELECT * FROM products` (admin)
- `GET`: `SELECT * FROM products WHERE slug = ?`
- `CREATE`: `INSERT INTO products (...) VALUES (...)`
- `UPDATE`: `UPDATE products SET ... WHERE slug = ?`
- `DELETE`: `DELETE FROM products WHERE slug = ?`

**Store:** `digitalProducts.js` — add D1 path. Categories and extra metadata as JSON columns.

### 4. Media Assets (`0005_media_assets.sql`)

**Why fourth:** Growing dataset, concurrent upload races.

```sql
CREATE TABLE IF NOT EXISTS media_assets (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL DEFAULT 'r2',
  source_id   TEXT NOT NULL DEFAULT '',
  key         TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  mime_type   TEXT NOT NULL DEFAULT '',
  size_bytes  INTEGER,
  width       INTEGER,
  height      INTEGER,
  metadata    TEXT NOT NULL DEFAULT '{}',    -- JSON: title, caption, description, altText, etc.
  rights      TEXT NOT NULL DEFAULT '{}',    -- JSON: copyrightHolder, license
  asset_info  TEXT NOT NULL DEFAULT '{}',    -- JSON: assetId, ownerUri, role, variants, etc.
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  saved_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_assets_key ON media_assets (key);
CREATE INDEX IF NOT EXISTS idx_media_assets_mime ON media_assets (mime_type);
```

**D1 operations:**
- `LIST`: `SELECT * FROM media_assets ORDER BY saved_at DESC`
- `GET`: `SELECT * FROM media_assets WHERE id = ?`
- `UPSERT`: `INSERT OR REPLACE INTO media_assets (...) VALUES (...)`
- `DELETE`: `DELETE FROM media_assets WHERE id = ?`
- `BY_KEY`: `SELECT * FROM media_assets WHERE key = ?`

**Store:** `mediaAssetRegistry.js` — add D1 path. Deeply nested metadata kept as JSON columns (queried by id/key, not by metadata fields).

### 5. Avatars (`0006_avatars.sql`)

```sql
CREATE TABLE IF NOT EXISTS avatars (
  id                TEXT PRIMARY KEY,
  owner_user_id     TEXT NOT NULL,
  canonical_name    TEXT UNIQUE COLLATE NOCASE,
  is_public         INTEGER NOT NULL DEFAULT 0,
  profile_image_url TEXT NOT NULL DEFAULT '',
  bio               TEXT NOT NULL DEFAULT '',
  details           TEXT NOT NULL DEFAULT '{}',    -- JSON: up to 64 key-value pairs
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS avatar_relationships (
  from_avatar_id  TEXT NOT NULL,
  to_avatar_id    TEXT NOT NULL,
  kind            TEXT NOT NULL,     -- e.g., "follow"
  note            TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_avatar_id, to_avatar_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_avatars_owner ON avatars (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_avatar_rel_to ON avatar_relationships (to_avatar_id);
```

**D1 operations:**
- `GET`: `SELECT * FROM avatars WHERE id = ?`
- `BY_NAME`: `SELECT * FROM avatars WHERE canonical_name = ?`
- `UPDATE`: `UPDATE avatars SET ... WHERE id = ?`
- `FOLLOW`: `INSERT OR IGNORE INTO avatar_relationships (...) VALUES (...)`
- `UNFOLLOW`: `DELETE FROM avatar_relationships WHERE from_avatar_id = ? AND to_avatar_id = ? AND kind = ?`
- `FOLLOWERS`: `SELECT * FROM avatar_relationships WHERE to_avatar_id = ?`

**Store:** `avatarStore.js` — add D1 path. Relationships normalized into separate table. Details kept as JSON (key-value bag, not queried independently).

### 6. Content Access (`0007_content_access.sql`)

```sql
CREATE TABLE IF NOT EXISTS content_access (
  course_uri     TEXT PRIMARY KEY,
  allowed_users  TEXT NOT NULL DEFAULT '[]',   -- JSON array of emails
  price_cents    INTEGER NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'SEK',
  vat_percent    REAL,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**D1 operations:**
- `LIST`: `SELECT * FROM content_access`
- `GET`: `SELECT * FROM content_access WHERE course_uri = ?`
- `HAS_ACCESS`: `SELECT allowed_users FROM content_access WHERE course_uri = ? AND active = 1` then check JSON array in JS.
- `GRANT`: Read `allowed_users`, append email, `UPDATE ... SET allowed_users = ?`
- `UPSERT`: `INSERT OR REPLACE INTO content_access (...) VALUES (...)`

**Note:** `allowed_users` stays as a JSON array because the per-course user list is small and always read as a whole. If it grows large, a separate junction table can be added later.

**Store:** `contentAccessStore.js` — add D1 path.

### 7. Chat History (`0008_chat_messages.sql`)

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  history_key TEXT NOT NULL,
  role        TEXT NOT NULL,        -- "user" or "assistant"
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_history_key ON chat_messages (history_key, id);
```

**D1 operations:**
- `APPEND`: `INSERT INTO chat_messages (history_key, role, content) VALUES (?, ?, ?)` — atomic, no race.
- `READ`: `SELECT * FROM chat_messages WHERE history_key = ? ORDER BY id`
- `CLEAR`: `DELETE FROM chat_messages WHERE history_key = ?`

**Store:** Direct KV usage in `cloudflareKv.js` → extract to `chatHistoryStore.js` with D1 path.

### 8. Support Tickets (`0009_support_tickets.sql`)

```sql
CREATE TABLE IF NOT EXISTS support_tickets (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'low',
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
  author     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments (ticket_id);
```

**D1 operations:**
- `CREATE_TICKET`: `INSERT INTO support_tickets (...) VALUES (...)`
- `ADD_COMMENT`: `INSERT INTO ticket_comments (...) VALUES (...)`
- `LIST`: `SELECT * FROM support_tickets ORDER BY created_at DESC`
- `GET_WITH_COMMENTS`: Ticket + `SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at`
- `UPDATE_STATUS`: `UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`

**Store:** `supportTickets.js` — add D1 path. Comments normalized into separate table.

## What Stays in KV

These stores are well-suited to KV and do not benefit from D1:

| Store | Reason |
|-------|--------|
| Admin settings (4 keys) | Tiny, per-key, infrequent |
| Style presets | Small, admin-only writes |
| UI feedback | Analytics, eventual consistency fine |
| Debug log | Ring buffer with TTL |
| Fonts catalog | Reference cache with TTL |
| Downloaded fonts | CSS cache, low write |
| Storefront cache epoch | Single counter |
| Menu snapshot | Cache layer |
| Password reset tokens | Ephemeral, TTL cleanup |
| Avatar feed store | Deferred — reassess after avatars migration |

## Error Handling

All D1 paths follow the same pattern:
1. `tryGetD1()` returns `null` → fall through to KV
2. D1 query throws → log error, fall through to KV
3. KV also fails → return safe default (empty array, false, etc.)

No store should throw to the caller due to a backend failure.

## Testing

Each store migration should be verified by:
1. Lint passes
2. Build succeeds (`npm run cf:deploy`)
3. Manual smoke test of the affected UI/API path
4. KV fallback still works if D1 binding is removed

## Cleanup (Post-Migration)

After all stores are confirmed stable on D1:
- Rate limit cleanup: periodic `DELETE WHERE expires_at < datetime('now')` via scheduled worker or on-read pruning.
- KV fallback code can be removed in a future pass (not part of this migration).
- `avatar-feed-store` can be reassessed once avatars table is live.
