# KV-to-D1 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 8 KV-backed stores to Cloudflare D1 with KV/local fallback preserved.

**Architecture:** Each store gets a D1 path gated by `tryGetD1()` from shared `d1Bindings.js`. D1 binding renamed from `D1_DIGITAL_ACCESS` to `DB`. One migration SQL file per store. All existing KV/local/in-memory fallback logic is preserved unchanged.

**Tech Stack:** Cloudflare D1 (SQLite at edge), `@opennextjs/cloudflare` context, existing KV via REST API.

**Spec:** `docs/superpowers/specs/2026-03-31-kv-to-d1-migration-design.md`

---

## File Structure

### Modified files
- `src/lib/d1Bindings.js` — change binding from `D1_DIGITAL_ACCESS` to `DB`
- `wrangler.jsonc` — rename binding from `D1_DIGITAL_ACCESS` to `DB`
- `src/lib/digitalAccessStore.js` — no code changes (uses `getD1Database()` which changes internally)
- `src/lib/rateLimit.js` — add D1 path for atomic increment
- `src/lib/userStore.js` — add D1 path for user CRUD
- `src/lib/digitalProducts.js` — add D1 path for product CRUD
- `src/lib/mediaAssetRegistry.js` — add D1 path for asset CRUD
- `src/lib/avatarStore.js` — add D1 path for avatar + relationship CRUD
- `src/lib/contentAccessStore.js` — add D1 path for content access CRUD
- `src/lib/cloudflareKv.js` — remove chat history functions (moved to new store)
- `src/lib/supportTickets.js` — add D1 path for ticket + comment CRUD

### New files
- `migrations/0002_rate_limits.sql`
- `migrations/0003_users.sql`
- `migrations/0004_products.sql`
- `migrations/0005_media_assets.sql`
- `migrations/0006_avatars.sql`
- `migrations/0007_content_access.sql`
- `migrations/0008_chat_messages.sql`
- `migrations/0009_support_tickets.sql`
- `src/lib/chatHistoryStore.js` — extracted from cloudflareKv.js with D1 path

---

### Task 0: Rename D1 binding from `D1_DIGITAL_ACCESS` to `DB`

**Files:**
- Modify: `src/lib/d1Bindings.js:38`
- Modify: `wrangler.jsonc:49-53`

- [ ] **Step 1: Update d1Bindings.js**

In `src/lib/d1Bindings.js`, change line 38:

```javascript
// Before:
    return ctx?.env?.D1_DIGITAL_ACCESS ?? null;
// After:
    return ctx?.env?.DB ?? null;
```

- [ ] **Step 2: Update wrangler.jsonc**

In `wrangler.jsonc`, change the d1_databases binding name:

```jsonc
// Before:
  "d1_databases": [
    {
      "binding": "D1_DIGITAL_ACCESS",
      "database_name": "sofiacerne",
      "database_id": "64f99034-504d-4389-ab45-fd85cf63ae3f"
    }
  ]
// After:
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "sofiacerne",
      "database_id": "64f99034-504d-4389-ab45-fd85cf63ae3f"
    }
  ]
```

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/d1Bindings.js`
Expected: No errors

- [ ] **Step 4: Deploy and verify**

Run: `npm run cf:deploy`
Expected: Deploy succeeds, `env.DB (sofiacerne)` visible in binding list. Digital access store continues working (same `getD1Database()` function, just reads a different env key).

- [ ] **Step 5: Commit**

```bash
git add src/lib/d1Bindings.js wrangler.jsonc
git commit -m "refactor: rename D1 binding from D1_DIGITAL_ACCESS to DB"
```

---

### Task 1: Migrate rate limiting to D1

**Files:**
- Create: `migrations/0002_rate_limits.sql`
- Modify: `src/lib/rateLimit.js`

- [ ] **Step 1: Write migration SQL**

Create `migrations/0002_rate_limits.sql`:

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);
```

- [ ] **Step 2: Apply migration**

Run: `npx wrangler d1 execute sofiacerne --remote --file=migrations/0002_rate_limits.sql`
Expected: Success, 1 table created.

- [ ] **Step 3: Add D1 path to rateLimit.js**

Replace the entire contents of `src/lib/rateLimit.js` with:

```javascript
import { getD1Database } from "@/lib/d1Bindings";
import { readCloudflareKvJson, writeCloudflareKvJson } from "./cloudflareKv";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

/**
 * Fixed-window rate limiter backed by D1 (atomic) with KV fallback.
 * Fails open — if neither backend is available the request is allowed through.
 *
 * @param {string} endpoint  Short label, e.g. "contact"
 * @param {string} identifier  Client IP or user identifier
 * @param {number} limit  Max requests per window
 * @param {number} windowSecs  Window size in seconds (default 1 hour)
 * @returns {{ limited: boolean, remaining: number }}
 */
export async function checkRateLimit(
  endpoint,
  identifier,
  limit,
  windowSecs = 3600,
) {
  try {
    const window = Math.floor(Date.now() / (windowSecs * 1000));
    const key = `rl:${endpoint}:${identifier}:${window}`;
    const expiresAt = new Date(
      (window + 2) * windowSecs * 1000,
    ).toISOString();

    const db = await tryGetD1();
    if (db) {
      await db
        .prepare(
          "INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1",
        )
        .bind(key, expiresAt)
        .run();
      const row = await db
        .prepare("SELECT count FROM rate_limits WHERE key = ?")
        .bind(key)
        .first();
      const count = row?.count ?? 0;
      if (count > limit) return { limited: true, remaining: 0 };
      return { limited: false, remaining: limit - count };
    }

    // KV fallback (non-atomic, best effort)
    const current = (await readCloudflareKvJson(key)) ?? { count: 0 };
    const count = (current.count ?? 0) + 1;
    if (count > limit) return { limited: true, remaining: 0 };
    await writeCloudflareKvJson(
      key,
      { count },
      { expirationTtl: windowSecs * 2 },
    );
    return { limited: false, remaining: limit - count };
  } catch {
    return { limited: false, remaining: -1 };
  }
}

/**
 * Extract the best available client IP from a Next.js / Cloudflare request.
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}
```

- [ ] **Step 4: Lint**

Run: `npx eslint src/lib/rateLimit.js`
Expected: No errors

- [ ] **Step 5: Deploy and verify**

Run: `npm run cf:deploy`
Expected: Deploy succeeds. Rate-limited endpoints (checkout) use D1 atomic increment.

