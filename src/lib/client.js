import {
  getWordPressGraphqlAuthOptions,
  invalidateSiteTokenCache,
  recordWordPressGraphqlAuthResult,
} from "@/lib/wordpressGraphqlAuth";
import { appendServerLog } from "@/lib/serverLog";
import { recordAvailabilityDatapoint } from "@/lib/graphqlAvailability";
import { resolveWordPressUrl } from "@/lib/wordpressUrl";
import { getStorefrontCacheEpoch } from "@/lib/storefrontCache";
import {
  buildGraphqlResponseCacheKey,
  readGraphqlResponseCache,
  resetGraphqlResponseCacheForTests,
  writeGraphqlResponseCache,
} from "@/lib/graphqlResponseCache";
import {
  isBuildPhase,
  shouldSkipUpstreamDuringBuild,
} from "@/lib/buildUpstreamGuard";
import { addServerTiming } from "@/lib/serverTiming";
import { withWordPressUserAgent } from "@/lib/wordpressUserAgent";

const DEFAULT_DELAY_MS =
  Number.parseInt(process.env.GRAPHQL_DELAY_MS || "180", 10) || 180;
const GRAPHQL_JITTER_MS =
  Number.parseInt(process.env.GRAPHQL_JITTER_MS || "120", 10) || 120;
const GRAPHQL_TIMEOUT_MS =
  Number.parseInt(process.env.GRAPHQL_TIMEOUT_MS || "8000", 10) || 8000;
const GRAPHQL_BUILD_DELAY_MS =
  Number.parseInt(process.env.GRAPHQL_BUILD_DELAY_MS || "180", 10) || 180;
const GRAPHQL_BUILD_TIMEOUT_MS =
  Number.parseInt(process.env.GRAPHQL_BUILD_TIMEOUT_MS || "15000", 10) || 15000;
const IS_BUILD_PHASE = isBuildPhase();
const EFFECTIVE_DELAY_MS = IS_BUILD_PHASE
  ? Math.max(DEFAULT_DELAY_MS, GRAPHQL_BUILD_DELAY_MS)
  : DEFAULT_DELAY_MS;
const EFFECTIVE_TIMEOUT_MS = IS_BUILD_PHASE
  ? Math.max(GRAPHQL_TIMEOUT_MS, GRAPHQL_BUILD_TIMEOUT_MS)
  : GRAPHQL_TIMEOUT_MS;
const GRAPHQL_EDGE_CACHE_TTL_SECONDS =
  Number.parseInt(process.env.GRAPHQL_EDGE_CACHE_TTL_SECONDS || "60", 10) || 60;
const GRAPHQL_EDGE_CACHE_STALE_SECONDS =
  Number.parseInt(process.env.GRAPHQL_EDGE_CACHE_STALE_SECONDS || "120", 10) ||
  120;
const GRAPHQL_AVAILABILITY_AUTO_RECORD_ENABLED =
  process.env.GRAPHQL_AVAILABILITY_AUTO_RECORD === "1";
const GRAPHQL_COALESCE_ENABLED = process.env.GRAPHQL_COALESCE !== "0";
let lastCallTs = 0;
let paceQueue = Promise.resolve();
const inFlightCacheableRequests = new Map();

/**
 * Cache of GraphQL type existence checks.
 * Populated lazily on first call to hasGraphQLType().
 */
const _typeCache = new Map();

// ── Request history ───────────────────────────────────────────────────────────
/** @type {{ ts: number, endpoint: string, status: number|string, ok: boolean }[]} */
const _requestHistory = [];
const MAX_HISTORY = 20;

function recordAttempt(endpoint, status, ok) {
  _requestHistory.unshift({ ts: Date.now(), endpoint, status, ok });
  if (_requestHistory.length > MAX_HISTORY) _requestHistory.pop();
}

/** Returns a snapshot of the last GraphQL request attempts (newest first). */
export function getRequestHistory() {
  return [..._requestHistory];
}

export function resetGraphqlClientCaches() {
  _typeCache.clear();
  inFlightCacheableRequests.clear();
  resetGraphqlResponseCacheForTests();
}

