/**
 * Advisory lock for shared docs: AGENTS.md and claude+codex-coop.md
 *
 * Before editing either file, acquire the lock.
 * Release it as soon as the edits are committed and pushed.
 *
 * Usage:
 *   node scripts/docs-lock.mjs acquire <agent> [files...]
 *   node scripts/docs-lock.mjs release
 *   node scripts/docs-lock.mjs check
 *
 * Examples:
 *   node scripts/docs-lock.mjs acquire claude "AGENTS.md, claude+codex-coop.md"
 *   node scripts/docs-lock.mjs acquire codex "AGENTS.md"
 *   node scripts/docs-lock.mjs release
 *   node scripts/docs-lock.mjs check
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";

const LOCK = "docs.lock.pid";
const [, , action, ...rest] = process.argv;

function readLock() {
  try {
    return JSON.parse(readFileSync(LOCK, "utf8"));
  } catch {
    return null;
  }
}

function printLock(lock) {
  console.log(`  agent:   ${lock.agent}`);
  console.log(`  files:   ${lock.files}`);
  console.log(`  started: ${lock.started}`);
  console.log(`  pid:     ${lock.pid}`);
}

switch (action) {
  case "acquire": {
    const agent = rest[0];
    const files = rest.slice(1).join(" ") || "AGENTS.md, claude+codex-coop.md";
    if (!agent) {
      console.error("Usage: docs-lock.mjs acquire <agent> [files]");
      process.exit(1);
    }
    const existing = readLock();
    if (existing) {
      console.warn(`\n⚠️  docs.lock.pid already held:\n`);
      printLock(existing);
      console.warn(`\n  Wait for the other agent to release, or delete the lock if it is stale.\n`);
      process.exit(1);
    }
    writeFileSync(
      LOCK,
      JSON.stringify({ pid: process.pid, agent, files, started: new Date().toISOString() }, null, 2) + "\n",
    );
    console.log(`✅ Lock acquired by ${agent} for: ${files}`);
    break;
  }

  case "release": {
    if (!existsSync(LOCK)) {
      console.log("No lock file found — nothing to release.");
    } else {
      const lock = readLock();
      unlinkSync(LOCK);
      console.log(`🔓 Lock released (was held by ${lock?.agent ?? "unknown"}).`);
    }
    break;
  }

  case "check": {
    const lock = readLock();
    if (!lock) {
      console.log("✅ No docs lock held — safe to edit.");
    } else {
      console.log(`⚠️  Docs lock is held:\n`);
      printLock(lock);
    }
    break;
  }

  default:
    console.error("Usage: docs-lock.mjs acquire|release|check [agent] [files]");
    process.exit(1);
}