- [ ] **Step 6: Commit**

```bash
git add migrations/0002_rate_limits.sql src/lib/rateLimit.js
git commit -m "feat: migrate rate limiting to D1 with atomic increment"
```

---

### Task 2: Migrate user store to D1

**Files:**
- Create: `migrations/0003_users.sql`
- Modify: `src/lib/userStore.js`

- [ ] **Step 1: Write migration SQL**

Create `migrations/0003_users.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL DEFAULT '',
  username       TEXT NOT NULL DEFAULT '',
  avatar_public  INTEGER NOT NULL DEFAULT 0,
  password_hash  TEXT NOT NULL DEFAULT '',
  oauth_accounts TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
```

- [ ] **Step 2: Apply migration**

Run: `npx wrangler d1 execute sofiacerne --remote --file=migrations/0003_users.sql`
Expected: Success.

- [ ] **Step 3: Add D1 helper functions to userStore.js**

At the top of `src/lib/userStore.js`, after the existing imports, add:

```javascript
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function userRowToObject(row) {
  if (!row) return null;
  let oauthAccounts = [];
  try {
    oauthAccounts = JSON.parse(row.oauth_accounts || "[]");
  } catch { /* ignore */ }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    avatarPublic: row.avatar_public === 1,
    passwordHash: row.password_hash,
    oauthAccounts: Array.isArray(oauthAccounts) ? oauthAccounts : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4: Update findUserByEmail with D1 path**

Add the D1 path at the start of `findUserByEmail`:

```javascript
export async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const db = await tryGetD1();
  if (db) {
    const row = await db
      .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
      .bind(normalized)
      .first();
    if (!row) return null;
    const user = userRowToObject(row);
    const expectedUsername = resolveImmutableUsername(user);
    const expectedAvatarPublic = normalizeAvatarPublic(user.avatarPublic);
    if (user.username !== expectedUsername || user.avatarPublic !== expectedAvatarPublic) {
      await db
        .prepare("UPDATE users SET username = ?, avatar_public = ?, updated_at = ? WHERE id = ?")
        .bind(expectedUsername, expectedAvatarPublic ? 1 : 0, new Date().toISOString(), user.id)
        .run();
      user.username = expectedUsername;
      user.avatarPublic = expectedAvatarPublic;
    }
    return user;
  }

  // existing KV/local path below (unchanged)
  const users = await readUsers();
  // ... rest of existing code
```

- [ ] **Step 5: Update createUser with D1 path**

Add the D1 path at the start of `createUser`:

```javascript
export async function createUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPassword = typeof password === "string" ? password : "";

  if (!normalizedEmail || !trimmedName || trimmedPassword.length < 8) {
    throw new Error("Invalid registration input");
  }

  const db = await tryGetD1();
  if (db) {
    const userId = crypto.randomUUID();
    const username = buildOpaqueEmailDerivedUsername(normalizedEmail);
    const passwordHash = hashPassword(trimmedPassword);
    const now = new Date().toISOString();
    try {
      await db
        .prepare(
          "INSERT INTO users (id, email, name, username, avatar_public, password_hash, oauth_accounts, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, '[]', ?, ?)",
        )
        .bind(userId, normalizedEmail, trimmedName, username, passwordHash, now, now)
        .run();
    } catch (err) {
      if (String(err).includes("UNIQUE constraint failed")) {
        throw new Error("Email already exists");
      }
      throw err;
    }
    return toPublicUser({ id: userId, name: trimmedName, email: normalizedEmail, username, avatarPublic: false });
  }

  // existing KV/local path below (unchanged)
  const users = await readUsers();
  // ... rest of existing code
```

- [ ] **Step 6: Update validateUserPassword with D1 path**

Add the D1 path:

```javascript
export async function validateUserPassword(email, password) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) return null;
  return toPublicUser(user);
}
```

No change needed — `findUserByEmail` already has the D1 path and returns the full user object including `passwordHash`.

- [ ] **Step 7: Update updateUserPassword with D1 path**

Add the D1 path at the start of `updateUserPassword`:

```javascript
export async function updateUserPassword(email, newPassword) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || typeof newPassword !== "string" || newPassword.length < 8) {
    throw new Error("Invalid input");
  }

  const db = await tryGetD1();
  if (db) {
    const row = await db
      .prepare("SELECT id, name, email, username, avatar_public FROM users WHERE email = ? LIMIT 1")
      .bind(normalizedEmail)
      .first();
    if (!row) throw new Error("User not found");
    const newHash = hashPassword(newPassword);
    const now = new Date().toISOString();
    await db
      .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(newHash, now, row.id)
      .run();
    return toPublicUser(userRowToObject({ ...row, password_hash: newHash, updated_at: now }));
  }

  // existing KV/local path below (unchanged)
  const users = await readUsers();
  // ... rest of existing code
```

- [ ] **Step 8: Update listUsers with D1 path**

Add the D1 path at the start of `listUsers`:

```javascript
export async function listUsers() {
  const db = await tryGetD1();
  if (db) {
    const { results } = await db.prepare("SELECT * FROM users").all();
    return (results || [])
      .map((row) => {
        const user = userRowToObject(row);
        return {
          id: user.id,
          username: resolveImmutableUsername(user),
          name: user.name || user.email || "Unknown",
          email: user.email,
          avatarPublic: normalizeAvatarPublic(user.avatarPublic),
          createdAt: user.createdAt || "",
        };
      })
      .filter((user) => user.email.includes("@"));
  }

  // existing KV/local path below (unchanged)
  const users = await readUsers();
  // ... rest of existing code
```

- [ ] **Step 9: Update upsertOAuthUser with D1 path**

Add the D1 path at the start of `upsertOAuthUser`:

```javascript
export async function upsertOAuthUser({ email, name, provider, providerAccountId }) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedEmail) {
    throw new Error("OAuth provider did not return a valid email");
  }

  const nextOAuthAccount = {
    provider,
    providerAccountId: String(providerAccountId || ""),
  };

  const db = await tryGetD1();
  if (db) {
    const existing = await db
      .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
      .bind(normalizedEmail)
      .first();

    if (existing) {
      let oauthAccounts = [];
      try { oauthAccounts = JSON.parse(existing.oauth_accounts || "[]"); } catch { /* ignore */ }
      if (!Array.isArray(oauthAccounts)) oauthAccounts = [];
      const exists = oauthAccounts.some(
        (a) => a?.provider === nextOAuthAccount.provider && a?.providerAccountId === nextOAuthAccount.providerAccountId,
      );
      if (!exists) oauthAccounts.push(nextOAuthAccount);
      const now = new Date().toISOString();
      await db
        .prepare("UPDATE users SET name = ?, oauth_accounts = ?, updated_at = ? WHERE id = ?")
        .bind(trimmedName || existing.name, JSON.stringify(oauthAccounts), now, existing.id)
        .run();
      return toPublicUser(userRowToObject({ ...existing, name: trimmedName || existing.name, oauth_accounts: JSON.stringify(oauthAccounts), updated_at: now }));
    }

    const newUserId = crypto.randomUUID();
    const username = buildOpaqueEmailDerivedUsername(normalizedEmail);
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO users (id, email, name, username, avatar_public, password_hash, oauth_accounts, created_at, updated_at) VALUES (?, ?, ?, ?, 0, '', ?, ?, ?)",
      )
      .bind(newUserId, normalizedEmail, trimmedName || normalizedEmail.split("@")[0], username, JSON.stringify([nextOAuthAccount]), now, now)
      .run();
    return toPublicUser({ id: newUserId, name: trimmedName || normalizedEmail.split("@")[0], email: normalizedEmail, username, avatarPublic: false });
  }

  // existing KV/local path below (unchanged)
  const users = await readUsers();
  // ... rest of existing code
