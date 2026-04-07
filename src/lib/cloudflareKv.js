import { shouldSkipUpstreamDuringBuild } from "./buildUpstreamGuard.js";

function getCloudflareAccountId() {
  return process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";
}

function getCloudflareApiToken() {
  return process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || "";
}

export function getCloudflareKvConfigStatus() {
  const hasAccountId = Boolean(getCloudflareAccountId());
  const hasApiToken = Boolean(getCloudflareApiToken());
  const hasNamespaceId = Boolean(process.env.CF_KV_NAMESPACE_ID);
  const bypassedDuringBuild = shouldBypassCloudflareKv();
  const missingKeys = [];
  if (!hasAccountId) {
    missingKeys.push("CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID");
  }
  if (!hasApiToken) {
    missingKeys.push("CF_API_TOKEN/CLOUDFLARE_API_TOKEN");
  }
  if (!hasNamespaceId) {
    missingKeys.push("CF_KV_NAMESPACE_ID");
  }
  return {
    // "configured" should reflect whether required runtime keys are present.
    // Build-time bypass is reported separately.
    configured: hasAccountId && hasApiToken && hasNamespaceId,
    hasAccountId,
    hasApiToken,
    hasNamespaceId,
    bypassedDuringBuild,
    missingKeys,
  };
}

function hasCloudflareConfig() {
  const status = getCloudflareKvConfigStatus();
  return status.hasAccountId && status.hasApiToken && status.hasNamespaceId;
}

function shouldBypassCloudflareKv() {
  return shouldSkipUpstreamDuringBuild();
}

function getKvUrl(key) {
  return `https://api.cloudflare.com/client/v4/accounts/${getCloudflareAccountId()}/storage/kv/namespaces/${process.env.CF_KV_NAMESPACE_ID}/values/${key}`;
}

export function isCloudflareKvConfigured() {
  return getCloudflareKvConfigStatus().configured;
}

export async function readCloudflareKvJson(key) {
  return readCloudflareKvJsonWithOptions(key);
}

export async function readCloudflareKvJsonWithOptions(
  key,
  { cacheMode = "force-cache", revalidateSeconds = 60 } = {},
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
