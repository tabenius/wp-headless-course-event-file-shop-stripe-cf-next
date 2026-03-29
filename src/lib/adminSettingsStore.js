import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
  deleteCloudflareKv,
} from "./cloudflareKv.js";

const WC_PROXY_KEY = "settings:wc_proxy";
const WC_REST_API_KEY = "settings:wc_rest_api";
const STRIPE_KEYS_KEY = "settings:stripe_key_overrides";

const inMemory = {
  wcProxy: null,
  wcRestApi: null,
  stripeKeys: null,
};

function normalizeUrl(value, max = 500) {
  const raw = String(value || "").trim().slice(0, max);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeWcProxy(input) {
  const enabled = Boolean(input?.enabled);
  const url = normalizeUrl(input?.url);
  return {
    enabled,
    url: enabled ? url : "",
    updatedAt:
      typeof input?.updatedAt === "string" && input.updatedAt
        ? input.updatedAt
        : null,
  };
}

function normalizeStripeKeys(input) {
  const enabled = Boolean(input?.enabled);
  const secretKey = String(input?.secretKey || "")
    .trim()
    .slice(0, 240);
  const publishableKey = String(input?.publishableKey || "")
    .trim()
    .slice(0, 240);
  return {
    enabled,
    secretKey: enabled ? secretKey : "",
    publishableKey: enabled ? publishableKey : "",
    updatedAt:
      typeof input?.updatedAt === "string" && input.updatedAt
        ? input.updatedAt
        : null,
  };
}

function normalizeWcRestApi(input) {
  const wcUrl = normalizeUrl(input?.wcUrl);
  const consumerKey = String(input?.consumerKey || "")
    .trim()
    .slice(0, 240);
  const consumerSecret = String(input?.consumerSecret || "")
    .trim()
    .slice(0, 240);
  return {
    wcUrl,
    consumerKey,
    consumerSecret,
    sendOrders: Boolean(input?.sendOrders),
    readTax: Boolean(input?.readTax),
    updatedAt:
      typeof input?.updatedAt === "string" && input.updatedAt
        ? input.updatedAt
        : null,
  };
}

async function readJsonWithFallback(kvKey, memoryKey) {
  if (isCloudflareKvConfigured()) {
    try {
      return await readCloudflareKvJson(kvKey);
    } catch (error) {
      console.error(`Failed to read ${kvKey} from KV:`, error);
    }
  }
  return inMemory[memoryKey];
}

async function writeJsonWithFallback(kvKey, memoryKey, value) {
  if (isCloudflareKvConfigured()) {
    try {
      await writeCloudflareKvJson(kvKey, value);
      return value;
    } catch (error) {
      console.error(`Failed to write ${kvKey} to KV:`, error);
    }
  }
  inMemory[memoryKey] = value;
  return value;
}

export async function readWcProxySettings() {
  const raw = await readJsonWithFallback(WC_PROXY_KEY, "wcProxy");
  return normalizeWcProxy(raw || {});
}

export async function saveWcProxySettings(input) {
  const next = normalizeWcProxy(input || {});
  next.updatedAt = new Date().toISOString();
  return writeJsonWithFallback(WC_PROXY_KEY, "wcProxy", next);
}

export async function readStripeKeyOverrides() {
  const raw = await readJsonWithFallback(STRIPE_KEYS_KEY, "stripeKeys");
  return normalizeStripeKeys(raw || {});
}

export async function readWcRestApiSettings() {
  const raw = await readJsonWithFallback(WC_REST_API_KEY, "wcRestApi");
  return normalizeWcRestApi(raw || {});
}

export async function saveWcRestApiSettings(input) {
  const next = normalizeWcRestApi(input || {});
  next.updatedAt = new Date().toISOString();
  return writeJsonWithFallback(WC_REST_API_KEY, "wcRestApi", next);
}

export async function saveStripeKeyOverrides(input) {
  const next = normalizeStripeKeys(input || {});
  next.updatedAt = new Date().toISOString();
  return writeJsonWithFallback(STRIPE_KEYS_KEY, "stripeKeys", next);
}

export async function clearStripeKeyOverrides() {
  if (isCloudflareKvConfigured()) {
    try {
      await deleteCloudflareKv(STRIPE_KEYS_KEY);
    } catch (error) {
      console.error(`Failed to delete ${STRIPE_KEYS_KEY} from KV:`, error);
    }
  }
  inMemory.stripeKeys = null;
}