```

- [ ] **Step 10: Lint**

Run: `npx eslint src/lib/userStore.js`
Expected: No errors

- [ ] **Step 11: Deploy and verify**

Run: `npm run cf:deploy`
Expected: Deploy succeeds. Login, registration, OAuth all work via D1.

- [ ] **Step 12: Commit**

```bash
git add migrations/0003_users.sql src/lib/userStore.js
git commit -m "feat: migrate user store to D1 with unique email constraint"
```

---

### Task 3: Migrate products catalog to D1

**Files:**
- Create: `migrations/0004_products.sql`
- Modify: `src/lib/digitalProducts.js`

- [ ] **Step 1: Write migration SQL**

Create `migrations/0004_products.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration**

Run: `npx wrangler d1 execute sofiacerne --remote --file=migrations/0004_products.sql`
Expected: Success.

- [ ] **Step 3: Add D1 helpers to digitalProducts.js**

At the top of `src/lib/digitalProducts.js`, after existing imports, add:

```javascript
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function productRowToObject(row) {
  if (!row) return null;
  let categories = {};
  try { categories = JSON.parse(row.categories || "{}"); } catch { /* ignore */ }
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    title: row.title || row.name,
    description: row.description,
    imageUrl: row.image_url,
    type: row.type,
    productMode: row.product_mode,
    priceCents: row.price_cents,
    free: row.free === 1,
    currency: row.currency,
    fileUrl: row.file_url,
    contentUri: row.content_uri,
    mimeType: row.mime_type,
    assetId: row.asset_id,
    vatPercent: row.vat_percent,
    active: row.active === 1,
    updatedAt: row.updated_at,
    ...categories,
  };
}

function productObjectToRow(p) {
  const { id, slug, name, title, description, imageUrl, type, productMode,
    priceCents, free, currency, fileUrl, contentUri, mimeType, assetId,
    vatPercent, active, updatedAt, ...rest } = p;
  // Everything that isn't a column goes into categories JSON
  const cats = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) cats[k] = v;
  }
  return {
    slug, name, title: title || name, description: description || "",
    image_url: imageUrl || "", type: type || "digital_file",
    product_mode: productMode || "digital_file",
    price_cents: priceCents || 0, currency: currency || "SEK",
    free: free ? 1 : 0, active: active !== false ? 1 : 0,
    file_url: fileUrl || "", content_uri: contentUri || "",
    mime_type: mimeType || "", asset_id: assetId || "",
    vat_percent: vatPercent ?? null,
    categories: JSON.stringify(cats),
    updated_at: updatedAt || new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Update listDigitalProducts with D1 path**

Add D1 path at the start of `listDigitalProducts`:

```javascript
export async function listDigitalProducts({ includeInactive = false } = {}) {
  try {
    const db = await tryGetD1();
    if (db) {
      const query = includeInactive
        ? "SELECT * FROM products ORDER BY updated_at DESC"
        : "SELECT * FROM products WHERE active = 1 ORDER BY updated_at DESC";
      const { results } = await db.prepare(query).all();
      return (results || []).map(productRowToObject).filter(Boolean);
    }

    // existing KV path (unchanged)
    const rawProducts = await readProducts();
    const products = sanitizeProducts(rawProducts);
    return includeInactive
      ? products
      : products.filter((product) => product.active);
  } catch (error) {
    console.error("Failed to read product catalog:", error);
    return [];
  }
}
```

- [ ] **Step 5: Update getDigitalProductBySlug with D1 path**

Add D1 path:

```javascript
export async function getDigitalProductBySlug(slug) {
  const rawSlug = String(slug || "").trim().replace(/^\/+|\/+$/g, "");
  const decodedSlug = (() => {
    if (!rawSlug) return "";
    try { return decodeURIComponent(rawSlug); } catch { return rawSlug; }
  })();
  const safeSlug = slugify(decodedSlug);
  const safeAssetId = normalizeAssetId(decodedSlug);
  if (!safeSlug && !safeAssetId) return null;

  const db = await tryGetD1();
  if (db) {
    let row = null;
    if (safeSlug) {
      row = await db.prepare("SELECT * FROM products WHERE slug = ? LIMIT 1").bind(safeSlug).first();
    }
    if (!row && safeAssetId) {
      row = await db.prepare("SELECT * FROM products WHERE product_mode = 'asset' AND asset_id = ? LIMIT 1").bind(safeAssetId).first();
    }
    return row ? productRowToObject(row) : null;
  }

  // existing KV path (unchanged)
  const products = await listDigitalProducts({ includeInactive: true });
  return (
    products.find(
      (product) =>
        product.slug === safeSlug ||
        (product.productMode === "asset" && product.assetId === safeAssetId),
    ) || null
  );
}
```

- [ ] **Step 6: Update getDigitalProductByAssetId with D1 path**

```javascript
export async function getDigitalProductByAssetId(assetId) {
  const safeAssetId = normalizeAssetId(assetId);
  if (!safeAssetId) return null;

  const db = await tryGetD1();
  if (db) {
    const row = await db
      .prepare("SELECT * FROM products WHERE product_mode = 'asset' AND asset_id = ? LIMIT 1")
      .bind(safeAssetId)
      .first();
    return row ? productRowToObject(row) : null;
  }

  // existing KV path (unchanged)
  const products = await listDigitalProducts({ includeInactive: true });
  return (
    products.find(
      (product) =>
        product.productMode === "asset" && product.assetId === safeAssetId,
    ) || null
  );
}
```

- [ ] **Step 7: Update saveDigitalProducts with D1 path**

```javascript
export async function saveDigitalProducts(products) {
  const safeProducts = sanitizeProducts(products);

  const db = await tryGetD1();
  if (db) {
    // Upsert all products in a batch
    for (const p of safeProducts) {
      const r = productObjectToRow(p);
      await db
        .prepare(
          `INSERT INTO products (slug, name, title, description, image_url, type, product_mode, price_cents, currency, free, active, file_url, content_uri, mime_type, asset_id, vat_percent, categories, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             name=excluded.name, title=excluded.title, description=excluded.description,
             image_url=excluded.image_url, type=excluded.type, product_mode=excluded.product_mode,
             price_cents=excluded.price_cents, currency=excluded.currency, free=excluded.free,
             active=excluded.active, file_url=excluded.file_url, content_uri=excluded.content_uri,
             mime_type=excluded.mime_type, asset_id=excluded.asset_id, vat_percent=excluded.vat_percent,
             categories=excluded.categories, updated_at=excluded.updated_at`,
        )
        .bind(r.slug, r.name, r.title, r.description, r.image_url, r.type, r.product_mode, r.price_cents, r.currency, r.free, r.active, r.file_url, r.content_uri, r.mime_type, r.asset_id, r.vat_percent, r.categories, r.updated_at)
        .run();
    }
    return safeProducts;
  }

  // existing KV path (unchanged)
  await writeProducts(safeProducts);
  return safeProducts;
}
```

- [ ] **Step 8: Lint**

Run: `npx eslint src/lib/digitalProducts.js`
Expected: No errors

- [ ] **Step 9: Deploy and verify**

Run: `npm run cf:deploy`
Expected: Deploy succeeds. Shop listing, product pages, admin product editor all work.

- [ ] **Step 10: Commit**

```bash
git add migrations/0004_products.sql src/lib/digitalProducts.js
git commit -m "feat: migrate products catalog to D1 with per-product queries"
```

---

### Task 4: Migrate media asset registry to D1

**Files:**
- Create: `migrations/0005_media_assets.sql`
- Modify: `src/lib/mediaAssetRegistry.js`

- [ ] **Step 1: Write migration SQL**

Create `migrations/0005_media_assets.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration**

