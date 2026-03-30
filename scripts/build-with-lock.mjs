/**
 * Wraps a build command with a building.lock.pid file.
 * Creates the lock before the build, removes it on exit (success, failure, or signal).
 * Any agent or human can check this file to know a build is already running.
 *
 * Usage: node scripts/build-with-lock.mjs <cmd> [args...]
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { spawn } from "child_process";

const LOCK = "building.lock.pid";
const cmd = process.argv.slice(2);

if (cmd.length === 0) {
  console.error("Usage: node scripts/build-with-lock.mjs <cmd> [args...]");
  process.exit(1);
}

function hydrateBuildEnvFromDotenv() {
  const shellProvided = new Set(Object.keys(process.env));
  const files = [".env", ".env.production", ".env.local", ".env.production.local"];
  const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("export ")) line = line.slice(7).trim();
      const eqIndex = line.indexOf("=");
      if (eqIndex < 1) continue;
      const key = line.slice(0, eqIndex).trim();
      if (!keyPattern.test(key) || shellProvided.has(key)) continue;

      let value = line.slice(eqIndex + 1).trim();
      const startsDouble = value.startsWith("\"");
      const startsSingle = value.startsWith("'");
      if (startsDouble && value.endsWith("\"") && value.length >= 2) {
        value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      } else if (startsSingle && value.endsWith("'") && value.length >= 2) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      process.env[key] = value;
    }
  }
}

function firstSet(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function assertCloudflareKvBuildConfig() {
  const accountId = firstSet(
    process.env.CLOUDFLARE_ACCOUNT_ID,
    process.env.CF_ACCOUNT_ID,
  );
  const apiToken = firstSet(
    process.env.CF_API_TOKEN,
    process.env.CLOUDFLARE_API_TOKEN,
  );
  const namespaceId = firstSet(process.env.CF_KV_NAMESPACE_ID);

  const missing = [];
  if (!accountId) missing.push("CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID");
  if (!apiToken) missing.push("CF_API_TOKEN/CLOUDFLARE_API_TOKEN");
  if (!namespaceId) missing.push("CF_KV_NAMESPACE_ID");

  if (missing.length > 0) {
    console.error(
      "\n❌ Build refused: Cloudflare KV is required.\n" +
        `   Missing: ${missing.join(", ")}\n` +
        "   Configure KV credentials before running build/cf:build.\n",
    );
    process.exit(1);
  }
}

hydrateBuildEnvFromDotenv();
assertCloudflareKvBuildConfig();

if (process.env.GRAPHQL_AVAILABILITY_AUTO_RECORD === "1") {
  console.warn(
    "\n⚠️  GRAPHQL_AVAILABILITY_AUTO_RECORD=1 is enabled.\n" +
      "   This can make static/ISR storefront routes flip to dynamic at runtime\n" +
      "   if GraphQL availability logging touches KV during page render.\n" +
      "   Recommended default: keep GRAPHQL_AVAILABILITY_AUTO_RECORD=0 and log via\n" +
      "   admin/API actions instead.\n",
  );
}

// Warn if a lock already exists (may be stale from a crashed build)
if (existsSync(LOCK)) {
  try {
    const existing = JSON.parse(readFileSync(LOCK, "utf8"));
    console.warn(
      `\n⚠️  building.lock.pid already exists — another build may be running:\n` +
        `   cmd:     ${existing.cmd}\n` +
        `   started: ${existing.started}\n` +
        `   pid:     ${existing.pid}\n` +
        `   Proceeding anyway (lock may be stale from a crashed build).\n`,
    );
  } catch {
    console.warn("⚠️  building.lock.pid already exists. Proceeding anyway.\n");
  }
}

writeFileSync(
  LOCK,
  JSON.stringify(
    { pid: process.pid, started: new Date().toISOString(), cmd: cmd.join(" ") },
    null,
    2,
  ) + "\n",
);

function cleanup() {
  try {
    unlinkSync(LOCK);
  } catch {}
}

const [bin, ...args] = cmd;
const child = spawn(bin, args, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    RAGBAZ_BUILD_PHASE: "1",
  },
});

child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
