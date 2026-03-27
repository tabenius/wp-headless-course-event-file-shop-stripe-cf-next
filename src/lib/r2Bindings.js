/**
 * r2Bindings.js — Access Cloudflare R2 bucket via Workers binding.
 *
 * On CF Workers the R2 binding (env.R2_BUCKET) provides zero-latency,
 * zero-auth bucket access that avoids bundling the 980 KB AWS SDK.
 * Returns null when running outside Workers (local dev with `next dev`),
 * in which case callers fall back to the S3-compatible SDK path.
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
 * Get the R2 bucket binding, or null if unavailable.
 * Safe to call in any environment — returns null outside CF Workers.
 */
export async function getR2Bucket() {
  try {
    const loader = await loadContextLoader();
    if (!loader) return null;
    const ctx = await loader({ async: true });
    return ctx?.env?.R2_BUCKET ?? null;
  } catch (err) {
    if (!_warnedOnce) {
      _warnedOnce = true;
      console.warn("[r2Bindings] CF context unavailable:", err?.message);
    }
    return null;
  }
}
