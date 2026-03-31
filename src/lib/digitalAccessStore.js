import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  readCloudflareKvJsonWithOptions,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

function getKvKey() {
  return process.env.CF_DIGITAL_ACCESS_KV_KEY || "digital-access";
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeProductId(productId) {
  return typeof productId === "string" ? productId.trim() : "";
}

function sanitizeState(state) {
  const users = {};
  const source = state && typeof state === "object" ? state.users : {};

  for (const [rawEmail, rawValue] of Object.entries(source || {})) {
    const email = normalizeEmail(rawEmail);
    if (!email) continue;
    const productIds = Array.isArray(rawValue?.productIds)
      ? [
          ...new Set(
            rawValue.productIds.map(normalizeProductId).filter(Boolean),
          ),
        ]
      : [];
    users[email] = {
      productIds,
      updatedAt:
        typeof rawValue?.updatedAt === "string"
          ? rawValue.updatedAt
          : new Date().toISOString(),
    };
  }

  return { users };
}

function assertKvConfigured() {
  if (isCloudflareKvConfigured()) return;
  throw new Error(
    "Cloudflare KV is required for digital access store. Configure CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID, CF_API_TOKEN/CLOUDFLARE_API_TOKEN, and CF_KV_NAMESPACE_ID.",
  );
}

async function readCloudflareState() {
  assertKvConfigured();
  const value = await readCloudflareKvJson(getKvKey());
  return value ? sanitizeState(value) : { users: {} };
}

async function readCloudflareStateUncached() {
  assertKvConfigured();
  const value = await readCloudflareKvJsonWithOptions(getKvKey(), {
    cacheMode: "no-store",
  });
  return value ? sanitizeState(value) : { users: {} };
}

async function writeCloudflareState(state) {
  assertKvConfigured();
  const wrote = await writeCloudflareKvJson(getKvKey(), state);
  if (!wrote) {
    throw new Error("Cloudflare KV write failed for digital access store.");
  }
  return true;
}

async function getState() {
  return readCloudflareState();
}

async function saveState(state) {
  const safeState = sanitizeState(state);
  await writeCloudflareState(safeState);
  return safeState;
}

export async function grantDigitalAccess(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return;

  const state = await getState();
  const existing = state.users[safeEmail] || { productIds: [], updatedAt: "" };
  const productIds = Array.isArray(existing.productIds)
    ? [...existing.productIds]
    : [];
  if (!productIds.includes(safeProductId)) productIds.push(safeProductId);

  state.users[safeEmail] = {
    productIds,
    updatedAt: new Date().toISOString(),
  };
  await saveState(state);
}

export async function hasDigitalAccess(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return false;

  const state = await getState();
  const user = state.users[safeEmail];
  if (!user || !Array.isArray(user.productIds)) return false;
  return user.productIds.includes(safeProductId);
}

/**
 * Same as hasDigitalAccess but bypasses KV fetch cache.
 * Use in write-then-read paths (e.g. immediately after granting access).
 */
export async function hasDigitalAccessUncached(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return false;

  const state = await readCloudflareStateUncached();
  const user = state.users[safeEmail];
  if (!user || !Array.isArray(user.productIds)) return false;
  return user.productIds.includes(safeProductId);
}

export async function listAccessibleDigitalProductIds(email) {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return [];
  const state = await getState();
  const user = state.users[safeEmail];
  if (!user || !Array.isArray(user.productIds)) return [];
  return [...new Set(user.productIds.map(normalizeProductId).filter(Boolean))];
}

export async function revokeDigitalAccess(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return;

  const state = await getState();
  const user = state.users[safeEmail];
  if (!user || !Array.isArray(user.productIds)) return;

  state.users[safeEmail] = {
    ...user,
    productIds: user.productIds.filter((id) => id !== safeProductId),
    updatedAt: new Date().toISOString(),
  };
  await saveState(state);
}

export async function listUsersWithProductAccess(productId) {
  const safeProductId = normalizeProductId(productId);
  if (!safeProductId) return [];
  const state = await getState();
  return Object.entries(state.users)
    .filter(
      ([, data]) =>
        Array.isArray(data.productIds) &&
        data.productIds.includes(safeProductId),
    )
    .map(([email]) => email);
}

export function getDigitalStorageInfo() {
  return {
    provider: "cloudflare-kv",
    key: getKvKey(),
    configured: isCloudflareKvConfigured(),
  };
}
