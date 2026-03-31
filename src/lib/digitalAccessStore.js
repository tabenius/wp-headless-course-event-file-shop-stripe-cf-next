import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  readCloudflareKvJsonWithOptions,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

// ── Key scheme ──────────────────────────────────────────────────────────────
// Per-user:    digital-access:user:{email}      → { productIds, updatedAt }
// Per-product: digital-access:product:{id}      → { emails, updatedAt }
// Legacy:      digital-access                   → { users: { email: { productIds } } }
//
// Writes always go to per-user + per-product keys (no cross-user conflicts).
// Reads fall back to the legacy blob for users not yet migrated.

function getLegacyKey() {
  return process.env.CF_DIGITAL_ACCESS_KV_KEY || "digital-access";
}

function getUserKey(email) {
  return `${getLegacyKey()}:user:${email}`;
}

function getProductKey(productId) {
  return `${getLegacyKey()}:product:${productId}`;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeProductId(productId) {
  return typeof productId === "string" ? productId.trim() : "";
}

function assertKvConfigured() {
  if (isCloudflareKvConfigured()) return;
  throw new Error(
    "Cloudflare KV is required for digital access store. Configure CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID, CF_API_TOKEN/CLOUDFLARE_API_TOKEN, and CF_KV_NAMESPACE_ID.",
  );
}

// ── Per-user reads ──────────────────────────────────────────────────────────

function sanitizeUserRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const productIds = Array.isArray(raw.productIds)
    ? [...new Set(raw.productIds.map(normalizeProductId).filter(Boolean))]
    : [];
  return {
    productIds,
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function sanitizeProductIndex(raw) {
  if (!raw || typeof raw !== "object") return null;
  const emails = Array.isArray(raw.emails)
    ? [...new Set(raw.emails.map(normalizeEmail).filter(Boolean))]
    : [];
  return { emails, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "" };
}

async function readUserRecord(email, { cached = true } = {}) {
  assertKvConfigured();
  const key = getUserKey(email);
  const raw = cached
    ? await readCloudflareKvJson(key)
    : await readCloudflareKvJsonWithOptions(key, { cacheMode: "no-store" });
  const record = sanitizeUserRecord(raw);
  if (record && record.productIds.length > 0) return record;

  // Fallback: check legacy single-blob for this user (one-time migration path)
  const legacy = cached
    ? await readCloudflareKvJson(getLegacyKey())
    : await readCloudflareKvJsonWithOptions(getLegacyKey(), { cacheMode: "no-store" });
  if (!legacy || typeof legacy !== "object") return record || { productIds: [], updatedAt: "" };
  const users = legacy.users || {};
  const userData = users[email];
  if (!userData) return record || { productIds: [], updatedAt: "" };
  const migrated = sanitizeUserRecord(userData);
  if (migrated && migrated.productIds.length > 0) {
    // Write to per-user key so we don't hit the legacy blob again
    await writeCloudflareKvJson(key, migrated).catch(() => {});
    return migrated;
  }
  return record || { productIds: [], updatedAt: "" };
}

async function writeUserRecord(email, record) {
  assertKvConfigured();
  const safe = sanitizeUserRecord(record) || { productIds: [], updatedAt: new Date().toISOString() };
  const wrote = await writeCloudflareKvJson(getUserKey(email), safe);
  if (!wrote) throw new Error("Cloudflare KV write failed for digital access (user key).");
}

async function readProductIndex(productId, { cached = true } = {}) {
  assertKvConfigured();
  const raw = cached
    ? await readCloudflareKvJson(getProductKey(productId))
    : await readCloudflareKvJsonWithOptions(getProductKey(productId), { cacheMode: "no-store" });
  return sanitizeProductIndex(raw) || { emails: [], updatedAt: "" };
}

async function writeProductIndex(productId, index) {
  assertKvConfigured();
  const safe = sanitizeProductIndex(index) || { emails: [], updatedAt: new Date().toISOString() };
  safe.updatedAt = new Date().toISOString();
  await writeCloudflareKvJson(getProductKey(productId), safe).catch((err) => {
    console.error("Failed to update product index:", err);
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function grantDigitalAccess(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return;

  // Per-user key — uncached read to minimize same-user race window
  const userRecord = await readUserRecord(safeEmail, { cached: false });
  if (!userRecord.productIds.includes(safeProductId)) {
    userRecord.productIds.push(safeProductId);
  }
  userRecord.updatedAt = new Date().toISOString();
  await writeUserRecord(safeEmail, userRecord);

  // Per-product reverse index (best-effort, used for admin queries only)
  const productIndex = await readProductIndex(safeProductId, { cached: false });
  if (!productIndex.emails.includes(safeEmail)) {
    productIndex.emails.push(safeEmail);
  }
  await writeProductIndex(safeProductId, productIndex);
}

export async function hasDigitalAccess(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return false;

  const record = await readUserRecord(safeEmail);
  return record.productIds.includes(safeProductId);
}

/**
 * Same as hasDigitalAccess but bypasses KV fetch cache.
 * Use in write-then-read paths (e.g. immediately after granting access).
 */
export async function hasDigitalAccessUncached(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return false;

  const record = await readUserRecord(safeEmail, { cached: false });
  return record.productIds.includes(safeProductId);
}

export async function listAccessibleDigitalProductIds(email) {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return [];
  const record = await readUserRecord(safeEmail);
  return [...new Set(record.productIds.map(normalizeProductId).filter(Boolean))];
}

export async function revokeDigitalAccess(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return;

  // Per-user key
  const userRecord = await readUserRecord(safeEmail, { cached: false });
  userRecord.productIds = userRecord.productIds.filter((id) => id !== safeProductId);
  userRecord.updatedAt = new Date().toISOString();
  await writeUserRecord(safeEmail, userRecord);

  // Per-product reverse index
  const productIndex = await readProductIndex(safeProductId, { cached: false });
  productIndex.emails = productIndex.emails.filter((e) => e !== safeEmail);
  await writeProductIndex(safeProductId, productIndex);
}

export async function listUsersWithProductAccess(productId) {
  const safeProductId = normalizeProductId(productId);
  if (!safeProductId) return [];

  // Try per-product index first
  const productIndex = await readProductIndex(safeProductId);
  if (productIndex.emails.length > 0) return productIndex.emails;

  // Fallback: scan legacy blob for backward compat
  try {
    const legacy = await readCloudflareKvJson(getLegacyKey());
    if (!legacy || typeof legacy !== "object") return [];
    const users = legacy.users || {};
    return Object.entries(users)
      .filter(
        ([, data]) =>
          Array.isArray(data?.productIds) &&
          data.productIds.includes(safeProductId),
      )
      .map(([email]) => normalizeEmail(email))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function getDigitalStorageInfo() {
  return {
    provider: "cloudflare-kv",
    key: getLegacyKey(),
    configured: isCloudflareKvConfigured(),
  };
}
