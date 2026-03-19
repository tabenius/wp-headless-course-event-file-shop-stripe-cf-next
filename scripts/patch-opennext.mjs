#!/usr/bin/env node
/**
 * Patch OpenNext's load-manifest.js so the generated loadManifest function
 * returns {} for any unrecognised path instead of throwing.
 *
 * Root cause: Next.js 16 added several new optional manifests
 * (prefetch-hints.json, subresource-integrity-manifest.json, …) and loads them
 * with handleMissing=true, expecting {} when absent. OpenNext 1.17.x's glob
 * (**\/{*-manifest,required-server-files}.json) doesn't capture all of them, so
 * any uncaptured path hits the catch-all throw — ignoring handleMissing.
 *
 * Fix: replace the throw with `return {}` so the generated function gracefully
 * handles both new optional manifests and manifests that simply weren't
 * generated for this build. All manifests OpenNext does capture are still
 * inlined as explicit if-blocks above this line.
 *
 * This script runs via postinstall (after npm ci / npm install) so it applies
 * before opennextjs-cloudflare build regardless of how the build is invoked.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = resolve(
  "node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js",
);

// The throw line at the end of the generated loadManifest fix template.
const NEEDLE =
  "throw new Error(\\`Unexpected loadManifest(\\${$PATH}) call!\\`);";
// Replace with a graceful return — mirrors what handleMissing=true expects.
const PATCH = "return {};";

let src;
try {
  src = readFileSync(TARGET, "utf8");
} catch {
  // OpenNext not installed yet (e.g. workspace-level install), skip silently.
  process.exit(0);
}

if (src.includes(PATCH) && !src.includes(NEEDLE)) {
  console.log("patch-opennext: already patched, skipping.");
  process.exit(0);
}

if (!src.includes(NEEDLE)) {
  console.error(
    "patch-opennext: needle not found — OpenNext version may have changed. Skipping.",
  );
  process.exit(0);
}

const patched = src.replace(NEEDLE, PATCH);
writeFileSync(TARGET, patched, "utf8");
console.log(
  "patch-opennext: loadManifest now returns {} for unrecognised manifests (Next.js 16 compat)",
);