// ── RateLimitError ────────────────────────────────────────────────────────────
export class RateLimitError extends Error {
  constructor(body, status = 429) {
    super(`GraphQL rate limited (HTTP ${status})`);
    this.name = "RateLimitError";
    this.status = status;
    this.responseBody = body;
    this.history = getRequestHistory();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomJitterMs() {
  if (!Number.isFinite(GRAPHQL_JITTER_MS) || GRAPHQL_JITTER_MS <= 0) return 0;
  return Math.floor(Math.random() * GRAPHQL_JITTER_MS);
}

async function waitForGraphqlPace() {
  const minDelayMs = Math.max(0, EFFECTIVE_DELAY_MS) + randomJitterMs();
  if (minDelayMs <= 0) return;
  const previous = paceQueue.catch(() => {});
  paceQueue = previous.then(async () => {
    const elapsed = Date.now() - lastCallTs;
    if (elapsed < minDelayMs) {
      await sleep(minDelayMs - elapsed);
    }
    lastCallTs = Date.now();
  });
  return paceQueue;
}

function parseRetryAfterMs(response) {
  const raw = response?.headers?.get?.("retry-after");
  if (!raw) return null;
  const seconds = Number.parseFloat(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(10000, Math.round(seconds * 1000));
  }
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.min(10000, dateMs - Date.now()));
  }
  return null;
}

function backoffDelayMs(response, fallbackMs) {
  return parseRetryAfterMs(response) ?? fallbackMs;
}

function firstLines(text, lines = 3) {
  if (!text) return "";
  return text.split("\n").slice(0, lines).join("\n");
}

