#!/usr/bin/env node
/**
 * Patch OpenNext's load-manifest.js to handle prefetch-hints.json gracefully.
 *
 * Next.js 16 added prefetch-hints.json as a new optional manifest and loads it
 * with handleMissing=true. OpenNext 1.17.x's glob pattern
 * (**\/{*-manifest,required-server-files}.json) doesn't capture this file, so
 * its generated loadManifest function throws unconditionally for that path.
 *
 * This script runs via postinstall (after npm ci) so it takes effect before
 * opennextjs-cloudflare build, regardless of how the build is invoked.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = resolve(
  "node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js",
);

// The throw line inside the generated loadManifest fix template
const NEEDLE =
  "throw new Error(\\`Unexpected loadManifest(\\${$PATH}) call!\\`);";
const PATCH =
  'if ($PATH.endsWith("server/prefetch-hints.json")) return {};\n  ' + NEEDLE;

let src;
try {
  src = readFileSync(TARGET, "utf8");
} catch {
  // OpenNext not installed (e.g. workspace package install), skip silently
  process.exit(0);
}

if (src.includes(PATCH)) {
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
  "patch-opennext: added prefetch-hints.json early-return to loadManifest template",
);
