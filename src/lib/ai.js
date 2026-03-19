import { getCloudflareContext } from "@opennextjs/cloudflare";

const EMBEDDING_MODEL =
  process.env.CF_EMBED_MODEL || "@cf/baai/bge-base-en-v1.5";
const CHAT_MODEL = process.env.CF_CHAT_MODEL || "@cf/meta/llama-2-7b-chat-int8";

/**
 * Run a model via the Workers AI binding (preferred on CF Workers) or fall
 * back to the REST API for local development.
 */
async function cfRun(model, body) {
  // Try native AI binding first (no token needed, available on Workers).
  try {
    const ctx = await getCloudflareContext({ async: true });
    if (ctx?.env?.AI) {
      const result = await ctx.env.AI.run(model, body);
      return { result };
    }
  } catch {
    // Not running on Workers — fall through to REST API.
  }

  // REST API fallback for local dev.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID missing");
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error("CF_API_TOKEN missing");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF AI error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function embedTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const json = await cfRun(EMBEDDING_MODEL, { text: texts });
  // BGE model returns { shape: [...], data: [[...vector...], ...] }
  // Some API wrappers may return a plain array — handle both.
  const vectors = Array.isArray(json?.result?.data)
    ? json.result.data
    : Array.isArray(json?.result)
      ? json.result
      : null;
  if (!vectors)
    throw new Error(
      `Embedding model returned an unexpected format. Check CF_EMBED_MODEL and the Workers AI binding.`,
    );
  return vectors;
}

export async function chatWithContext(systemPrompt, messages) {
  const json = await cfRun(CHAT_MODEL, {
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: false,
  });
  return json?.result?.response || "";
}

export { arrayBufferToBase64 } from "./imageQuota.js";

export async function generateImage(prompt, width = 512, height = 512) {
  const model =
    process.env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";

  // Try native AI binding first.
  try {
    const ctx = await getCloudflareContext({ async: true });
    if (ctx?.env?.AI) {
      const buf = await ctx.env.AI.run(model, { prompt, width, height });
      return buf instanceof ArrayBuffer
        ? buf
        : await new Response(buf).arrayBuffer();
    }
  } catch {
    // Not running on Workers — fall through to REST API.
  }

  // REST API fallback.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID missing");
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error("CF_API_TOKEN missing");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, width, height }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF AI image error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}
