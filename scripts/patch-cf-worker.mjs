#!/usr/bin/env node
/**
 * Post-build patches for the CF Workers bundle:
 *
 * 1. OpenNext + Next.js 16 compatibility — replace loadManifest throw with
 *    graceful return {}.  (Primary fix is patch-opennext.mjs at postinstall;
 *    this is the fallback for stale node_modules.)
 *
 * 2. Remove bundled assets that are fetched from R2 at runtime (WASM) or
 *    are build-time-only artefacts (font metrics).  These bloat the worker
 *    beyond Cloudflare's 3 MiB free-tier limit.
 */

import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const HANDLER = resolve(".open-next/server-functions/default/handler.mjs");

// ---------------------------------------------------------------------------
// 1. loadManifest patch
// ---------------------------------------------------------------------------
const NEEDLE = "throw new Error(`Unexpected loadManifest(${path2}) call!`)";
const PATCH = "return{}";

let src;
try {
  src = readFileSync(HANDLER, "utf8");
} catch (err) {
  console.error(`patch-cf-worker: cannot read ${HANDLER}:`, err.message);
  process.exit(1);
}

if (src.includes(NEEDLE)) {
  const patched = src.replace(NEEDLE, PATCH);
  writeFileSync(HANDLER, patched, "utf8");
  console.log(
    "patch-cf-worker: replaced loadManifest throw with return{} in handler.mjs",
  );
} else {
  console.log("patch-cf-worker: handler already has no throw, skipping.");
}

// ---------------------------------------------------------------------------
// 2. Remove bundled assets not needed at runtime in CF Workers
// ---------------------------------------------------------------------------
/** Remove a file from the build output. Silently skips if absent. */
function cleanBundledAsset(relPath, label) {
  try {
    rmSync(resolve(relPath), { force: true });
    console.log(`patch-cf-worker: removed ${label}`);
  } catch {
    // absent — nothing to do
  }
}

// Photon WASM — loaded from R2 at runtime via photonLoader.js
cleanBundledAsset(
  ".open-next/server-functions/default/node_modules/@cf-wasm/photon/dist/lib/photon_rs_bg.wasm",
  "photon WASM (1.7 MB, fetched from R2 at runtime)",
);

// Capsize font metrics — used at build time for next/font size-adjust CSS,
// never read by the worker at runtime.
cleanBundledAsset(
  ".open-next/server-functions/default/node_modules/next/dist/server/capsize-font-metrics.json",
  "capsize font metrics (4.2 MB, build-time only)",
);

// ---------------------------------------------------------------------------
// 3. Stub @vercel/og WASM in node_modules so wrangler's esbuild doesn't
//    bundle them (1.4 MB resvg + 71 KB yoga).  next/og is part of the
//    framework but this app doesn't use ImageResponse.  The stubs are
//    minimal valid WASM modules (magic + version header only, 8 bytes).
// ---------------------------------------------------------------------------
const EMPTY_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

function stubWasm(relPath, label) {
  const abs = resolve(relPath);
  if (!existsSync(abs)) return;
  const size = readFileSync(abs).byteLength;
  if (size <= 8) return; // already stubbed
  writeFileSync(abs, EMPTY_WASM);
  console.log(
    `patch-cf-worker: stubbed ${label} (${(size / 1024).toFixed(0)} KB → 8 B)`,
  );
}

stubWasm(
  "node_modules/next/dist/compiled/@vercel/og/resvg.wasm",
  "resvg WASM (@vercel/og — not used by this app)",
);
stubWasm(
  "node_modules/next/dist/compiled/@vercel/og/yoga.wasm",
  "yoga WASM (@vercel/og — not used by this app)",
);

// ---------------------------------------------------------------------------
// 4. Deduplicate i18n JSON blobs in handler.mjs
//
//    Turbopack creates separate chunks for SSR / RSC / API route contexts,
//    each containing the same locale JSON data.  After esbuild inlines them
//    all, we end up with 3 copies × 3 locales = 9 `JSON.parse(...)` blobs
//    (~488 KB).  This pass hoists one copy per locale into a shared variable
//    at the top of the file and replaces the remaining duplicates.
// ---------------------------------------------------------------------------
{
  let handler = readFileSync(HANDLER, "utf8");
  const localeFingerprints = [
    { id: "__i18n_sv", prefix: `JSON.parse('{"common":{"admin":"Admin","inventory":"Inventarie"`, delim: "'" },
    { id: "__i18n_en", prefix: 'JSON.parse(`{"common":{"admin":"Admin","inventory":"Inventory"', delim: "`" },
    { id: "__i18n_es", prefix: `JSON.parse('{"common":{"admin":"Administraci`, delim: "'" },
  ];
  const hoisted = [];
  let totalSaved = 0;

  for (const { id, prefix, delim } of localeFingerprints) {
    const closer = delim + ")";
    // Find all occurrences by scanning with indexOf.
    const positions = [];
    let searchFrom = 0;
    while (true) {
      const start = handler.indexOf(prefix, searchFrom);
      if (start === -1) break;
      const afterOpen = start + "JSON.parse(".length + 1; // past opening quote
      const endIdx = handler.indexOf(closer, afterOpen);
      if (endIdx === -1) break;
      const end = endIdx + closer.length;
      positions.push({ start, end });
      searchFrom = end;
    }
    if (positions.length <= 1) continue;

    // Extract the canonical (first) expression.
    const canonical = handler.slice(positions[0].start, positions[0].end);
    hoisted.push(`var ${id}=${canonical};`);

    // Replace all occurrences back-to-front so offsets stay valid.
    let count = 0;
    for (let i = positions.length - 1; i >= 0; i--) {
      const { start, end } = positions[i];
      handler = handler.slice(0, start) + id + handler.slice(end);
      count++;
    }
    const saved = canonical.length * (count - 1);
    totalSaved += saved;
    console.log(
      `patch-cf-worker: deduped ${id} — ${count} copies → 1 (saved ~${(saved / 1024).toFixed(0)} KB)`,
    );
  }

  if (hoisted.length > 0) {
    // Inject hoisted variables after the banner import line.
    const bannerEnd = handler.indexOf("\n") + 1;
    handler = handler.slice(0, bannerEnd) + hoisted.join("") + "\n" + handler.slice(bannerEnd);
    writeFileSync(HANDLER, handler, "utf8");
    console.log(`patch-cf-worker: i18n dedup total saved ~${(totalSaved / 1024).toFixed(0)} KB raw`);
  }
}
