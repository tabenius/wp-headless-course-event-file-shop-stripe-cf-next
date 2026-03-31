/**
 * d1Bindings.js — Access Cloudflare D1 database via Workers binding.
 *
 * Same pattern as r2Bindings.js: uses @opennextjs/cloudflare context to
 * access the D1 binding. Returns null outside CF Workers (local dev).
 */

let _cfContextLoader;
let _warnedOnce = false;

async function loadContextLoader() {
  if (_cfContextLoader !== undefined) return _cfContextLoader;
  try {
    const mod = await import("@opennextjs/cloudflare");
    const fn =
      typeof mod.getCloudflareContext === "function"
        ? mod.getCloudflareContext
        : typeof mod.default?.getCloudflareContext === "function"
          ? mod.default.getCloudflareContext
          : null;
    _cfContextLoader = fn;
    return fn;
  } catch {
    _cfContextLoader = null;
    return null;
  }
}

/**
 * Get the D1 database binding, or null if unavailable.
 * Safe to call in any environment — returns null outside CF Workers.
 */
export async function getD1Database() {
  try {
    const loader = await loadContextLoader();
    if (!loader) return null;
    const ctx = await loader({ async: true });
    return ctx?.env?.DB ?? null;
  } catch (err) {
    if (!_warnedOnce) {
      _warnedOnce = true;
      console.warn("[d1Bindings] CF context unavailable:", err?.message);
    }
    return null;
  }
}
