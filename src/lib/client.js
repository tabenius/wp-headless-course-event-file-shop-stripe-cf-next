import {
  getWordPressGraphqlAuthOptions,
  invalidateSiteTokenCache,
} from "@/lib/wordpressGraphqlAuth";
import { appendServerLog } from "@/lib/serverLog";
import { recordAvailabilityDatapoint } from "@/lib/graphqlAvailability";

const DEFAULT_DELAY_MS =
  Number.parseInt(process.env.GRAPHQL_DELAY_MS || "0", 10) || 0;
const GRAPHQL_TIMEOUT_MS =
  Number.parseInt(process.env.GRAPHQL_TIMEOUT_MS || "8000", 10) || 8000;
let lastCallTs = 0;

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

function firstLines(text, lines = 3) {
  if (!text) return "";
  return text.split("\n").slice(0, lines).join("\n");
}

/**
 * Cache of GraphQL type existence checks.
 * Populated lazily on first call to hasGraphQLType().
 */
const _typeCache = new Map();

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

/**
 * Resolve the WordPress base URL.
 * Prefers NEXT_PUBLIC_WORDPRESS_URL; falls back to the ragbaz_wp_config cookie
 * (set by the setup page) so the app works when the env var is absent.
 * The dynamic cookie lookup only runs when the env var is missing, keeping
 * ISR/SSG intact for fully-configured deployments.
 */
async function resolveWordPressUrl() {
  const envUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  try {
    // Dynamic import keeps `cookies()` out of the module-level scope so it
    // doesn't force all routes to be dynamic when the env var is present.
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const raw = cookieStore.get("ragbaz_wp_config")?.value;
    if (raw) {
      const { wpUrl } = JSON.parse(
        Buffer.from(raw, "base64").toString("utf8"),
      );
      if (wpUrl) return wpUrl.replace(/\/+$/, "");
    }
  } catch {
    // Not in a request context (e.g. build-time static generation) — ignore.
  }
  return null;
}

export async function fetchGraphQL(query, variables = {}, revalidate = null) {
  if (typeof query !== "string" || query.trim().length === 0) {
    console.error("fetchGraphQL called with an invalid query");
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
        ...(auth.headers || {}),
      };

      const fetchOptions = {
        method: "POST",
        headers: {
          ...headers,
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      };

      // Revalidate with ISR if revalidate is set
      if (typeof revalidate === "number" && revalidate >= 0) {
        fetchOptions.next = {
          revalidate,
        };
      }

      // Rate-limit calls to avoid overloading Varnish/GraphQL
      const now = Date.now();
      const diff = now - lastCallTs;
      if (DEFAULT_DELAY_MS > 0 && diff < DEFAULT_DELAY_MS) {
        await sleep(DEFAULT_DELAY_MS - diff);
      }
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), GRAPHQL_TIMEOUT_MS);
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
        recordAttempt(graphqlEndpoint, "network-error", false);
        recordAvailabilityDatapoint({
          ok: false,
          status: "network-error",
          endpoint: graphqlEndpoint,
          latencyMs,
        }).catch(() => {});
        if (fetchErr.name === "AbortError") {
          const msg = `GraphQL timeout after ${GRAPHQL_TIMEOUT_MS}ms: ${graphqlEndpoint}`;
          console.error(msg);
          appendServerLog({ level: "error", msg }).catch(() => {});
          return {};
        }
        lastError = `GraphQL fetch error (auth=${auth.mode}): ${fetchErr.message}`;
        if (debugGraphQL) console.error(lastError);
        continue;
      }
      clearTimeout(tid);
      lastCallTs = Date.now();
      const latencyMs = lastCallTs - attemptStart;
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
          // Stop immediately for 429 — callers can render dedicated rate-limit UI.
          recordAvailabilityDatapoint({
            ok: false,
            status: 429,
            endpoint: graphqlEndpoint,
            latencyMs,
          }).catch(() => {});
          throw new RateLimitError(text, 429);
        }
        recordAvailabilityDatapoint({
          ok: false,
          status: response.status,
          endpoint: graphqlEndpoint,
          latencyMs,
        }).catch(() => {});
        if (varnishHit) await sleep(250);
        else await sleep(DEFAULT_DELAY_MS || 100);
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
        if (isAuthError && auth.mode === "sitetoken") invalidateSiteTokenCache();
        recordAvailabilityDatapoint({
          ok: false,
          status: `graphql-error`,
          endpoint: graphqlEndpoint,
          latencyMs,
        }).catch(() => {});
        continue;
      }

      // Successful response — record availability
      recordAvailabilityDatapoint({
        ok: true,
        status: response.status,
        endpoint: graphqlEndpoint,
        latencyMs,
      }).catch(() => {});
      return result?.data || {};
    }

    if (lastError) {
      console.error(lastError);
      appendServerLog({ level: "error", msg: lastError }).catch(() => {});
    }
    return {};
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    console.error("Error fetching from WordPress:", error);
    return {};
  }
}
