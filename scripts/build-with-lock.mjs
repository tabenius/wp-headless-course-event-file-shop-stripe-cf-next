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
const child = spawn(bin, args, { stdio: "inherit", shell: false });

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
