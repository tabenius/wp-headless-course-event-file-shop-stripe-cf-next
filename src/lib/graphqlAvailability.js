/**
 * GraphQL availability logging — opt-in, stored in Cloudflare KV.
 *
 * Records a datapoint (ok/fail + status + latency) on every GraphQL request
 * when enabled. Results are shown as a timeseries in Admin → Info → GraphQL.
 *
 * KV keys:
 *   graphql-availability-settings  – { enabled: bool }
 *   graphql-availability-log        – datapoint[]  (newest-first, capped)
 */

import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  readCloudflareKvJsonWithOptions,
  writeCloudflareKvJson,
  deleteCloudflareKv,
} from "./cloudflareKv.js";
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

const SETTINGS_KEY = "graphql-availability-settings";
const LOG_KEY = "graphql-availability-log";
const TEMP_ENABLE_KEY = "graphql-availability-temp-enable";
const RELAY_STATUS_KEY = "ragbaz-home-relay-status";
const MAX_DATAPOINTS = 500;
const LOG_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SETTINGS_CACHE_TTL = 60_000; // re-check every 60 s
const TEMP_CACHE_TTL = 15_000; // re-check every 15 s
const MAX_TEMP_ENABLE_SECONDS = 24 * 60 * 60; // 24 h safety cap
const MAX_QUERY_CHARS = 2400;
const MAX_VARIABLES_CHARS = 1600;
const MAX_RESPONSE_CHARS = 1600;
const MAX_ERRORS = 8;

/** @type {{ enabled: boolean } | null} */
let _settingsCache = null;
let _settingsCacheTs = 0;
/** @type {{ enabledUntil: number } | null} */
let _tempCache = null;
let _tempCacheTs = 0;

async function readAvailabilitySettingsKv(key, ttlMs) {
  const ttlSeconds = Math.max(1, Math.floor((Number(ttlMs) || 0) / 1000));
  return await readCloudflareKvJsonWithOptions(key, {
    cacheMode: "force-cache",
    revalidateSeconds: ttlSeconds,
  });
}

