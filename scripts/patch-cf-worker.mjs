#!/usr/bin/env node
/**
 * Post-build patch for OpenNext + Next.js 16 compatibility.
 *
 * Problem: Next.js 16 introduced prefetch-hints.json as a new optional manifest.
 * next-server.js calls loadManifest("/.next/server/prefetch-hints.json", true, …, handleMissing=true).
 * OpenNext 1.17.x's loadManifest patch only inlines manifests matching the glob
 * **\/{*-manifest,required-server-files}.json, so prefetch-hints.json falls through
 * to the catch-all throw — ignoring the handleMissing argument.
 *
 * Fix: insert an early-return for prefetch-hints.json before the throw.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HANDLER = resolve(".open-next/server-functions/default/handler.mjs");

const NEEDLE = "throw new Error(`Unexpected loadManifest(${path2}) call!`)";
const PATCH =
  'if(path2.endsWith("server/prefetch-hints.json"))return{};' + NEEDLE;

let src;
try {
  src = readFileSync(HANDLER, "utf8");
} catch (err) {
  console.error(`patch-cf-worker: cannot read ${HANDLER}:`, err.message);
  process.exit(1);
}

if (src.includes(PATCH)) {
  console.log("patch-cf-worker: already patched, skipping.");
  process.exit(0);
}

if (!src.includes(NEEDLE)) {
  console.error(
    "patch-cf-worker: needle not found — OpenNext version may have changed. Skipping patch.",
  );
  // Exit 0 so the build doesn't fail; the error will surface at runtime instead.
  process.exit(0);
}

const patched = src.replace(NEEDLE, PATCH);
writeFileSync(HANDLER, patched, "utf8");
console.log(
  "patch-cf-worker: patched prefetch-hints.json handling in handler.mjs",
);
