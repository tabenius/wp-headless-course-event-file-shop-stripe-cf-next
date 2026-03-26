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
  writeCloudflareKvJson,
} from "./cloudflareKv.js";

const SETTINGS_KEY = "graphql-availability-settings";
const LOG_KEY = "graphql-availability-log";
const MAX_DATAPOINTS = 500;
const LOG_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SETTINGS_CACHE_TTL = 60_000; // re-check every 60 s
const MAX_QUERY_CHARS = 2400;
const MAX_VARIABLES_CHARS = 1600;
const MAX_RESPONSE_CHARS = 1600;
const MAX_ERRORS = 8;

/** @type {{ enabled: boolean } | null} */
let _settingsCache = null;
let _settingsCacheTs = 0;

/**
 * Returns true when KV is configured AND the admin has opted in.
 * Result is cached for 60 s to avoid a KV round-trip on every request.
 */
export async function isAvailabilityLoggingEnabled() {
  if (!isCloudflareKvConfigured()) return false;
  const now = Date.now();
  if (_settingsCache !== null && now - _settingsCacheTs < SETTINGS_CACHE_TTL) {
    return _settingsCache.enabled === true;
  }
  try {
    const settings = await readCloudflareKvJson(SETTINGS_KEY);
    _settingsCache = settings ?? { enabled: false };
    _settingsCacheTs = now;
    return _settingsCache.enabled === true;
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
    return (await readCloudflareKvJson(SETTINGS_KEY)) ?? { enabled: false };
  } catch {
    return { enabled: false };
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

// ── Page performance logging ──────────────────────────────────────────────────

const PERF_LOG_KEY = "page-performance-log";
const MAX_PERF_DATAPOINTS = 300;

/**
 * Record a page load performance datapoint.
 * Called from a client-side hook via an API route (client can't write KV directly).
 *
 * @param {{ url: string, ttfb: number, domComplete: number, lcp?: number, fcp?: number, inp?: number, cls?: number }} param
 */
export async function recordPagePerformance({ url, ttfb, domComplete, lcp, fcp, inp, cls }) {
  if (!(await isAvailabilityLoggingEnabled())) return;
  try {
    const current = (await readCloudflareKvJson(PERF_LOG_KEY)) ?? [];
    const entry = {
      ts: Date.now(),
      url,
      ttfb: Math.round(ttfb ?? 0),
      domComplete: Math.round(domComplete ?? 0),
      ...(lcp != null ? { lcp: Math.round(lcp) } : {}),
      ...(fcp != null ? { fcp: Math.round(fcp) } : {}),
      ...(inp != null ? { inp: Math.round(inp) } : {}),
      ...(cls != null ? { cls: Number(cls) } : {}),
    };
    const next = [entry, ...current].slice(0, MAX_PERF_DATAPOINTS);
    await writeCloudflareKvJson(PERF_LOG_KEY, next, {
      expirationTtl: LOG_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[graphqlAvailability] Failed to record page performance:", e.message);
  }
}

export async function getPagePerformanceLog() {
  if (!isCloudflareKvConfigured()) return [];
  try {
    return (await readCloudflareKvJson(PERF_LOG_KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function clearPagePerformanceLog() {
  if (!isCloudflareKvConfigured()) return;
  try {
    await writeCloudflareKvJson(PERF_LOG_KEY, [], {
      expirationTtl: LOG_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[graphqlAvailability] Failed to clear perf log:", e.message);
  }
}