function trimText(value, maxChars = 1200) {
  const text = typeof value === "string" ? value : "";
  if (!text) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function stringifyVariablesPreview(value, maxChars = 1200) {
  try {
    return trimText(JSON.stringify(value ?? {}, null, 2), maxChars);
  } catch {
    return "";
  }
}

function extractOperationName(queryText) {
  const query = typeof queryText === "string" ? queryText : "";
  const match =
    query.match(
      /\b(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)\b/,
    ) || query.match(/\bfragment\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (!match) return "anonymous";
  return match[2] || match[1] || "anonymous";
}

function normalizeGraphqlErrors(errors) {
  if (!Array.isArray(errors)) return [];
  return errors.slice(0, 8).map((error) => ({
    message: trimText(String(error?.message || ""), 800),
    path: Array.isArray(error?.path) ? error.path.slice(0, 12) : null,
    extensions:
      error?.extensions && typeof error.extensions === "object"
        ? { code: trimText(String(error.extensions.code || ""), 120) }
        : undefined,
  }));
}

function detectGraphqlFailureKind(errors) {
  const messages = normalizeGraphqlErrors(errors)
    .map((error) => String(error?.message || ""))
    .join("\n");
  if (/without authentication|not authorized|forbidden/i.test(messages)) {
    return "graphql-auth";
  }
  if (/syntax error|expected name|unexpected/i.test(messages)) {
    return "graphql-syntax";
  }
  if (
    /cannot query field|unknown argument|unknown fragment|cannot spread fragment|unknown type|variable .+ was not provided|is not defined by type/i.test(
      messages,
    )
  ) {
    return "graphql-validation";
  }
  return "graphql-error";
}

function getEdgeCache() {
  try {
    if (typeof caches === "undefined" || !caches) return null;
    return caches.default || null;
  } catch {
    return null;
  }
}

function shouldRecordAvailabilityForCurrentRequest() {
  try {
    const store = globalThis?.__openNextAls?.getStore?.();
    // Unknown request context: fail closed to protect static/ISR routes.
    if (!store || typeof store !== "object") return false;
    if (store?.isStaticGeneration === true) return false;
    if (store?.isISRRevalidation === true) return false;
    return true;
  } catch {
    return false;
  }
}

function enqueueAvailabilityDatapoint(entry) {
  if (!GRAPHQL_AVAILABILITY_AUTO_RECORD_ENABLED) return;
  if (!shouldRecordAvailabilityForCurrentRequest()) return;
  recordAvailabilityDatapoint(entry).catch(() => {});
}

async function digestSha256Hex(value) {
  const input = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildGraphqlEdgeCacheRequest(
  graphqlEndpoint,
  query,
  variables,
  cacheEpoch = 0,
) {
  const persistentKey = await buildGraphqlResponseCacheKey({
    endpoint: graphqlEndpoint,
    query,
    variables: variables ?? {},
    cacheEpoch: Number.isFinite(cacheEpoch) ? cacheEpoch : 0,
  });
  const digest = persistentKey.split(":").pop();
  const keyUrl = `https://ragbaz-edge-cache.local/graphql/${digest}`;
  return {
    request: new Request(keyUrl, { method: "GET" }),
    persistentKey,
  };
}

async function readGraphqlEdgeCache(cacheRequest) {
  const edgeCache = getEdgeCache();
  if (!edgeCache || !cacheRequest) return null;
  try {
    const cached = await edgeCache.match(cacheRequest);
    if (!cached) return null;
    const payload = await cached.json().catch(() => null);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function writeGraphqlEdgeCache(
  cacheRequest,
  data,
  ttlSeconds,
  staleSeconds,
) {
  const edgeCache = getEdgeCache();
  if (!edgeCache || !cacheRequest) return;
  try {
    const response = new Response(JSON.stringify(data ?? {}), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${Math.max(
          1,
          ttlSeconds,
        )}, stale-while-revalidate=${Math.max(0, staleSeconds)}`,
      },
    });
    await edgeCache.put(cacheRequest, response);
  } catch {
    // Cache writes are best-effort only.
  }
}

async function readFreshGraphqlResponseCache(cacheKey) {
  if (!cacheKey) return null;
  return readGraphqlResponseCache(cacheKey, { allowStale: false }).catch(
    () => null,
  );
}

async function readStaleGraphqlResponseCache(cacheKey) {
  if (!cacheKey) return null;
  return readGraphqlResponseCache(cacheKey, { allowStale: true }).catch(
    () => null,
  );
}

/**
 * Check whether a named type exists in the WPGraphQL schema via introspection.
 * Results are cached in-memory for the lifetime of the server process.
 */
export async function hasGraphQLType(typeName) {
  if (_typeCache.has(typeName)) return _typeCache.get(typeName);
  try {
    const data = await fetchGraphQL(
      `query IntrospectType($name: String!) { __type(name: $name) { name } }`,
      { name: typeName },
      1800,
    );
    const exists = !!data?.__type?.name;
    _typeCache.set(typeName, exists);
    return exists;
  } catch {
    // Do not cache errors — a transient WP outage should not permanently hide
    // content types until the next server restart.
    return false;
  }
}

export async function fetchGraphQL(
  query,
  variables = {},
  revalidate = 60, // null,
  options = {},
) {
  if (typeof query !== "string" || query.trim().length === 0) {
    console.error("fetchGraphQL called with an invalid query");
    return {};
  }

  if (shouldSkipUpstreamDuringBuild()) {
    return {};
  }

  const wordpressUrl = await resolveWordPressUrl();
  if (!wordpressUrl) {
    // Silently skip — no WP host configured (setup page will handle this).
    return {};
  }
  const graphqlEndpoint = `${wordpressUrl}/graphql`;

  const debugGraphQL =
    process.env.WORDPRESS_GRAPHQL_DEBUG === "1" ||
    process.env.NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG === "1";
  const edgeCacheEnabled =
    !IS_BUILD_PHASE && options?.edgeCache === true && getEdgeCache() !== null;
  const edgeCacheTtlSeconds =
    Number.parseInt(String(options?.edgeCacheTtlSeconds || ""), 10) ||
    GRAPHQL_EDGE_CACHE_TTL_SECONDS;
  const edgeCacheStaleSeconds =
    Number.parseInt(String(options?.edgeCacheStaleSeconds || ""), 10) ||
    GRAPHQL_EDGE_CACHE_STALE_SECONDS;
  let cacheRequest = null;
  let persistentCacheKey = null;
  let cacheEpoch = 0;
  if (edgeCacheEnabled) {
    cacheEpoch = await getStorefrontCacheEpoch().catch(() => 0);
    const cacheKeys = await buildGraphqlEdgeCacheRequest(
      graphqlEndpoint,
      query,
      variables,
      cacheEpoch,
    ).catch(() => null);
    cacheRequest = cacheKeys?.request || null;
    persistentCacheKey = cacheKeys?.persistentKey || null;
    if (cacheRequest) {
      const cached = await readGraphqlEdgeCache(cacheRequest);
      if (cached) {
        return cached;
      }
    }
    const persistentCached =
      await readFreshGraphqlResponseCache(persistentCacheKey);
    if (persistentCached?.data) {
      return persistentCached.data;
    }
  }
  const operationName = extractOperationName(query);
  const queryPreview = trimText(query, 2400);
  const variablesPreview = stringifyVariablesPreview(variables, 1600);
  const coalesceKey = edgeCacheEnabled ? persistentCacheKey : null;

  if (
    GRAPHQL_COALESCE_ENABLED &&
    coalesceKey &&
    inFlightCacheableRequests.has(coalesceKey)
  ) {
    return inFlightCacheableRequests.get(coalesceKey);
  }

  const originRequestPromise = (async () => {

  // ── APQ: Automatic Persisted Queries ──────────────────────────────────────────
  // Try GET with extensions hash first so HAProxy can serve cached responses.
  // Falls back to POST registration on first request.
  if (
    options?.apq === true &&
    !IS_BUILD_PHASE &&
    process.env.NEXT_RUNTIME !== "edge"
  ) {
    const queryHash = await digestSha256Hex(query);
    const extensionsPayload = JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: queryHash },
    });
    const getUrl = `${graphqlEndpoint}?extensions=${encodeURIComponent(extensionsPayload)}`;
    try {
      await waitForGraphqlPace();
      const getRes = await fetch(getUrl, {
        method: "GET",
        headers: withWordPressUserAgent({ Accept: "application/json" }),
        next:
          typeof revalidate === "number" && revalidate >= 0
            ? { revalidate }
            : undefined,
      });
      if (getRes.ok) {
        const body = await getRes.json();
        if (body?.data && Object.keys(body.data).length > 0) {
          if (edgeCacheEnabled && cacheRequest) {
            await writeGraphqlEdgeCache(
              cacheRequest,
              body.data,
              edgeCacheTtlSeconds,
              edgeCacheStaleSeconds,
            );
            await writeGraphqlResponseCache(persistentCacheKey, body.data, {
              operationName,
            });
          }
          return body.data;
        }
      }
    } catch {
      // GET failed – fall through to POST registration
    }
    // Override the body to include extensions for POST registration
    options._apqExtensions = extensionsPayload;
  }

  try {
    if (debugGraphQL) {
      console.debug("[GraphQL Debug] Query:", query);
      console.debug("[GraphQL Debug] Variables:", variables);
    }
    const authOptions = await getWordPressGraphqlAuthOptions();
    let lastError = null;

    for (const auth of authOptions) {
      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(auth.authorization ? { Authorization: auth.authorization } : {}),
      };
      if (auth.headers) {
        Object.assign(headers, auth.headers);
      }

      const fetchOptions = {
        method: "POST",
        headers: withWordPressUserAgent(headers),
        body: JSON.stringify(
          options._apqExtensions
            ? {
                query,
                variables,
                extensions: JSON.parse(options._apqExtensions),
              }
            : { query, variables },
        ),
      };

      // Revalidate with ISR if revalidate is set
      if (typeof revalidate === "number" && revalidate >= 0) {
        fetchOptions.next = {
          revalidate,
        };
      }

      await waitForGraphqlPace();
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), EFFECTIVE_TIMEOUT_MS);
      let response;
      const attemptStart = Date.now();
      try {
        response = await fetch(graphqlEndpoint, {
          ...fetchOptions,
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(tid);
        const latencyMs = Date.now() - attemptStart;
        addServerTiming("wp", latencyMs);
        recordAttempt(graphqlEndpoint, "network-error", false);
        recordWordPressGraphqlAuthResult(auth.mode, {
          ok: false,
          latencyMs,
        });
        enqueueAvailabilityDatapoint({
          ok: false,
          status: "network-error",
          endpoint: graphqlEndpoint,
          latencyMs,
          operationName,
          failureKind:
            fetchErr.name === "AbortError" ? "timeout" : "network-error",
          query: queryPreview,
          variables: variablesPreview,
          responsePreview: trimText(fetchErr?.message || "", 1200),
        });
        if (fetchErr.name === "AbortError") {
          const msg = `GraphQL timeout after ${EFFECTIVE_TIMEOUT_MS}ms: ${graphqlEndpoint}`;
          console.error(msg);
          appendServerLog({ level: "error", msg, persist: false }).catch(
            () => {},
          );
          const stale = await readStaleGraphqlResponseCache(
            persistentCacheKey,
          );
          if (stale?.data) {
            return stale.data;
          }
          return {};
        }
        lastError = `GraphQL fetch error (auth=${auth.mode}): ${fetchErr.message}`;
        if (debugGraphQL) console.error(lastError);
        continue;
      }
      clearTimeout(tid);
      lastCallTs = Date.now();
      const latencyMs = lastCallTs - attemptStart;
      addServerTiming("wp", latencyMs);
      recordAttempt(graphqlEndpoint, response.status, response.ok);
      const contentType = response.headers.get("content-type") || "";
      if (debugGraphQL) {
        console.debug("[GraphQL Debug] Auth mode:", auth.mode);
        console.debug("[GraphQL Debug] Endpoint:", graphqlEndpoint);
        console.debug(
          "[GraphQL Debug] HTTP status:",
          response.status,
          response.statusText,
        );
      }

      if (!response.ok || !contentType.includes("application/json")) {
        const text = await response.text().catch(() => "<unable to read body>");
        const statusTooMany =
          response.status === 429 || response.status === 503;
        const varnishHit = /varnish|too many/i.test(text) || statusTooMany;
        lastError = `Invalid GraphQL response: ${response.status} ${response.statusText} / content-type=${contentType} / body=${firstLines(text)}`;
        if (debugGraphQL) console.error(lastError);
        if (response.status === 429) {
          recordWordPressGraphqlAuthResult(auth.mode, {
            ok: false,
            latencyMs,
          });
          enqueueAvailabilityDatapoint({
            ok: false,
            status: 429,
            endpoint: graphqlEndpoint,
            latencyMs,
            operationName,
            failureKind: "rate-limited",
            query: queryPreview,
            variables: variablesPreview,
            responsePreview: trimText(firstLines(text, 6), 1200),
          });
          const stale = await readStaleGraphqlResponseCache(
            persistentCacheKey,
          );
          if (stale?.data) {
            await sleep(backoffDelayMs(response, IS_BUILD_PHASE ? 1200 : 500));
            return stale.data;
          }
          throw new RateLimitError(text, 429);
        }
        recordWordPressGraphqlAuthResult(auth.mode, {
          ok: false,
          latencyMs,
        });
        enqueueAvailabilityDatapoint({
          ok: false,
          status: response.status,
          endpoint: graphqlEndpoint,
          latencyMs,
          operationName,
          failureKind: !contentType.includes("application/json")
            ? "invalid-content-type"
            : response.status >= 500
              ? "upstream-5xx"
              : "http-error",
          query: queryPreview,
          variables: variablesPreview,
          responsePreview: trimText(firstLines(text, 6), 1200),
        });
        if (varnishHit) {
          const stale = await readStaleGraphqlResponseCache(
            persistentCacheKey,
          );
          if (stale?.data) {
            await sleep(backoffDelayMs(response, IS_BUILD_PHASE ? 1200 : 500));
            return stale.data;
          }
          await sleep(backoffDelayMs(response, IS_BUILD_PHASE ? 1200 : 500));
        } else {
          await sleep(EFFECTIVE_DELAY_MS || 100);
        }
        continue;
      }

      const result = await response.json();
      if (debugGraphQL) {
        console.debug("[GraphQL Debug] Response payload:", result);
      }
      if (Array.isArray(result?.errors) && result.errors.length > 0) {
        const isAuthError = result.errors.some(
          (e) =>
            typeof e?.message === "string" &&
            /without authentication|not authorized|forbidden/i.test(e.message),
        );
        lastError = `GraphQL Error (auth=${auth.mode}${isAuthError ? ", auth-rejected" : ""}): ${JSON.stringify(result.errors)}`;
        if (debugGraphQL || isAuthError) console.error(lastError);
        if (isAuthError && auth.mode === "sitetoken")
          invalidateSiteTokenCache();
        recordWordPressGraphqlAuthResult(auth.mode, {
          ok: false,
          latencyMs,
        });
        const normalizedErrors = normalizeGraphqlErrors(result.errors);
        enqueueAvailabilityDatapoint({
          ok: false,
          status: `graphql-error`,
          endpoint: graphqlEndpoint,
          latencyMs,
          operationName,
          failureKind: detectGraphqlFailureKind(normalizedErrors),
          query: queryPreview,
          variables: variablesPreview,
          errors: normalizedErrors,
        });
        continue;
      }

      // Successful response — record availability
      recordWordPressGraphqlAuthResult(auth.mode, {
        ok: true,
        latencyMs,
      });
      enqueueAvailabilityDatapoint({
        ok: true,
        status: response.status,
        endpoint: graphqlEndpoint,
        latencyMs,
        operationName,
      });
      const successData = result?.data || {};
      if (edgeCacheEnabled && cacheRequest) {
        await writeGraphqlEdgeCache(
          cacheRequest,
          successData,
          edgeCacheTtlSeconds,
          edgeCacheStaleSeconds,
        );
        await writeGraphqlResponseCache(persistentCacheKey, successData, {
          operationName,
        });
      }
      return successData;
    }

    if (lastError) {
      console.error(lastError);
      appendServerLog({ level: "error", msg: lastError, persist: false }).catch(
        () => {},
      );
    }
    return {};
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    console.error("Error fetching from WordPress:", error);
    return {};
  }
  })();

  if (GRAPHQL_COALESCE_ENABLED && coalesceKey) {
    inFlightCacheableRequests.set(coalesceKey, originRequestPromise);
    try {
      return await originRequestPromise;
    } finally {
      inFlightCacheableRequests.delete(coalesceKey);
    }
  }
  return originRequestPromise;
}
