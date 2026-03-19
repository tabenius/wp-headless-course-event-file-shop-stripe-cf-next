#!/usr/bin/env node
/**
 * Post-build patch for OpenNext + Next.js 16 compatibility.
 *
 * Fallback for local cf:build runs. The primary fix is patch-opennext.mjs
 * (postinstall), which patches the OpenNext source before the build so the
 * generated handler already returns {} for unrecognised manifests.
 *
 * This script handles the case where the handler was built without the source
 * patch (e.g. stale node_modules). It replaces the throw with return {} in the
 * already-built handler.mjs.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HANDLER = resolve(".open-next/server-functions/default/handler.mjs");

const NEEDLE = "throw new Error(`Unexpected loadManifest(${path2}) call!`)";
// Replace throw with graceful return {} — handles all optional manifests.
const PATCH = "return{}";

let src;
try {
  src = readFileSync(HANDLER, "utf8");
} catch (err) {
  console.error(`patch-cf-worker: cannot read ${HANDLER}:`, err.message);
  process.exit(1);
}

if (!src.includes(NEEDLE)) {
  // Already patched (by source patch or previous run), nothing to do.
  console.log("patch-cf-worker: handler already has no throw, skipping.");
  process.exit(0);
}

const patched = src.replace(NEEDLE, PATCH);
writeFileSync(HANDLER, patched, "utf8");
console.log(
  "patch-cf-worker: replaced loadManifest throw with return{} in handler.mjs",
);
