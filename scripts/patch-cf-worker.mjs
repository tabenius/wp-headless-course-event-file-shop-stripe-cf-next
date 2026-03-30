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
const WORKER = resolve(".open-next/worker.js");

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

// ---------------------------------------------------------------------------
// 5. Add lightweight Server-Timing headers for request diagnostics.
//
//    Exposes:
//    - app_ms  : total worker handling duration
//    - wp_ms   : aggregate GraphQL upstream latency (recorded in app code)
//    - menu_ms : menu resolution duration (recorded in app code)
// ---------------------------------------------------------------------------
{
  let workerSrc;
  try {
    workerSrc = readFileSync(WORKER, "utf8");
  } catch (err) {
    console.error(`patch-cf-worker: cannot read ${WORKER}:`, err.message);
    process.exit(1);
  }

  if (workerSrc.includes("__appendServerTiming")) {
    let healed = workerSrc;
    healed = healed.replace(
      "if (!(response instanceof Response)) return __appendServerTiming(response);",
      "if (!(response instanceof Response)) return response;",
    );
    healed = healed.replace(
      `const response = maybeGetSkewProtectionResponse(request);
            if (response) {
                return response;
            }`,
      `const response = maybeGetSkewProtectionResponse(request);
            if (response) {
                return __appendServerTiming(response);
            }`,
    );
    if (healed !== workerSrc) {
      writeFileSync(WORKER, healed, "utf8");
      console.log("patch-cf-worker: healed existing server-timing patch.");
    } else {
      console.log("patch-cf-worker: server-timing patch already present, skipping.");
    }
  } else {
    const fetchNeedle = "async fetch(request, env, ctx) {";
    const fetchPatch = `async fetch(request, env, ctx) {
        const __timingStartedAt = Date.now();
        if (ctx && typeof ctx === "object") {
            ctx.__ragbazTiming = { wpMs: 0, wpCount: 0, menuMs: 0, menuCount: 0 };
        }
        const __appendServerTiming = (response) => {
            try {
                if (!(response instanceof Response)) return response;
                const timing = ctx && typeof ctx === "object" ? ctx.__ragbazTiming : null;
                const appMs = Math.max(0, Date.now() - __timingStartedAt);
                const wpMs = Math.max(0, Number(timing?.wpMs || 0));
                const menuMs = Math.max(0, Number(timing?.menuMs || 0));
                const wpCount = Math.max(0, Number(timing?.wpCount || 0));
                const menuCount = Math.max(0, Number(timing?.menuCount || 0));
                const segments = [
                    \`app_ms;dur=\${Math.round(appMs)}\`,
                    \`wp_ms;dur=\${Math.round(wpMs)}\`,
                    \`menu_ms;dur=\${Math.round(menuMs)}\`,
                ];
                if (wpCount > 0) segments.push(\`wp_count;dur=\${wpCount}\`);
                if (menuCount > 0) segments.push(\`menu_count;dur=\${menuCount}\`);
                const existing = response.headers.get("server-timing");
                response.headers.set(
                    "server-timing",
                    existing ? \`\${existing}, \${segments.join(", ")}\` : segments.join(", ")
                );
            } catch {
                // Never fail the request due to diagnostics headers.
            }
            return response;
        };`;

    const replacements = [
      [fetchNeedle, fetchPatch],
      [
        `const response = maybeGetSkewProtectionResponse(request);
            if (response) {
                return response;
            }`,
        `const response = maybeGetSkewProtectionResponse(request);
            if (response) {
                return __appendServerTiming(response);
            }`,
      ],
      [
        "return handleCdnCgiImageRequest(url, env);",
        "return __appendServerTiming(handleCdnCgiImageRequest(url, env));",
      ],
      [
        "return await handleImageRequest(url, request.headers, env);",
        "return __appendServerTiming(await handleImageRequest(url, request.headers, env));",
      ],
      ["return reqOrResp;", "return __appendServerTiming(reqOrResp);"],
      [
        "return handler(reqOrResp, env, ctx, request.signal);",
        "return __appendServerTiming(await handler(reqOrResp, env, ctx, request.signal));",
      ],
    ];

    let patched = workerSrc;
    let changed = false;
    for (const [needle, replacement] of replacements) {
      if (!patched.includes(needle)) continue;
      patched = patched.replace(needle, replacement);
      changed = true;
    }

    if (!changed) {
      console.warn("patch-cf-worker: server-timing patch did not match worker template.");
    } else {
      writeFileSync(WORKER, patched, "utf8");
      console.log("patch-cf-worker: added server-timing response headers.");
    }
  }
}
