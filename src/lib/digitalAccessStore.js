import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

function getKvKey() { return process.env.CF_DIGITAL_ACCESS_KV_KEY || "digital-access"; }
const LOCAL_ACCESS_FILE = ".data/digital-access.json";

let inMemoryState = { users: {} };

function canUseFs() {
  return (
    typeof process !== "undefined" &&
    process.versions?.node &&
    process.env.NEXT_RUNTIME !== "edge"
  );
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
      ? [...new Set(rawValue.productIds.map(normalizeProductId).filter(Boolean))]
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

function shouldUseCloudflareBackend() {
  return process.env.DIGITAL_ACCESS_STORE === "cloudflare" || isCloudflareKvConfigured();
}

async function ensureLocalStore() {
  if (!canUseFs()) return;
  const [{ promises: fs }, path] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);
  const dataDir = path.join(process.cwd(), ".data");
  const accessFile = path.join(process.cwd(), LOCAL_ACCESS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(accessFile);
  } catch {
    await fs.writeFile(accessFile, JSON.stringify({ users: {} }, null, 2), "utf8");
  }
}

async function readLocalState() {
  if (!canUseFs()) {
    console.warn("Local digital access store unavailable in this runtime; using in-memory fallback.");
    return inMemoryState;
  }
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const accessFile = path.join(process.cwd(), LOCAL_ACCESS_FILE);
    const raw = await fs.readFile(accessFile, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    console.error(
      "Local digital access store unavailable. Using in-memory fallback:",
      error,
    );
    return inMemoryState;
  }
}

async function writeLocalState(state) {
  if (!canUseFs()) {
    inMemoryState = state;
    return;
  }
  try {
    await ensureLocalStore();
    const [{ promises: fs }, path] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const accessFile = path.join(process.cwd(), LOCAL_ACCESS_FILE);
    await fs.writeFile(accessFile, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error(
      "Local digital access write unavailable. Updating in-memory fallback:",
      error,
    );
    inMemoryState = state;
  }
}

async function readCloudflareState() {
  const value = await readCloudflareKvJson(getKvKey());
  return value ? sanitizeState(value) : { users: {} };
}

async function writeCloudflareState(state) {
  return writeCloudflareKvJson(getKvKey(), state);
}

async function getState() {
  if (shouldUseCloudflareBackend()) {
    try {
      return await readCloudflareState();
    } catch (error) {
      console.error("Cloudflare KV digital access read failed, using local fallback:", error);
    }
  }
  return readLocalState();
}

async function saveState(state) {
  const safeState = sanitizeState(state);
  if (shouldUseCloudflareBackend()) {
    try {
      const wrote = await writeCloudflareState(safeState);
      if (wrote) return safeState;
    } catch (error) {
      console.error(
        "Cloudflare KV digital access write failed, using local fallback:",
        error,
      );
    }
  }
  await writeLocalState(safeState);
  return safeState;
}

export async function grantDigitalAccess(productId, email) {
  const safeProductId = normalizeProductId(productId);
  const safeEmail = normalizeEmail(email);
  if (!safeProductId || !safeEmail) return;

  const state = await getState();
  const existing = state.users[safeEmail] || { productIds: [], updatedAt: "" };
  const productIds = Array.isArray(existing.productIds) ? [...existing.productIds] : [];
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

export async function listAccessibleDigitalProductIds(email) {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return [];
  const state = await getState();
  const user = state.users[safeEmail];
  if (!user || !Array.isArray(user.productIds)) return [];
  return [...new Set(user.productIds.map(normalizeProductId).filter(Boolean))];
}

export function getDigitalStorageInfo() {
  return shouldUseCloudflareBackend()
    ? { provider: "cloudflare-kv", key: getKvKey() }
    : { provider: "local-file", path: LOCAL_ACCESS_FILE };
}