Run: `npx wrangler d1 execute sofiacerne --remote --file=migrations/0005_media_assets.sql`
Expected: Success.

- [ ] **Step 3: Add D1 helpers to mediaAssetRegistry.js**

After the existing imports in `src/lib/mediaAssetRegistry.js`, add:

```javascript
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function assetRowToObject(row) {
  if (!row) return null;
  let metadata = {}, rights = {}, assetInfo = {};
  try { metadata = JSON.parse(row.metadata || "{}"); } catch { /* ignore */ }
  try { rights = JSON.parse(row.rights || "{}"); } catch { /* ignore */ }
  try { assetInfo = JSON.parse(row.asset_info || "{}"); } catch { /* ignore */ }
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    key: row.key,
    title: row.title,
    url: row.url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    metadata,
    rights,
    asset: assetInfo,
    createdAt: row.created_at,
    savedAt: row.saved_at,
    updatedAt: row.saved_at,
  };
}
```

- [ ] **Step 4: Update listMediaAssetRegistry with D1 path**

```javascript
export async function listMediaAssetRegistry() {
  const db = await tryGetD1();
  if (db) {
    const { results } = await db
      .prepare("SELECT * FROM media_assets ORDER BY saved_at DESC")
      .all();
    return (results || []).map(assetRowToObject).filter(Boolean);
  }

  // existing KV path (unchanged)
  const state = await readState();
  return state.assets;
}
```

- [ ] **Step 5: Update upsertMediaAssetRegistry with D1 path**

```javascript
export async function upsertMediaAssetRegistry(entry) {
  const id = safeText(entry?.id, 180) || `r2:${safeText(entry?.key, 512).replace(/^\/+/, "")}`;

  const db = await tryGetD1();
  if (db) {
    const existingRow = await db.prepare("SELECT * FROM media_assets WHERE id = ?").bind(id).first();
    const existing = existingRow ? assetRowToObject(existingRow) : null;
    const next = sanitizeAssetEntry({ ...existing, ...entry, id }, existing);
    if (!next) throw new Error("Invalid media asset registry entry.");
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO media_assets (id, source, source_id, key, title, url, mime_type, size_bytes, width, height, metadata, rights, asset_info, created_at, saved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source=excluded.source, source_id=excluded.source_id, key=excluded.key,
           title=excluded.title, url=excluded.url, mime_type=excluded.mime_type,
           size_bytes=excluded.size_bytes, width=excluded.width, height=excluded.height,
           metadata=excluded.metadata, rights=excluded.rights, asset_info=excluded.asset_info,
           saved_at=excluded.saved_at`,
      )
      .bind(
        next.id, next.source || "r2", next.sourceId || "", next.key, next.title,
        next.url, next.mimeType || "", next.sizeBytes ?? null, next.width ?? null,
        next.height ?? null, JSON.stringify(next.metadata || {}),
        JSON.stringify(next.rights || {}), JSON.stringify(next.asset || {}),
        next.createdAt || now, now,
      )
      .run();
    return next;
  }

  // existing KV path (unchanged)
  const state = await readState();
  const currentIndex = state.assets.findIndex((row) => row.id === id);
  const current = currentIndex >= 0 ? state.assets[currentIndex] : null;
  const next = sanitizeAssetEntry({ ...current, ...entry, id }, current);
  if (!next) throw new Error("Invalid media asset registry entry.");
  if (currentIndex >= 0) {
    state.assets[currentIndex] = next;
  } else {
    state.assets.unshift(next);
  }
  const saved = await writeState(state);
  return saved.assets.find((row) => row.id === next.id) || next;
}
```

- [ ] **Step 6: Update getMediaAssetRegistryStorageInfo**

```javascript
export function getMediaAssetRegistryStorageInfo() {
  return {
    provider: "d1+kv-fallback",
    key: KV_KEY,
  };
}
```

- [ ] **Step 7: Lint, deploy, commit**

Run: `npx eslint src/lib/mediaAssetRegistry.js && npm run cf:deploy`

```bash
git add migrations/0005_media_assets.sql src/lib/mediaAssetRegistry.js
git commit -m "feat: migrate media asset registry to D1"
```

---

### Task 5: Migrate avatar store to D1

**Files:**
- Create: `migrations/0006_avatars.sql`
- Modify: `src/lib/avatarStore.js`

- [ ] **Step 1: Write migration SQL**

Create `migrations/0006_avatars.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration**

