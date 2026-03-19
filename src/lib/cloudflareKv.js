function hasCloudflareConfig() {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CF_API_TOKEN &&
      process.env.CF_KV_NAMESPACE_ID,
  );
}

function getKvUrl(key) {
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CF_KV_NAMESPACE_ID}/values/${key}`;
}

export function isCloudflareKvConfigured() {
  return hasCloudflareConfig();
}

export async function readCloudflareKvJson(key) {
  if (!hasCloudflareConfig()) return null;
  const response = await fetch(getKvUrl(key), {
    headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}` },
    cache: "no-store",
  });
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
  if (!hasCloudflareConfig()) return false;
  let url = getKvUrl(key);
  if (expirationTtl) url += `?expiration_ttl=${expirationTtl}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}` },
    body: JSON.stringify(value),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare KV write failed (${response.status})`);
  }
  return true;
}

export async function deleteCloudflareKv(key) {
  if (!hasCloudflareConfig()) return false;
  const response = await fetch(getKvUrl(key), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}` },
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