function normalizeEnabledUntil(raw) {
  const value =
    raw && typeof raw === "object" ? Number(raw.enabledUntil) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

async function getTemporaryEnabledUntilMs() {
  if (!isCloudflareKvConfigured()) return null;
  const now = Date.now();
  if (_tempCacheTs > 0 && now - _tempCacheTs < TEMP_CACHE_TTL) {
    const until = normalizeEnabledUntil(_tempCache);
    return until && until > now ? until : null;
  }
  try {
    _tempCache = await readAvailabilitySettingsKv(TEMP_ENABLE_KEY, TEMP_CACHE_TTL);
    _tempCacheTs = now;
    const until = normalizeEnabledUntil(_tempCache);
    if (!until || until <= now) return null;
    return until;
  } catch {
    return null;
  }
}

/**
 * Returns true when KV is configured AND the admin has opted in.
 * Result is cached for 60 s to avoid a KV round-trip on every request.
 */
export async function isAvailabilityLoggingEnabled() {
  if (!isCloudflareKvConfigured()) return false;
  const now = Date.now();
  if (_settingsCache !== null && now - _settingsCacheTs < SETTINGS_CACHE_TTL) {
    if (_settingsCache.enabled === true) return true;
    return (await getTemporaryEnabledUntilMs()) !== null;
  }
  try {
    const settings = await readAvailabilitySettingsKv(
      SETTINGS_KEY,
      SETTINGS_CACHE_TTL,
    );
    _settingsCache = settings ?? { enabled: false };
    _settingsCacheTs = now;
    if (_settingsCache.enabled === true) return true;
    return (await getTemporaryEnabledUntilMs()) !== null;
  } catch {
    return false;
  }
}

/** Enable or disable availability logging (admin action). */
export async function setAvailabilityLoggingEnabled(enabled) {
  const settings = { enabled: Boolean(enabled) };
  _settingsCache = settings;
  _settingsCacheTs = Date.now();
  await writeCloudflareKvJson(SETTINGS_KEY, settings);
}

export async function getAvailabilitySettings() {
  if (!isCloudflareKvConfigured()) return { enabled: false };
  try {
    return (
      (await readAvailabilitySettingsKv(SETTINGS_KEY, SETTINGS_CACHE_TTL)) ?? {
        enabled: false,
      }
    );
  } catch {
    return { enabled: false };
  }
}

export async function getAvailabilityTemporaryEnabledUntil() {
  const untilMs = await getTemporaryEnabledUntilMs();
  return untilMs ? new Date(untilMs).toISOString() : null;
}

export async function enableAvailabilityLoggingTemporarily(seconds = 3600) {
  if (!isCloudflareKvConfigured()) return null;
  const safeSeconds = Math.max(
    60,
    Math.min(MAX_TEMP_ENABLE_SECONDS, Math.round(Number(seconds) || 3600)),
  );
  const enabledUntil = Date.now() + safeSeconds * 1000;
  const payload = { enabledUntil };
  _tempCache = payload;
  _tempCacheTs = Date.now();
  await writeCloudflareKvJson(TEMP_ENABLE_KEY, payload, {
    expirationTtl: safeSeconds + 300,
  });
  return new Date(enabledUntil).toISOString();
}

export async function clearAvailabilityTemporaryWindow() {
  _tempCache = null;
  _tempCacheTs = 0;
  if (!isCloudflareKvConfigured()) return;
  try {
    await deleteCloudflareKv(TEMP_ENABLE_KEY);
  } catch {
    // best effort cleanup
  }
}

/**
 * Record a single GraphQL availability datapoint.
 * No-op when logging is disabled or KV is not configured.
 * Must be called fire-and-forget (the caller should not await it).
 *
 * @param {{
 *   ok: boolean,
 *   status: number|string,
 *   endpoint: string,
 *   latencyMs: number,
 *   operationName?: string,
 *   failureKind?: string,
 *   query?: string,
 *   variables?: string,
 *   responsePreview?: string,
 *   errors?: Array<{ message?: string, path?: string[], extensions?: { code?: string } }>
 * }} param
 */
export async function recordAvailabilityDatapoint({
  ok,
  status,
  endpoint,
  latencyMs,
  operationName,
  failureKind,
  query,
  variables,
  responsePreview,
  errors,
}) {
  if (!(await isAvailabilityLoggingEnabled())) return;
  try {
    const current = (await readCloudflareKvJson(LOG_KEY)) ?? [];
    const errorList = Array.isArray(errors)
      ? errors
          .slice(0, MAX_ERRORS)
          .map((err) => ({
            message: String(err?.message || "").slice(0, MAX_RESPONSE_CHARS),
            path: Array.isArray(err?.path) ? err.path.slice(0, 12) : null,
            code:
              typeof err?.extensions?.code === "string"
                ? err.extensions.code.slice(0, 120)
                : null,
          }))
      : [];
    const entry = {
      ts: Date.now(),
      ok: Boolean(ok),
      status,
      endpoint,
      latencyMs: Math.round(latencyMs ?? 0),
      ...(typeof operationName === "string" && operationName.trim() !== ""
        ? { operationName: operationName.trim().slice(0, 120) }
        : {}),
      ...(typeof failureKind === "string" && failureKind.trim() !== ""
        ? { failureKind: failureKind.trim().slice(0, 120) }
        : {}),
      ...(typeof query === "string" && query.trim() !== ""
        ? { query: query.slice(0, MAX_QUERY_CHARS) }
        : {}),
      ...(typeof variables === "string" && variables.trim() !== ""
        ? { variables: variables.slice(0, MAX_VARIABLES_CHARS) }
        : {}),
      ...(typeof responsePreview === "string" && responsePreview.trim() !== ""
        ? { responsePreview: responsePreview.slice(0, MAX_RESPONSE_CHARS) }
        : {}),
      ...(errorList.length > 0 ? { errors: errorList } : {}),
    };
    const next = [entry, ...current].slice(0, MAX_DATAPOINTS);
    await writeCloudflareKvJson(LOG_KEY, next, {
      expirationTtl: LOG_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[graphqlAvailability] Failed to record datapoint:", e.message);
  }
}

/**
 * Return all stored datapoints (newest first).
 * Returns [] if KV is not configured or logging has never been enabled.
 */
export async function getAvailabilityLog() {
  if (!isCloudflareKvConfigured()) return [];
  try {
    return (await readCloudflareKvJson(LOG_KEY)) ?? [];
  } catch {
    return [];
  }
}

/** Clear all stored datapoints (admin action). */
export async function clearAvailabilityLog() {
  if (!isCloudflareKvConfigured()) return;
  try {
    await writeCloudflareKvJson(LOG_KEY, [], {
      expirationTtl: LOG_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[graphqlAvailability] Failed to clear log:", e.message);
  }
}

export async function setRagbazRelayStatus(status) {
  if (!isCloudflareKvConfigured()) return;
  const safe = status && typeof status === "object" ? status : {};
  const payload = {
    ts: Date.now(),
    ok: Boolean(safe.ok),
    skipped: Boolean(safe.skipped),
    reason:
      typeof safe.reason === "string" ? safe.reason.slice(0, 120) : "",
    status:
      safe.status != null ? Number.parseInt(String(safe.status), 10) || 0 : 0,
    endpoint:
      typeof safe.endpoint === "string" ? safe.endpoint.slice(0, 600) : "",
    message:
      typeof safe.message === "string" ? safe.message.slice(0, 600) : "",
    giftKey:
      typeof safe.giftKey === "string" ? safe.giftKey.slice(0, 120) : "",
  };
  try {
    await writeCloudflareKvJson(RELAY_STATUS_KEY, payload, {
      expirationTtl: LOG_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[graphqlAvailability] Failed to write relay status:", e.message);
  }
}

export async function getRagbazRelayStatus() {
  if (!isCloudflareKvConfigured()) return null;
  try {
    return (await readCloudflareKvJson(RELAY_STATUS_KEY)) ?? null;
  } catch {
    return null;
  }
}

// ── Page performance logging ──────────────────────────────────────────────────

const PERF_LOG_KEY = "page-performance-log";
const MAX_PERF_DATAPOINTS = 300;

/**
 * Record a page load performance datapoint.
 * Called from a client-side hook via an API route (client can't write KV directly).
 *
 * @param {{ url: string, ttfb: number, domComplete: number, lcp?: number, fcp?: number, inp?: number, cls?: number, navigationType?: string }} param
 */
export async function recordPagePerformance({ url, referrer, sessionId, ttfb, domComplete, lcp, fcp, inp, cls, navigationType }) {
  const safeUrl = String(url || "").slice(0, 500);
  const safeReferrer = typeof referrer === "string" ? referrer.slice(0, 500) : "";
  const safeSessionId = typeof sessionId === "string" ? sessionId.slice(0, 64) : "";
  const safeTtfb = Math.round(ttfb ?? 0);
  const safeDomComplete = Math.round(domComplete ?? 0);
  const safeLcp = lcp != null ? Math.round(lcp) : null;
  const safeFcp = fcp != null ? Math.round(fcp) : null;
  const safeInp = inp != null ? Math.round(inp) : null;
  const safeCls = cls != null ? Number(cls) : null;
  const safeNavType = navigationType ? String(navigationType).slice(0, 32) : "navigate";

  // D1 path — always-on, no opt-in gate required
  try {
    const db = await tryGetD1();
    if (db) {
      await db
        .prepare(
          `INSERT INTO page_vitals (url, referrer, session_id, ttfb, dom_complete, lcp, fcp, inp, cls, navigation_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(safeUrl, safeReferrer, safeSessionId, safeTtfb, safeDomComplete, safeLcp, safeFcp, safeInp, safeCls, safeNavType)
        .run();
      return;
    }
  } catch (e) {
    console.error("[graphqlAvailability] D1 page vitals write failed, trying KV:", e.message);
  }

  // KV fallback — still gated by availability logging opt-in
  if (!(await isAvailabilityLoggingEnabled())) return;
  try {
    const current = (await readCloudflareKvJson(PERF_LOG_KEY)) ?? [];
    const entry = {
      ts: Date.now(),
      url: safeUrl,
      ttfb: safeTtfb,
      domComplete: safeDomComplete,
      ...(safeLcp != null ? { lcp: safeLcp } : {}),
      ...(safeFcp != null ? { fcp: safeFcp } : {}),
      ...(safeInp != null ? { inp: safeInp } : {}),
      ...(safeCls != null ? { cls: safeCls } : {}),
      ...(safeNavType !== "navigate" ? { navigationType: safeNavType } : {}),
    };
    const next = [entry, ...current].slice(0, MAX_PERF_DATAPOINTS);
    await writeCloudflareKvJson(PERF_LOG_KEY, next, {
      expirationTtl: LOG_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[graphqlAvailability] Failed to record page performance:", e.message);
  }
}

export async function getPagePerformanceLog({ limit = 300 } = {}) {
  // D1 path — returns rows in the same shape the admin panel expects
  try {
    const db = await tryGetD1();
    if (db) {
      const { results } = await db
        .prepare(
          "SELECT url, referrer, session_id, user_email, ttfb, dom_complete, lcp, fcp, inp, cls, navigation_type, created_at FROM page_vitals ORDER BY id DESC LIMIT ?",
        )
        .bind(limit)
        .all();
      return (results || []).map((r) => ({
        ts: new Date(r.created_at + "Z").getTime(),
        url: r.url,
        ttfb: r.ttfb,
        domComplete: r.dom_complete,
        ...(r.lcp != null ? { lcp: r.lcp } : {}),
        ...(r.fcp != null ? { fcp: r.fcp } : {}),
        ...(r.inp != null ? { inp: r.inp } : {}),
        ...(r.cls != null ? { cls: r.cls } : {}),
        ...(r.navigation_type && r.navigation_type !== "navigate" ? { navigationType: r.navigation_type } : {}),
        ...(r.session_id ? { sessionId: r.session_id } : {}),
        ...(r.referrer ? { referrer: r.referrer } : {}),
        ...(r.user_email ? { userEmail: r.user_email } : {}),
      }));
    }
  } catch (e) {
    console.error("[graphqlAvailability] D1 page vitals read failed, trying KV:", e.message);
  }

  // KV fallback
  if (!isCloudflareKvConfigured()) return [];
  try {
    return (await readCloudflareKvJson(PERF_LOG_KEY)) ?? [];
  } catch {
    return [];
  }
}

/**
 * Backfill user_email on all page_vitals rows for a given session.
 * Called when a user logs in or completes a purchase — ties the anonymous
 * session breadcrumbs to a known identity.
 */
export async function associateSessionWithUser(sessionId, email) {
  if (!sessionId || !email) return;
  try {
    const db = await tryGetD1();
    if (!db) return;
    await db
      .prepare("UPDATE page_vitals SET user_email = ? WHERE session_id = ? AND user_email = ''")
      .bind(String(email).trim().toLowerCase(), String(sessionId).slice(0, 64))
      .run();
  } catch (e) {
    console.error("[graphqlAvailability] Failed to associate session with user:", e.message);
  }
}

export async function clearPagePerformanceLog() {
  // D1 path
  try {
    const db = await tryGetD1();
    if (db) {
      await db.prepare("DELETE FROM page_vitals").run();
      return;
    }
  } catch (e) {
    console.error("[graphqlAvailability] D1 page vitals clear failed, trying KV:", e.message);
  }

  // KV fallback
  if (!isCloudflareKvConfigured()) return;
  try {
    await writeCloudflareKvJson(PERF_LOG_KEY, [], {
      expirationTtl: LOG_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[graphqlAvailability] Failed to clear perf log:", e.message);
  }
}