Run: `npx wrangler d1 execute sofiacerne --remote --file=migrations/0006_avatars.sql`
Expected: Success.

- [ ] **Step 3: Add D1 helpers to avatarStore.js**

After existing imports in `src/lib/avatarStore.js`, add:

```javascript
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function avatarRowToObject(row, relationships = []) {
  if (!row) return null;
  let details = {};
  try { details = JSON.parse(row.details || "{}"); } catch { /* ignore */ }
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    isPublic: row.is_public === 1,
    canonicalName: row.canonical_name || "",
    profileImageUrl: row.profile_image_url || "",
    bio: row.bio || "",
    details,
    relationshipsOut: relationships.map((r) => ({
      toAvatarId: r.to_avatar_id,
      kind: r.kind,
      note: r.note || "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function d1GetAvatarWithRels(db, whereClause, bindValues) {
  const row = await db.prepare(`SELECT * FROM avatars WHERE ${whereClause} LIMIT 1`).bind(...bindValues).first();
  if (!row) return null;
  const { results: rels } = await db
    .prepare("SELECT * FROM avatar_relationships WHERE from_avatar_id = ?")
    .bind(row.id)
    .all();
  return avatarRowToObject(row, rels || []);
}
```

- [ ] **Step 4: Update getOwnAvatar with D1 path**

```javascript
export async function getOwnAvatar(user) {
  const ownerUserId = String(user?.id || "").trim();
  if (!ownerUserId) return null;

  const db = await tryGetD1();
  if (db) {
    const avatar = await d1GetAvatarWithRels(db, "owner_user_id = ?", [ownerUserId]);
    return avatar ? serializeAvatarForOwner(avatar) : null;
  }

  // existing KV/local path (unchanged)
  const resolved = await findOwnAvatarWithState(user);
  if (!resolved?.avatar) return null;
  return serializeAvatarForOwner(resolved.avatar);
}
```

- [ ] **Step 5: Update createOwnAvatar with D1 path**

```javascript
export async function createOwnAvatar(user, initialPatch = {}) {
  const ownerUserId = String(user?.id || "").trim();
  if (!ownerUserId) throw new Error("Invalid user identity.");

  const db = await tryGetD1();
  if (db) {
    const existing = await d1GetAvatarWithRels(db, "owner_user_id = ?", [ownerUserId]);
    if (existing) return { avatar: serializeAvatarForOwner(existing), created: false };

    const ownerEmail = normalizeEmail(user?.email || "");
    const preferredId = deriveAvatarIdFromEmail(ownerEmail);
    const idCheck = preferredId ? await db.prepare("SELECT 1 FROM avatars WHERE id = ?").bind(preferredId).first() : true;
    const avatarId = (preferredId && !idCheck) ? preferredId : randomAvatarId(new Set());
    const now = new Date().toISOString();

    const canonicalName = normalizeCanonicalName(initialPatch?.canonicalName || "");
    const isPublic = initialPatch?.isPublic === true ? 1 : 0;
    const profileImageUrl = typeof initialPatch?.profileImageUrl === "string" && isValidHttpUrl(initialPatch.profileImageUrl) ? initialPatch.profileImageUrl.trim() : "";
    const bio = typeof initialPatch?.bio === "string" ? initialPatch.bio.trim() : "";
    const details = JSON.stringify(sanitizeDetails(initialPatch?.details || {}));

    try {
      await db
        .prepare(
          "INSERT INTO avatars (id, owner_user_id, canonical_name, is_public, profile_image_url, bio, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(avatarId, ownerUserId, canonicalName || null, isPublic, profileImageUrl, bio, details, now, now)
        .run();
    } catch (err) {
      if (String(err).includes("UNIQUE constraint failed") && String(err).includes("canonical_name")) {
        throw new Error("Canonical name is already registered by another avatar.");
      }
      throw err;
    }

    const created = await d1GetAvatarWithRels(db, "id = ?", [avatarId]);
    return { avatar: serializeAvatarForOwner(created), created: true };
  }

  // existing KV/local path (unchanged)
  const existing = await findOwnAvatarWithState(user);
  // ... rest of existing code
```

- [ ] **Step 6: Update getPublicAvatarById with D1 path**

```javascript
export async function getPublicAvatarById(avatarId) {
  const safeAvatarId = normalizeAvatarId(avatarId);
  if (!safeAvatarId) return null;

  const db = await tryGetD1();
  if (db) {
    const avatar = await d1GetAvatarWithRels(db, "id = ? AND is_public = 1", [safeAvatarId]);
    return avatar ? serializeAvatarForPublic(avatar) : null;
  }

  // existing KV/local path (unchanged)
  const state = await getState();
  // ... rest of existing code
```

- [ ] **Step 7: Update getAvatarForProfileHandle with D1 path**

```javascript
export async function getAvatarForProfileHandle(handle, { viewerUserId = "" } = {}) {
  const rawHandle = String(handle || "").trim();
  if (!rawHandle) return null;
  let decoded = rawHandle;
  try { decoded = decodeURIComponent(rawHandle); } catch { decoded = rawHandle; }
  const safeHandle = decoded.trim();
  if (!safeHandle) return null;

  const db = await tryGetD1();
  if (db) {
    const avatarId = normalizeAvatarId(safeHandle);
    let avatar = null;
    if (avatarId) {
      avatar = await d1GetAvatarWithRels(db, "id = ?", [avatarId]);
    } else {
      avatar = await d1GetAvatarWithRels(db, "canonical_name = ? COLLATE NOCASE", [safeHandle]);
    }
    if (!avatar) return null;
    const isOwner = typeof viewerUserId === "string" && viewerUserId.trim() !== "" && avatar.ownerUserId === viewerUserId.trim();
    if (avatar.isPublic !== true && !isOwner) return null;
    const base = isOwner ? serializeAvatarForOwner(avatar) : serializeAvatarForPublic(avatar);
    return { ...base, isOwner, isPublic: avatar.isPublic === true, canonicalProfilePath: buildCanonicalAvatarProfilePath(avatar) };
  }

  // existing KV/local path (unchanged)
  const state = await getState();
  // ... rest of existing code
```

