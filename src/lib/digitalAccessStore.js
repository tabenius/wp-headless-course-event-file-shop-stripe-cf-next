import { getD1Database } from "@/lib/d1Bindings";
import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  readCloudflareKvJsonWithOptions,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeProductId(productId) {
  return typeof productId === "string" ? productId.trim() : "";
}

// ── D1 backend ──────────────────────────────────────────────────────────────

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

async function d1Grant(db, productId, email) {
  await db
    .prepare(
      "INSERT OR IGNORE INTO digital_access (email, product_id) VALUES (?, ?)",
    )
    .bind(email, productId)
    .run();
}

async function d1Has(db, productId, email) {
  const row = await db
    .prepare(
      "SELECT 1 FROM digital_access WHERE email = ? AND product_id = ? LIMIT 1",
    )
    .bind(email, productId)
    .first();
  return Boolean(row);
}

async function d1ListProducts(db, email) {
  const { results } = await db
    .prepare("SELECT product_id FROM digital_access WHERE email = ?")
    .bind(email)
    .all();
  return (results || []).map((r) => r.product_id);
}

async function d1Revoke(db, productId, email) {
  await db
    .prepare(
      "DELETE FROM digital_access WHERE email = ? AND product_id = ?",
    )
    .bind(email, productId)
    .run();
}

async function d1ListUsers(db, productId) {
  const { results } = await db
    .prepare("SELECT email FROM digital_access WHERE product_id = ?")
    .bind(productId)
    .all();
  return (results || []).map((r) => r.email);
}

// ── KV fallback (per-user keys, backward compat) ───────────────────────────

function getLegacyKey() {
  return process.env.CF_DIGITAL_ACCESS_KV_KEY || "digital-access";
}

function getUserKey(email) {
  return `${getLegacyKey()}:user:${email}`;
}

function getProductKey(productId) {
  return `${getLegacyKey()}:product:${productId}`;
}

function assertKvConfigured() {
  if (isCloudflareKvConfigured()) return;
  throw new Error(
    "Neither D1 nor Cloudflare KV is configured for digital access store.",
  );
}

function sanitizeUserRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const productIds = Array.isArray(raw.productIds)
    ? [...new Set(raw.productIds.map(normalizeProductId).filter(Boolean))]
    : [];
  return {
    productIds,
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

function sanitizeProductIndex(raw) {
  if (!raw || typeof raw !== "object") return null;
  const emails = Array.isArray(raw.emails)
    ? [...new Set(raw.emails.map(normalizeEmail).filter(Boolean))]
    : [];
  return {
    emails,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

async function kvReadUserRecord(email, { cached = true } = {}) {
  assertKvConfigured();
  const key = getUserKey(email);
  const raw = cached
    ? await readCloudflareKvJson(key)
    : await readCloudflareKvJsonWithOptions(key, { cacheMode: "no-store" });
  const record = sanitizeUserRecord(raw);
  if (record && record.productIds.length > 0) return record;

  // Fallback: legacy single-blob
  const legacy = cached
    ? await readCloudflareKvJson(getLegacyKey())
    : await readCloudflareKvJsonWithOptions(getLegacyKey(), {
        cacheMode: "no-store",
      });
  if (!legacy || typeof legacy !== "object")
    return record || { productIds: [], updatedAt: "" };
  const userData = (legacy.users || {})[email];
  if (!userData) return record || { productIds: [], updatedAt: "" };
  const migrated = sanitizeUserRecord(userData);
  if (migrated && migrated.productIds.length > 0) {
    await writeCloudflareKvJson(key, migrated).catch(() => {});
    return migrated;
  }
  return record || { productIds: [], updatedAt: "" };
}

async function kvWriteUserRecord(email, record) {
  assertKvConfigured();
  const safe = sanitizeUserRecord(record) || {
    productIds: [],
    updatedAt: new Date().toISOString(),
  };
  const wrote = await writeCloudflareKvJson(getUserKey(email), safe);
  if (!wrote)
    throw new Error("Cloudflare KV write failed for digital access.");
}

async function kvReadProductIndex(productId, { cached = true } = {}) {
  assertKvConfigured();
  const raw = cached
    ? await readCloudflareKvJson(getProductKey(productId))
    : await readCloudflareKvJsonWithOptions(getProductKey(productId), {
        cacheMode: "no-store",
      });
  return sanitizeProductIndex(raw) || { emails: [], updatedAt: "" };
}

async function kvWriteProductIndex(productId, index) {
  assertKvConfigured();
  const safe = sanitizeProductIndex(index) || {
    emails: [],
    updatedAt: new Date().toISOString(),
  };
  safe.updatedAt = new Date().toISOString();
  await writeCloudflareKvJson(getProductKey(productId), safe).catch((err) => {
    console.error("Failed to update product index:", err);
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function grantDigitalAccess(productId, email) {
  const pid = normalizeProductId(productId);
  const em = normalizeEmail(email);
  if (!pid || !em) return;

  const db = await tryGetD1();
  if (db) {
    await d1Grant(db, pid, em);
    return;
  }

  // KV fallback
  const userRecord = await kvReadUserRecord(em, { cached: false });
  if (!userRecord.productIds.includes(pid)) userRecord.productIds.push(pid);
  userRecord.updatedAt = new Date().toISOString();
  await kvWriteUserRecord(em, userRecord);

  const productIndex = await kvReadProductIndex(pid, { cached: false });
  if (!productIndex.emails.includes(em)) productIndex.emails.push(em);
  await kvWriteProductIndex(pid, productIndex);
}

export async function hasDigitalAccess(productId, email) {
  const pid = normalizeProductId(productId);
  const em = normalizeEmail(email);
  if (!pid || !em) return false;

  const db = await tryGetD1();
  if (db) return d1Has(db, pid, em);

  const record = await kvReadUserRecord(em);
  return record.productIds.includes(pid);
}

export async function hasDigitalAccessUncached(productId, email) {
  const pid = normalizeProductId(productId);
  const em = normalizeEmail(email);
  if (!pid || !em) return false;

  // D1 reads are always consistent — no cache concern
  const db = await tryGetD1();
  if (db) return d1Has(db, pid, em);

  const record = await kvReadUserRecord(em, { cached: false });
  return record.productIds.includes(pid);
}

export async function listAccessibleDigitalProductIds(email) {
  const em = normalizeEmail(email);
  if (!em) return [];

  const db = await tryGetD1();
  if (db) return d1ListProducts(db, em);

  const record = await kvReadUserRecord(em);
  return [
    ...new Set(record.productIds.map(normalizeProductId).filter(Boolean)),
  ];
}

export async function revokeDigitalAccess(productId, email) {
  const pid = normalizeProductId(productId);
  const em = normalizeEmail(email);
  if (!pid || !em) return;

  const db = await tryGetD1();
  if (db) {
    await d1Revoke(db, pid, em);
    return;
  }

  const userRecord = await kvReadUserRecord(em, { cached: false });
  userRecord.productIds = userRecord.productIds.filter((id) => id !== pid);
  userRecord.updatedAt = new Date().toISOString();
  await kvWriteUserRecord(em, userRecord);

  const productIndex = await kvReadProductIndex(pid, { cached: false });
  productIndex.emails = productIndex.emails.filter((e) => e !== em);
  await kvWriteProductIndex(pid, productIndex);
}

export async function listUsersWithProductAccess(productId) {
  const pid = normalizeProductId(productId);
  if (!pid) return [];

  const db = await tryGetD1();
  if (db) return d1ListUsers(db, pid);

  // KV fallback: per-product index, then legacy blob
  try {
    const productIndex = await kvReadProductIndex(pid);
    if (productIndex.emails.length > 0) return productIndex.emails;

    const legacy = await readCloudflareKvJson(getLegacyKey());
    if (!legacy || typeof legacy !== "object") return [];
    return Object.entries(legacy.users || {})
      .filter(
        ([, data]) =>
          Array.isArray(data?.productIds) &&
          data.productIds.includes(pid),
      )
      .map(([e]) => normalizeEmail(e))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function getDigitalStorageInfo() {
  return {
    provider: "d1+kv-fallback",
    key: getLegacyKey(),
    configured: isCloudflareKvConfigured(),
  };
}
