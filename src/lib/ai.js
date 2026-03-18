const EMBEDDING_MODEL = process.env.CF_EMBED_MODEL || "@cf/baai/bge-base-en-v1.5";
const CHAT_MODEL = process.env.CF_CHAT_MODEL || "@cf/meta/llama-2-7b-chat-int8";

function cfEndpoint(model) {
  const accountId = process.env.CF_ACCOUNT_ID;
  if (!accountId) throw new Error("CF_ACCOUNT_ID missing");
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

async function cfRun(model, body) {
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error("CF_API_TOKEN missing");
  const res = await fetch(cfEndpoint(model), {
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
  if (!Array.isArray(json?.result)) throw new Error("Invalid embedding response");
  return json.result;
}

export async function chatWithContext(systemPrompt, messages) {
  const json = await cfRun(CHAT_MODEL, {
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: false,
  });
  return json?.result?.response || "";
}
