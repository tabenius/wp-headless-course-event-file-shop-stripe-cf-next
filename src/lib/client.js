import {
  getWordPressGraphqlAuthOptions,
  invalidateSiteTokenCache,
} from "@/lib/wordpressGraphqlAuth";
import { appendServerLog } from "@/lib/serverLog";
import { recordAvailabilityDatapoint } from "@/lib/graphqlAvailability";
import { resolveWordPressUrl } from "@/lib/wordpressUrl";

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
    query.match(/\b(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)\b/) ||
    query.match(/\bfragment\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
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
  const operationName = extractOperationName(query);
  const queryPreview = trimText(query, 2400);
  const variablesPreview = stringifyVariablesPreview(variables, 1600);

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
          operationName,
          failureKind: fetchErr.name === "AbortError" ? "timeout" : "network-error",
          query: queryPreview,
          variables: variablesPreview,
          responsePreview: trimText(fetchErr?.message || "", 1200),
        }).catch(() => {});
        if (fetchErr.name === "AbortError") {
          const msg = `GraphQL timeout after ${GRAPHQL_TIMEOUT_MS}ms: ${graphqlEndpoint}`;
          console.error(msg);
          appendServerLog({ level: "error", msg, persist: false }).catch(() => {});
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
            operationName,
            failureKind: "rate-limited",
            query: queryPreview,
            variables: variablesPreview,
            responsePreview: trimText(firstLines(text, 6), 1200),
          }).catch(() => {});
          throw new RateLimitError(text, 429);
        }
        recordAvailabilityDatapoint({
          ok: false,
          status: response.status,
          endpoint: graphqlEndpoint,
          latencyMs,
          operationName,
          failureKind:
            !contentType.includes("application/json")
              ? "invalid-content-type"
              : response.status >= 500
                ? "upstream-5xx"
                : "http-error",
          query: queryPreview,
          variables: variablesPreview,
          responsePreview: trimText(firstLines(text, 6), 1200),
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
        const normalizedErrors = normalizeGraphqlErrors(result.errors);
        recordAvailabilityDatapoint({
          ok: false,
          status: `graphql-error`,
          endpoint: graphqlEndpoint,
          latencyMs,
          operationName,
          failureKind: detectGraphqlFailureKind(normalizedErrors),
          query: queryPreview,
          variables: variablesPreview,
          errors: normalizedErrors,
        }).catch(() => {});
        continue;
      }

      // Successful response — record availability
      recordAvailabilityDatapoint({
        ok: true,
        status: response.status,
        endpoint: graphqlEndpoint,
        latencyMs,
        operationName,
      }).catch(() => {});
      return result?.data || {};
    }

    if (lastError) {
      console.error(lastError);
      appendServerLog({ level: "error", msg: lastError, persist: false }).catch(() => {});
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
