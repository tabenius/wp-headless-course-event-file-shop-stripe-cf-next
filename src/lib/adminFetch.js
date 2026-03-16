/**
 * Admin fetch helper that tags requests with x-request-id (from cookie or random),
 * logs duration/status for debugging, and returns parsed JSON plus meta.
 */
export async function adminFetch(url, options = {}) {
  const start = Date.now();
  const headers = new Headers(options.headers || {});
  const existingId = document?.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("reqid="))
    ?.slice("reqid=".length);
  const reqId = existingId || crypto.randomUUID();
  headers.set("x-request-id", reqId);

  const res = await fetch(url, { ...options, headers });
  const duration = Date.now() - start;
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    // ignore parse errors
  }
  console.info("[adminFetch]", { url, status: res.status, reqId, duration });
  if (!res.ok) {
    console.error("[adminFetch:error]", { url, status: res.status, reqId, duration, body: json });
  }
  return { res, json, reqId, duration };
}
