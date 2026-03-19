const EMBEDDING_MODEL =
  process.env.CF_EMBED_MODEL || "@cf/baai/bge-base-en-v1.5";
const CHAT_MODEL = process.env.CF_CHAT_MODEL || "@cf/meta/llama-2-7b-chat-int8";
let cloudflareContextLoaderWarned = false;

function resolveCloudflareContextLoader(moduleNamespace) {
  if (!moduleNamespace || typeof moduleNamespace !== "object") return null;
  if (typeof moduleNamespace.getCloudflareContext === "function") {
    return moduleNamespace.getCloudflareContext;
  }
  if (typeof moduleNamespace.default === "function") {
    return moduleNamespace.default;
  }
  if (typeof moduleNamespace.default?.getCloudflareContext === "function") {
    return moduleNamespace.default.getCloudflareContext;
  }
  return null;
}

async function getWorkersAiBinding() {
  try {
    const moduleNamespace = await import("@opennextjs/cloudflare");
    const loadContext = resolveCloudflareContextLoader(moduleNamespace);
    if (!loadContext) return null;
    const context = await loadContext({ async: true });
    return context?.env?.AI ?? null;
  } catch (error) {
    if (!cloudflareContextLoaderWarned) {
      cloudflareContextLoaderWarned = true;
      console.warn(
        "[ai] Cloudflare context loader unavailable, falling back to REST:",
        error?.message || error,
      );
    }
    return null;
  }
}

function aiError(code, message, meta = {}) {
  const error = new Error(message);
  error.code = code;
  error.meta = meta;
  return error;
}

/**
 * Run a model via the Workers AI binding (preferred on CF Workers) or fall
 * back to the REST API for local development.
 */
async function cfRun(model, body) {
  // Try native AI binding first (no token needed, available on Workers).
  const aiBinding = await getWorkersAiBinding();
  if (aiBinding) {
    let result;
    try {
      result = await aiBinding.run(model, body);
    } catch (error) {
      throw aiError(
        "ai_binding_run_failed",
        error?.message || "Workers AI binding invocation failed",
        { model },
      );
    }
    return { result };
  }

  // REST API fallback for local dev.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw aiError(
      "cf_account_missing",
      "CLOUDFLARE_ACCOUNT_ID missing",
      { model },
    );
  }
  const token = process.env.CF_API_TOKEN;
  if (!token) {
    throw aiError("cf_api_token_missing", "CF_API_TOKEN missing", { model });
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw aiError(
      "cf_ai_network_error",
      error?.message || "Cloudflare AI network request failed",
      { model },
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw aiError(
      "cf_ai_http_error",
      `CF AI error ${res.status}: ${text.slice(0, 200)}`,
      { model, status: res.status },
    );
  }
  return res.json().catch(() => {
    throw aiError("cf_ai_parse_error", "CF AI response was not valid JSON", {
      model,
    });
  });
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
  const aiBinding = await getWorkersAiBinding();
  if (aiBinding) {
    let buf;
    try {
      buf = await aiBinding.run(model, { prompt, width, height });
    } catch (error) {
      throw aiError(
        "ai_image_binding_failed",
        error?.message || "Workers AI image generation failed",
        { model, width, height },
      );
    }
    try {
      return buf instanceof ArrayBuffer
        ? buf
        : await new Response(buf).arrayBuffer();
    } catch {
      throw aiError(
        "ai_image_binding_decode_failed",
        "Workers AI image response could not be decoded",
        { model, width, height },
      );
    }
  }

  // REST API fallback.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw aiError(
      "cf_account_missing",
      "CLOUDFLARE_ACCOUNT_ID missing",
      { model },
    );
  }
  const token = process.env.CF_API_TOKEN;
  if (!token) {
    throw aiError("cf_api_token_missing", "CF_API_TOKEN missing", { model });
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, width, height }),
    });
  } catch (error) {
    throw aiError(
      "cf_ai_image_network_error",
      error?.message || "Cloudflare image request failed",
      { model, width, height },
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw aiError(
      "cf_ai_image_http_error",
      `CF AI image error ${res.status}: ${text.slice(0, 200)}`,
      { model, width, height, status: res.status },
    );
  }

  try {
    return await res.arrayBuffer();
  } catch {
    throw aiError(
      "cf_ai_image_decode_failed",
      "Cloudflare image response could not be decoded",
      { model, width, height },
    );
  }
}