- [ ] **Step 8: Update updateOwnAvatar with D1 path**

```javascript
export async function updateOwnAvatar(user, patch = {}) {
  const ownerUserId = String(user?.id || "").trim();
  if (!ownerUserId) throw new Error("Avatar not found. Create an avatar first.");

  const db = await tryGetD1();
  if (db) {
    const current = await d1GetAvatarWithRels(db, "owner_user_id = ?", [ownerUserId]);
    if (!current) throw new Error("Avatar not found. Create an avatar first.");

    const updates = [];
    const binds = [];

    if (Object.prototype.hasOwnProperty.call(patch, "isPublic")) {
      updates.push("is_public = ?");
      binds.push(patch.isPublic === true ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "canonicalName")) {
      const cn = normalizeCanonicalName(patch.canonicalName);
      if (patch.canonicalName && !cn) throw new Error("Invalid canonical name (must be UTF-8 up to 128 bytes).");
      updates.push("canonical_name = ?");
      binds.push(cn || null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "profileImageUrl")) {
      const url = typeof patch.profileImageUrl === "string" ? patch.profileImageUrl.trim() : "";
      if (!isValidHttpUrl(url)) throw new Error("Invalid profile image URL.");
      updates.push("profile_image_url = ?");
      binds.push(url);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "bio")) {
      const bio = typeof patch.bio === "string" ? patch.bio.trim() : "";
      if (Buffer.byteLength(bio, "utf8") > 8192) throw new Error("Bio is too long.");
      updates.push("bio = ?");
      binds.push(bio);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "details")) {
      updates.push("details = ?");
      binds.push(JSON.stringify(sanitizeDetails(patch.details)));
    }

    if (updates.length > 0) {
      const now = new Date().toISOString();
      updates.push("updated_at = ?");
      binds.push(now, current.id);
      try {
        await db.prepare(`UPDATE avatars SET ${updates.join(", ")} WHERE id = ?`).bind(...binds).run();
      } catch (err) {
        if (String(err).includes("UNIQUE constraint failed") && String(err).includes("canonical_name")) {
          throw new Error("Canonical name is already registered by another avatar.");
        }
        throw err;
      }
    }

    const updated = await d1GetAvatarWithRels(db, "id = ?", [current.id]);
    return serializeAvatarForOwner(updated);
  }

  // existing KV/local path (unchanged)
  const resolved = await findOwnAvatarWithState(user);
  // ... rest of existing code
```

- [ ] **Step 9: Update upsertOwnAvatarRelationship with D1 path**

```javascript
export async function upsertOwnAvatarRelationship(user, { toAvatarId, kind = "follow", note = "" } = {}) {
  const safeToAvatarId = normalizeAvatarId(toAvatarId);
  if (!safeToAvatarId) throw new Error("Invalid target avatar id.");

  const db = await tryGetD1();
  if (db) {
    const ownerUserId = String(user?.id || "").trim();
    const source = await db.prepare("SELECT * FROM avatars WHERE owner_user_id = ? LIMIT 1").bind(ownerUserId).first();
    if (!source) throw new Error("Avatar not found. Create an avatar first.");
    if (source.id === safeToAvatarId) throw new Error("Avatar relationship target must be different from source.");
    const target = await db.prepare("SELECT 1 FROM avatars WHERE id = ?").bind(safeToAvatarId).first();
    if (!target) throw new Error("Target avatar not found.");

    const safeKind = normalizeRelationshipKind(kind);
    const safeNote = typeof note === "string" && Buffer.byteLength(note, "utf8") <= 512 ? note.trim() : "";
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO avatar_relationships (from_avatar_id, to_avatar_id, kind, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(from_avatar_id, to_avatar_id, kind) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
      )
      .bind(source.id, safeToAvatarId, safeKind, safeNote, now, now)
      .run();

    const updated = await d1GetAvatarWithRels(db, "id = ?", [source.id]);
    return serializeAvatarForOwner(updated);
  }

  // existing KV/local path (unchanged)
  const resolved = await findOwnAvatarWithState(user);
  // ... rest of existing code
```

- [ ] **Step 10: Update removeOwnAvatarRelationship with D1 path**

```javascript
export async function removeOwnAvatarRelationship(user, { toAvatarId, kind = "follow" } = {}) {
  const safeToAvatarId = normalizeAvatarId(toAvatarId);
  if (!safeToAvatarId) throw new Error("Invalid target avatar id.");
  const safeKind = normalizeRelationshipKind(kind);

  const db = await tryGetD1();
  if (db) {
    const ownerUserId = String(user?.id || "").trim();
    const source = await db.prepare("SELECT * FROM avatars WHERE owner_user_id = ? LIMIT 1").bind(ownerUserId).first();
    if (!source) throw new Error("Avatar not found. Create an avatar first.");
    await db
      .prepare("DELETE FROM avatar_relationships WHERE from_avatar_id = ? AND to_avatar_id = ? AND kind = ?")
      .bind(source.id, safeToAvatarId, safeKind)
      .run();

    const updated = await d1GetAvatarWithRels(db, "id = ?", [source.id]);
    return serializeAvatarForOwner(updated);
  }

  // existing KV/local path (unchanged)
  const resolved = await findOwnAvatarWithState(user);
  // ... rest of existing code
```

- [ ] **Step 11: Lint, deploy, commit**

Run: `npx eslint src/lib/avatarStore.js && npm run cf:deploy`

```bash
git add migrations/0006_avatars.sql src/lib/avatarStore.js
git commit -m "feat: migrate avatar store to D1 with unique canonical name constraint"
```

---

### Task 6: Migrate content access store to D1

**Files:**
- Create: `migrations/0007_content_access.sql`
- Modify: `src/lib/contentAccessStore.js`

- [ ] **Step 1: Write migration SQL**

