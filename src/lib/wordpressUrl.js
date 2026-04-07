function normalizeUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.replace(/\/+$/, "") : "";
}

function isStaticOrIsrRenderContext() {
  try {
    const store = globalThis?.__openNextAls?.getStore?.();
    if (!store || typeof store !== "object") return false;
    return (
      store.isStaticGeneration === true || store.isISRRevalidation === true
    );
  } catch {
    return false;
  }
}

function parseWpConfigCookie(rawValue) {
  const raw = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!raw) return "";

  // Preferred format from /api/config: base64 encoded JSON.
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    const wpUrl = normalizeUrl(parsed?.wpUrl);
    if (wpUrl) return wpUrl;
  } catch {}

  // Backward-compatible fallback if cookie was ever stored as plain JSON.
  try {
    const parsed = JSON.parse(raw);
    const wpUrl = normalizeUrl(parsed?.wpUrl);
    if (wpUrl) return wpUrl;
  } catch {}

  return "";
}

export async function resolveWordPressUrl() {
  const envUrl =
    normalizeUrl(process.env.NEXT_PUBLIC_WORDPRESS_URL) ||
    normalizeUrl(process.env.WORDPRESS_API_URL) ||
    null;
  if (envUrl) return envUrl;
  if (isStaticOrIsrRenderContext()) return null;

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieUrl = parseWpConfigCookie(
      cookieStore.get("ragbaz_wp_config")?.value,
    );
    if (cookieUrl) return cookieUrl;
  } catch {
    // Not in request context (e.g. build-time generation). Fall back to env.
  }

  return envUrl;
}
