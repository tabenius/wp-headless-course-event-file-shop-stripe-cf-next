/**
 * Server-side debug log ring buffer.
 * Stores up to MAX_ENTRIES entries in Cloudflare KV (with TTL) when configured,
 * falling back to a module-level in-memory array (survives within a single Worker
 * isolate, lost on cold start — good enough for dev and short-lived debugging).
 */
import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const KV_KEY = "admin-debug-log";
const MAX_ENTRIES = 40;
const TTL_SECONDS = 30 * 60; // 30 minutes

let memLog = [];

export async function appendServerLog({ level = "info", msg, reqId } = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: String(msg ?? "").slice(0, 500),
    ...(reqId ? { reqId } : {}),
  };
  if (isCloudflareKvConfigured()) {
    try {
      const current = (await readCloudflareKvJson(KV_KEY)) ?? [];
      const next = [entry, ...current].slice(0, MAX_ENTRIES);
      await writeCloudflareKvJson(KV_KEY, next, { expirationTtl: TTL_SECONDS });
      return;
    } catch (e) {
      console.error("[serverLog] KV write failed", e.message);
    }
  }
  memLog = [entry, ...memLog].slice(0, MAX_ENTRIES);
}

export async function getServerLogs() {
  if (isCloudflareKvConfigured()) {
    try {
      return (await readCloudflareKvJson(KV_KEY)) ?? [];
    } catch (e) {
      console.error("[serverLog] KV read failed", e.message);
    }
  }
  return memLog;
}

export async function clearServerLogs() {
  memLog = [];
  if (isCloudflareKvConfigured()) {
    try {
      await writeCloudflareKvJson(KV_KEY, [], { expirationTtl: TTL_SECONDS });
    } catch (e) {
      console.error("[serverLog] KV clear failed", e.message);
    }
  }
}
