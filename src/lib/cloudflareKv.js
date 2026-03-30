import { shouldSkipUpstreamDuringBuild } from "./buildUpstreamGuard.js";

function getCloudflareAccountId() {
  return (
    process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || ""
  );
}

function getCloudflareApiToken() {
  return process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || "";
}

function hasCloudflareConfig() {
  return Boolean(
    getCloudflareAccountId() && getCloudflareApiToken() && process.env.CF_KV_NAMESPACE_ID,
  );
}

function shouldBypassCloudflareKv() {
  return shouldSkipUpstreamDuringBuild();
}

function getKvUrl(key) {
  return `https://api.cloudflare.com/client/v4/accounts/${getCloudflareAccountId()}/storage/kv/namespaces/${process.env.CF_KV_NAMESPACE_ID}/values/${key}`;
}

export function isCloudflareKvConfigured() {
  return hasCloudflareConfig() && !shouldBypassCloudflareKv();
}

export async function readCloudflareKvJson(key) {
  return readCloudflareKvJsonWithOptions(key);
}

export async function readCloudflareKvJsonWithOptions(
  key,
  { cacheMode = "no-store", revalidateSeconds = null } = {},
) {
  if (shouldBypassCloudflareKv()) return null;
  if (!hasCloudflareConfig()) return null;
  const fetchOptions = {
    headers: { Authorization: `Bearer ${getCloudflareApiToken()}` },
    cache: cacheMode,
  };
  if (
    Number.isFinite(revalidateSeconds) &&
    revalidateSeconds !== null &&
    revalidateSeconds >= 0
  ) {
    fetchOptions.next = { revalidate: Math.floor(revalidateSeconds) };
  }
  const response = await fetch(getKvUrl(key), fetchOptions);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Cloudflare KV read failed (${response.status})`);
  }
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    console.error(`Cloudflare KV: malformed JSON for key "${key}"`);
    return null;
  }
}

export async function writeCloudflareKvJson(
  key,
  value,
  { expirationTtl } = {},
) {
  if (shouldBypassCloudflareKv()) return false;
  if (!hasCloudflareConfig()) return false;
  let url = getKvUrl(key);
  if (expirationTtl) url += `?expiration_ttl=${expirationTtl}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${getCloudflareApiToken()}` },
    body: JSON.stringify(value),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare KV write failed (${response.status})`);
  }
  return true;
}

export async function deleteCloudflareKv(key) {
  if (shouldBypassCloudflareKv()) return false;
  if (!hasCloudflareConfig()) return false;
  const response = await fetch(getKvUrl(key), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getCloudflareApiToken()}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Cloudflare KV delete failed (${response.status})`);
  }
  return true;
}

// ── Chat history ─────────────────────────────────────────────────────────────

export async function saveChatHistory(historyKey, chatHistory) {
  try {
    await writeCloudflareKvJson(`chat_history:${historyKey}`, chatHistory);
    return true;
  } catch (error) {
    console.error("Failed to save chat history:", error);
    return false;
  }
}

export async function getChatHistory(historyKey) {
  try {
    const history = await readCloudflareKvJson(`chat_history:${historyKey}`);
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.error("Failed to retrieve chat history:", error);
    return [];
  }
}
