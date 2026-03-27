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
  console.log("patch-opennext: loadManifest already patched, skipping.");
} else if (!src.includes(NEEDLE)) {
  console.error(
    "patch-opennext: needle not found — OpenNext version may have changed. Skipping.",
  );
} else {
  const patched = src.replace(NEEDLE, PATCH);
  writeFileSync(TARGET, patched, "utf8");
  console.log(
    "patch-opennext: loadManifest now returns {} for unrecognised manifests (Next.js 16 compat)",
  );
}

// ---------------------------------------------------------------------------
// Patch 2: Externalize AWS SDK from the CF Workers esbuild bundle.
//
// With R2 bindings, the Worker no longer needs the AWS SDK at runtime.
// The SDK is still installed for local dev (next dev) where it's loaded via
// dynamic import().  Adding the packages to esbuild's `external` array
// prevents them from being bundled into handler.mjs (~980 KB / ~250 KB gz).
// ---------------------------------------------------------------------------
const BUNDLE_SERVER = resolve(
  "node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js",
);

let bundleSrc;
try {
  bundleSrc = readFileSync(BUNDLE_SERVER, "utf8");
} catch {
  process.exit(0);
}

const EXTERNAL_NEEDLE = `"./middleware/handler.mjs",`;
const EXTERNAL_PATCH = `"./middleware/handler.mjs",
            // Externalize AWS SDK — R2 bindings replace it at runtime (patch-opennext)
            "@aws-sdk/client-s3",
            "@aws-sdk/s3-request-presigner",`;

if (bundleSrc.includes("@aws-sdk/client-s3")) {
  console.log("patch-opennext: AWS SDK already externalized, skipping.");
} else if (!bundleSrc.includes(EXTERNAL_NEEDLE)) {
  console.error(
    "patch-opennext: external needle not found in bundle-server.js — OpenNext version may have changed. Skipping.",
  );
} else {
  const patchedBundle = bundleSrc.replace(EXTERNAL_NEEDLE, EXTERNAL_PATCH);
  writeFileSync(BUNDLE_SERVER, patchedBundle, "utf8");
  console.log(
    "patch-opennext: externalized @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner from CF Workers bundle",
  );
}
