/**
 * photonLoader.js — Environment-aware photon WASM loader.
 *
 * Importing @cf-wasm/photon directly (the "node" export condition) embeds a
 * 2.26 MB base64-encoded WASM blob in the Next.js server chunk.  This loader
 * uses the "others" subpath — identical API, no inline WASM — and supplies the
 * WASM binary from the right source for each environment:
 *
 *   Node.js (next dev / unit tests):
 *     Reads photon_rs_bg.wasm from node_modules via createRequire.
 *
 *   CF Workers (cf:build / wrangler deploy):
 *     Fetches _wasm/photon_rs_bg.wasm from the R2 public URL (S3_PUBLIC_URL).
 *     The WASM bytes travel over the Cloudflare backbone — effectively zero
 *     extra latency vs a binding read — and the compiled WebAssembly.Module is
 *     cached at module scope for the lifetime of the worker instance.
 *
 * Usage:
 *   const photon = await getPhoton();
 *   // photon.PhotonImage, photon.resize, photon.crop, … — same as before
 */

/** @type {Promise<import("@cf-wasm/photon/others")> | null} */
let photonPromise = null;

export async function getPhoton() {
  if (!photonPromise) {
    photonPromise = _init();
  }
  return photonPromise;
}

async function _init() {
  // "others" re-exports every photon function + initPhoton, but does NOT embed
  // the WASM binary inline.  The dynamic import keeps it in a separate chunk so
  // the main server bundle stays clean regardless of bundler.
  const photon = await import("@cf-wasm/photon/others");

  const isNode =
    typeof process !== "undefined" && Boolean(process.versions?.node);

  if (isNode) {
    // Node.js: read the WASM binary from the known dist path.
    // We deliberately avoid req.resolve("@cf-wasm/photon/photon.wasm") here —
    // Turbopack statically analyzes string literals passed to require.resolve()
    // and would try to bundle the .wasm file, which always fails at build time.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const wasmPath = join(
      /*turbopackIgnore: true*/ process.cwd(),
      "node_modules",
      "@cf-wasm",
      "photon",
      "dist",
      "lib",
      "photon_rs_bg.wasm",
    );
    await photon.initPhoton(new WebAssembly.Module(readFileSync(wasmPath)));
  } else {
    // CF Workers: the WASM must be pre-uploaded to the R2 bucket.
    // See scripts/upload-wasm-to-r2.sh for the one-time setup.
    const base = (process.env.S3_PUBLIC_URL || "").replace(/\/$/, "");
    if (!base) {
      throw new Error(
        "photonLoader: S3_PUBLIC_URL is not set — cannot fetch photon WASM from R2.",
      );
    }
    // Pass the fetch() Promise directly; initPhoton awaits it then hands the
    // Response to WebAssembly.compileStreaming for efficient streaming compile.
    await photon.initPhoton(fetch(`${base}/_wasm/photon_rs_bg.wasm`));
  }

  return photon;
}