Create `migrations/0007_content_access.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration**

Run: `npx wrangler d1 execute sofiacerne --remote --file=migrations/0007_content_access.sql`
Expected: Success.

- [ ] **Step 3: Add D1 helpers to contentAccessStore.js**

After existing imports, add:

```javascript
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function accessRowToObject(row) {
  if (!row) return null;
  let allowedUsers = [];
  try { allowedUsers = JSON.parse(row.allowed_users || "[]"); } catch { /* ignore */ }
  return {
    allowedUsers: Array.isArray(allowedUsers) ? allowedUsers : [],
    priceCents: row.price_cents,
    currency: row.currency,
    vatPercent: row.vat_percent,
    active: row.active === 1,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4: Update getContentAccessState with D1 path**

```javascript
export async function getContentAccessState() {
  const db = await tryGetD1();
  if (db) {
    try {
      const { results } = await db.prepare("SELECT * FROM content_access").all();
      const courses = {};
      for (const row of results || []) {
        courses[row.course_uri] = accessRowToObject(row);
      }
      return { courses };
    } catch (error) {
      console.error("D1 content access read failed, falling back:", error);
    }
  }

  // existing KV/local path (unchanged)
  if (shouldUseCloudflareBackend()) {
    try {
      const cloudflareState = await readFromCloudflare();
      if (cloudflareState) return cloudflareState;
    } catch (error) {
      console.error("Cloudflare KV unavailable, using local course access store:", error);
    }
  }
  return readFromLocal();
}
```

- [ ] **Step 5: Update saveContentAccessState with D1 path**

```javascript
export async function saveContentAccessState(nextState) {
  const state = sanitizeState(nextState);

  const db = await tryGetD1();
  if (db) {
    try {
      for (const [uri, course] of Object.entries(state.courses)) {
        await db
          .prepare(
            `INSERT INTO content_access (course_uri, allowed_users, price_cents, currency, vat_percent, active, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(course_uri) DO UPDATE SET
               allowed_users=excluded.allowed_users, price_cents=excluded.price_cents,
               currency=excluded.currency, vat_percent=excluded.vat_percent,
               active=excluded.active, updated_at=excluded.updated_at`,
          )
          .bind(
            uri, JSON.stringify(course.allowedUsers), course.priceCents,
            course.currency, course.vatPercent ?? null, course.active ? 1 : 0,
            course.updatedAt || new Date().toISOString(),
          )
          .run();
      }
      return state;
    } catch (error) {
      console.error("D1 content access write failed, falling back:", error);
    }
  }

  // existing KV/local path (unchanged)
  if (shouldUseCloudflareBackend()) {
    try {
      const wroteCloudflare = await writeToCloudflare(state);
      if (wroteCloudflare) return state;
    } catch (error) {
      console.error("Cloudflare KV write failed, falling back to local file:", error);
    }
  }
  await writeToLocal(state);
  return state;
}
```

- [ ] **Step 6: Update hasContentAccess with D1 fast path**

```javascript
export async function hasContentAccess(courseUri, email) {
  const uri = normalizeContentUri(courseUri);
  const normalizedEmail = normalizeEmail(email);
  if (!uri || !normalizedEmail) return false;

  const db = await tryGetD1();
  if (db) {
    const row = await db
      .prepare("SELECT allowed_users FROM content_access WHERE course_uri = ? AND active = 1")
      .bind(uri)
      .first();
    if (!row) return false;
    let users = [];
    try { users = JSON.parse(row.allowed_users || "[]"); } catch { /* ignore */ }
    return Array.isArray(users) && users.includes(normalizedEmail);
  }

  // existing KV/local path (unchanged)
  const state = await getContentAccessState();
  const course = state.courses[uri];
  if (!course) return false;
  return Array.isArray(course.allowedUsers)
    ? course.allowedUsers.includes(normalizedEmail)
    : false;
}
```

- [ ] **Step 7: Lint, deploy, commit**

Run: `npx eslint src/lib/contentAccessStore.js && npm run cf:deploy`

```bash
git add migrations/0007_content_access.sql src/lib/contentAccessStore.js
git commit -m "feat: migrate content access store to D1"
```

---

### Task 7: Migrate chat history to D1

**Files:**
- Create: `migrations/0008_chat_messages.sql`
- Create: `src/lib/chatHistoryStore.js`
- Modify: `src/lib/cloudflareKv.js` — remove chat history functions

- [ ] **Step 1: Write migration SQL**

Create `migrations/0008_chat_messages.sql`:

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  history_key TEXT NOT NULL,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_history_key ON chat_messages (history_key, id);
```

- [ ] **Step 2: Apply migration**

Run: `npx wrangler d1 execute sofiacerne --remote --file=migrations/0008_chat_messages.sql`
Expected: Success.

- [ ] **Step 3: Create chatHistoryStore.js**

Create `src/lib/chatHistoryStore.js`:

```javascript
import { getD1Database } from "@/lib/d1Bindings";
import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
  deleteCloudflareKv,
} from "@/lib/cloudflareKv";

const MAX_MESSAGES = 40;

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

export async function saveChatHistory(historyKey, chatHistory) {
  const messages = Array.isArray(chatHistory)
    ? chatHistory.slice(-MAX_MESSAGES)
    : [];

  try {
    const db = await tryGetD1();
    if (db) {
      // Replace: clear then insert all (keeps it capped at MAX_MESSAGES)
      await db
        .prepare("DELETE FROM chat_messages WHERE history_key = ?")
        .bind(historyKey)
        .run();
      for (const msg of messages) {
        await db
          .prepare(
            "INSERT INTO chat_messages (history_key, role, content) VALUES (?, ?, ?)",
          )
          .bind(historyKey, msg.role || "user", msg.content || "")
          .run();
      }
      return true;
    }

    // KV fallback
    await writeCloudflareKvJson(`chat_history:${historyKey}`, messages);
    return true;
  } catch (error) {
    console.error("Failed to save chat history:", error);
    return false;
  }
}

export async function getChatHistory(historyKey) {
  try {
    const db = await tryGetD1();
    if (db) {
      const { results } = await db
        .prepare(
          "SELECT role, content FROM chat_messages WHERE history_key = ? ORDER BY id",
        )
        .bind(historyKey)
        .all();
      return (results || []).map((r) => ({ role: r.role, content: r.content }));
    }

    // KV fallback
    const history = await readCloudflareKvJson(`chat_history:${historyKey}`);
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.error("Failed to retrieve chat history:", error);
    return [];
  }
}

export async function clearChatHistory(historyKey) {
  try {
    const db = await tryGetD1();
    if (db) {
      await db
        .prepare("DELETE FROM chat_messages WHERE history_key = ?")
        .bind(historyKey)
        .run();
      return true;
    }

    await deleteCloudflareKv(`chat_history:${historyKey}`);
    return true;
  } catch (error) {
    console.error("Failed to clear chat history:", error);
    return false;
  }
}
```

- [ ] **Step 4: Remove chat history from cloudflareKv.js**

In `src/lib/cloudflareKv.js`, remove lines 126-146 (the `saveChatHistory` and `getChatHistory` functions and the `// ── Chat history ──` comment).

- [ ] **Step 5: Update chat API route imports**

Find all files importing `saveChatHistory` or `getChatHistory` from `cloudflareKv` and update imports to `@/lib/chatHistoryStore`. Use:

Run: `grep -rn "saveChatHistory\|getChatHistory" src/app/api/chat/`

Then update the imports in those files from:
```javascript
import { saveChatHistory, getChatHistory } from "@/lib/cloudflareKv";
```
to:
```javascript
import { saveChatHistory, getChatHistory } from "@/lib/chatHistoryStore";
```

Also find and update any `deleteCloudflareKv("chat_history:admin")` calls to use `clearChatHistory("admin")` from `chatHistoryStore`.

- [ ] **Step 6: Lint, deploy, commit**

Run: `npx eslint src/lib/chatHistoryStore.js src/lib/cloudflareKv.js && npm run cf:deploy`

```bash
git add migrations/0008_chat_messages.sql src/lib/chatHistoryStore.js src/lib/cloudflareKv.js src/app/api/chat/
git commit -m "feat: migrate chat history to D1 with atomic message append"
```

---

### Task 8: Migrate support tickets to D1

**Files:**
- Create: `migrations/0009_support_tickets.sql`
- Modify: `src/lib/supportTickets.js`

- [ ] **Step 1: Write migration SQL**

Create `migrations/0009_support_tickets.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration**

Run: `npx wrangler d1 execute sofiacerne --remote --file=migrations/0009_support_tickets.sql`
Expected: Success.

- [ ] **Step 3: Add D1 helpers to supportTickets.js**

After existing imports, add:

```javascript
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function ticketRowToObject(row, comments = []) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    comments: comments.map((c) => ({
      id: c.id,
      text: c.text,
      author: c.author,
      createdAt: c.created_at,
    })),
    buildTime: row.build_time,
    gitSha: row.git_sha,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4: Update listTickets with D1 path**

```javascript
export async function listTickets() {
  const db = await tryGetD1();
  if (db) {
    const { results: tickets } = await db
      .prepare("SELECT * FROM support_tickets ORDER BY created_at DESC")
      .all();
    const output = [];
    for (const row of tickets || []) {
      const { results: comments } = await db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at")
        .bind(row.id)
        .all();
      output.push(ticketRowToObject(row, comments || []));
    }
    return output;
  }

  // existing KV path (unchanged)
  const state = await getState();
  return state.tickets;
}
```

- [ ] **Step 5: Update createTicket with D1 path**

```javascript
export async function createTicket({
  title,
  description,
  priority = "moderate",
  author = "admin",
  buildTime = "",
  gitSha = "",
}) {
  const db = await tryGetD1();
  if (db) {
    const id = crypto.randomUUID?.() || `${Date.now()}`;
    const now = new Date().toISOString();
    const safeTitle = String(title || "Untitled").slice(0, 200);
    const safeDesc = String(description || "").slice(0, 5000);
    const safePriority = ["critical", "moderate", "low"].includes(priority) ? priority : "moderate";
    const safeBuild = typeof buildTime === "string" ? buildTime.slice(0, 40) : "";
    const safeSha = typeof gitSha === "string" ? gitSha.slice(0, 40) : "";
    await db
      .prepare(
        "INSERT INTO support_tickets (id, title, description, priority, status, build_time, git_sha, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)",
      )
      .bind(id, safeTitle, safeDesc, safePriority, safeBuild, safeSha, now, now)
      .run();
    return { id, title: safeTitle, description: safeDesc, priority: safePriority, status: "open", comments: [], buildTime: safeBuild, gitSha: safeSha, createdAt: now, updatedAt: now };
  }

  // existing KV path (unchanged)
  const state = await getState();
  // ... rest of existing code
```

- [ ] **Step 6: Update updateTicket with D1 path**

```javascript
export async function updateTicket(id, { status, comment, author = "admin" }) {
  const db = await tryGetD1();
  if (db) {
    const row = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first();
    if (!row) throw new Error("Ticket not found");

    const now = new Date().toISOString();
    if (status && ["open", "will-fix", "resolved"].includes(status)) {
      await db.prepare("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, id).run();
    } else {
      await db.prepare("UPDATE support_tickets SET updated_at = ? WHERE id = ?").bind(now, id).run();
    }
    if (comment && comment.trim()) {
      const commentId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      await db
        .prepare("INSERT INTO ticket_comments (id, ticket_id, text, author, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(commentId, id, comment.trim().slice(0, 2000), author, now)
        .run();
    }
    const { results: comments } = await db
      .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at")
      .bind(id)
      .all();
    const updated = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first();
    return ticketRowToObject(updated, comments || []);
  }

  // existing KV path (unchanged)
  const state = await getState();
  // ... rest of existing code
```

- [ ] **Step 7: Lint, deploy, commit**

Run: `npx eslint src/lib/supportTickets.js && npm run cf:deploy`

```bash
git add migrations/0009_support_tickets.sql src/lib/supportTickets.js
git commit -m "feat: migrate support tickets to D1 with normalized comments"
```

---

### Task 9: Final verification and cleanup

- [ ] **Step 1: Run full lint**

Run: `npx eslint src/lib/d1Bindings.js src/lib/rateLimit.js src/lib/userStore.js src/lib/digitalProducts.js src/lib/mediaAssetRegistry.js src/lib/avatarStore.js src/lib/contentAccessStore.js src/lib/chatHistoryStore.js src/lib/supportTickets.js src/lib/cloudflareKv.js src/lib/digitalAccessStore.js`
Expected: No errors

- [ ] **Step 2: Final deploy**

Run: `npm run cf:deploy`
Expected: Deploy succeeds with `env.DB (sofiacerne)` binding visible. All 10 tables in use (digital_access + 8 new + rate_limits).

- [ ] **Step 3: Verify D1 tables**

Run: `npx wrangler d1 execute sofiacerne --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"`
Expected: `avatar_relationships`, `avatars`, `chat_messages`, `content_access`, `digital_access`, `media_assets`, `products`, `rate_limits`, `support_tickets`, `ticket_comments`

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: KV-to-D1 migration complete — all 8 stores live on D1"
```
