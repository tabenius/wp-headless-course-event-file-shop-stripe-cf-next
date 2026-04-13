import { resolveWordPressUrl } from "@/lib/wordpressUrl";
import { withWordPressUserAgent } from "@/lib/wordpressUserAgent";

function normalizeEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}

function encodeBasicCredentials(username, password) {
  const value = `${username}:${password}`;
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  throw new Error("Unable to encode WordPress credentials in this runtime.");
}

function looksLikeApplicationPassword(value) {
  return value.includes(" ") && !value.includes(".");
}

const DEFAULT_AUTH_MODE_ORDER = [
  "sitetoken",
  "relay-secret",
  "basic",
  "bearer",
  "none",
];
const AUTH_LEARN_TTL_MS =
  Number.parseInt(process.env.WORDPRESS_GRAPHQL_AUTH_LEARN_TTL_MS || "", 10) ||
  10 * 60 * 1000;
const SITETOKEN_RETRY_MS =
  Number.parseInt(process.env.WORDPRESS_GRAPHQL_SITETOKEN_RETRY_MS || "", 10) ||
  60 * 1000;

let _preferredAuthMode = "";
let _preferredAuthModeTs = 0;
let _siteTokenRetryAfter = 0;
const _authModeStats = new Map();

function getLearnedAuthMode() {
  if (!_preferredAuthMode) return "";
  if (Date.now() - _preferredAuthModeTs > AUTH_LEARN_TTL_MS) {
    _preferredAuthMode = "";
    _preferredAuthModeTs = 0;
    return "";
  }
  return _preferredAuthMode;
}

function orderAuthModes() {
  const preferred = getLearnedAuthMode();
  if (!preferred || !DEFAULT_AUTH_MODE_ORDER.includes(preferred)) {
    return DEFAULT_AUTH_MODE_ORDER;
  }
  return [
    preferred,
    ...DEFAULT_AUTH_MODE_ORDER.filter((mode) => mode !== preferred),
  ];
}

function rememberSuccessfulAuthMode(mode, latencyMs) {
  const safeMode = DEFAULT_AUTH_MODE_ORDER.includes(mode) ? mode : "";
  if (!safeMode) return;
  const safeLatency = Math.max(1, Math.round(Number(latencyMs) || 1));
  const current = _authModeStats.get(safeMode) || {
    ok: 0,
    fail: 0,
    avgLatencyMs: safeLatency,
    lastOkTs: 0,
    lastFailTs: 0,
  };
  const avgLatencyMs =
    current.ok > 0
      ? Math.round(current.avgLatencyMs * 0.7 + safeLatency * 0.3)
      : safeLatency;
  const next = {
    ...current,
    ok: current.ok + 1,
    avgLatencyMs,
    lastOkTs: Date.now(),
  };
  _authModeStats.set(safeMode, next);

  const preferred = getLearnedAuthMode();
  const preferredStats = preferred ? _authModeStats.get(preferred) : null;
  if (
    !preferred ||
    !preferredStats ||
    next.avgLatencyMs < preferredStats.avgLatencyMs * 0.85 ||
    preferredStats.fail > next.fail + 1
  ) {
    _preferredAuthMode = safeMode;
    _preferredAuthModeTs = Date.now();
  }
}

function rememberFailedAuthMode(mode) {
  const safeMode = DEFAULT_AUTH_MODE_ORDER.includes(mode) ? mode : "";
  if (!safeMode) return;
  const current = _authModeStats.get(safeMode) || {
    ok: 0,
    fail: 0,
    avgLatencyMs: 0,
    lastOkTs: 0,
    lastFailTs: 0,
  };
  const next = {
    ...current,
    fail: current.fail + 1,
    lastFailTs: Date.now(),
  };
  _authModeStats.set(safeMode, next);
  if (safeMode === _preferredAuthMode && next.fail > current.ok + 1) {
    _preferredAuthMode = "";
    _preferredAuthModeTs = 0;
  }
}

function getFaustSecret() {
  return (
    normalizeEnv(process.env.FAUST_SECRET_KEY) ||
    normalizeEnv(process.env.FAUSTWP_SECRET_KEY) ||
    normalizeEnv(process.env.FAUST_SECRET)
  );
}

function getRelaySecret() {
  return (
    normalizeEnv(process.env.RAGBAZ_GRAPHQL_RELAY_SECRET) ||
    normalizeEnv(process.env.WORDPRESS_GRAPHQL_RELAY_SECRET)
  );
}

function getRelayHeaderName() {
  return (
    normalizeEnv(process.env.RAGBAZ_GRAPHQL_RELAY_HEADER_NAME) ||
    normalizeEnv(process.env.WORDPRESS_GRAPHQL_RELAY_HEADER_NAME) ||
    "x-ragbaz-relay-secret"
  );
}

// ── SiteToken JWT cache ─────────────────────────────────────────────────────

/**
 * Cached token from the SITETOKEN login provider.
 * @type {{ authToken: string, authTokenExpiration: string|null,
 *          refreshToken: string|null, refreshTokenExpiration: string|null } | null}
 */
let _tokenCache = null;

/** Returns true when the ISO expiration string is still valid with a buffer. */
function tokenStillValid(expiration, bufferMs = 60_000) {
  if (!expiration) return false;
  return Date.now() + bufferMs < new Date(expiration).getTime();
}

/**
 * Raw fetch to the WPGraphQL endpoint — used for token exchange only,
 * bypassing fetchGraphQL to avoid circular dependency.
 */
async function rawGraphQL(wpUrl, query, variables, authHeader) {
  const endpoint = `${wpUrl.replace(/\/+$/, "")}/graphql`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(authHeader ? { Authorization: authHeader } : {}),
  };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: withWordPressUserAgent(headers),
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

/** Exchange the Faust site secret for a JWT via the SITETOKEN provider. */
async function exchangeSiteToken(wpUrl, secret) {
  const data = await rawGraphQL(
    wpUrl,
    `mutation LoginSiteToken($secret: String!) {
       login(input: { provider: SITETOKEN, identity: $secret }) {
         authToken
         authTokenExpiration
         refreshToken
         refreshTokenExpiration
       }
     }`,
    { secret },
  );
  const token = data?.login;
  if (!token?.authToken) return null;
  return token;
}

/** Use the refresh token to get a new auth token. */
async function refreshCachedToken(wpUrl) {
  if (!_tokenCache?.refreshToken) return false;
  if (!tokenStillValid(_tokenCache.refreshTokenExpiration)) return false;

  const data = await rawGraphQL(
    wpUrl,
    `mutation RefreshAuthToken($token: String!) {
       refreshToken(input: { refreshToken: $token }) {
         authToken
         authTokenExpiration
       }
     }`,
    { token: _tokenCache.refreshToken },
  );
  const refreshed = data?.refreshToken;
  if (!refreshed?.authToken) return false;
  _tokenCache = { ..._tokenCache, ...refreshed };
  return true;
}

/**
 * Returns a valid Bearer authorization header obtained via the SiteToken provider,
 * refreshing or re-exchanging the token as needed.
 * Returns null if the Faust secret is not configured or the exchange fails.
 */
async function getSiteTokenBearer() {
  const secret = getFaustSecret();
  if (!secret) return null;
  if (Date.now() < _siteTokenRetryAfter) return null;
  const wpUrl = await resolveWordPressUrl();
  if (!wpUrl) return null;

  // Use cached token if still valid
  if (_tokenCache && tokenStillValid(_tokenCache.authTokenExpiration)) {
    return `Bearer ${_tokenCache.authToken}`;
  }

  // Try refreshing with the refresh token
  if (_tokenCache && (await refreshCachedToken(wpUrl))) {
    return `Bearer ${_tokenCache.authToken}`;
  }

  _tokenCache = null;

  // Full re-exchange
  const token = await exchangeSiteToken(wpUrl, secret);
  if (!token) {
    _siteTokenRetryAfter = Date.now() + SITETOKEN_RETRY_MS;
    return null;
  }
  _tokenCache = token;
  _siteTokenRetryAfter = 0;
  return `Bearer ${token.authToken}`;
}

function buildRelaySecretOption() {
  const relaySecret = getRelaySecret();
  if (!relaySecret) return null;
  return {
    mode: "relay-secret",
    authorization: "",
    headers: {
      [getRelayHeaderName()]: relaySecret,
    },
  };
}

function buildBasicOption({ bearerToken, username, appPassword }) {
  const tokenIsAppPassword =
    bearerToken && looksLikeApplicationPassword(bearerToken);
  const effectiveAppPassword =
    appPassword || (tokenIsAppPassword ? bearerToken : "");
  if (!username || !effectiveAppPassword) return null;
  return {
    mode: "basic",
    authorization: `Basic ${encodeBasicCredentials(username, effectiveAppPassword)}`,
  };
}

function buildBearerOption({ bearerToken }) {
  const tokenIsAppPassword =
    bearerToken && looksLikeApplicationPassword(bearerToken);
  if (!bearerToken || tokenIsAppPassword) return null;
  return {
    mode: "bearer",
    authorization: `Bearer ${bearerToken}`,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns an ordered list of auth header options to try for WordPress GraphQL.
 *
 * Priority:
 * 1. SiteToken → JWT Bearer  (Faust secret exchanged for a short-lived JWT)
 * 2. Relay secret header     (RAGBAZ relay lane; independent from app passwords)
 * 3. Basic auth              (Application Password, reliable fallback)
 * 4. Bearer JWT              (explicit WORDPRESS_GRAPHQL_AUTH_TOKEN, if JWT-shaped)
 * 5. Unauthenticated         (if nothing else is configured)
 *
 * The SiteToken exchange is the preferred method because it:
 *   - Requires only the Faust secret (no per-user app password)
 *   - Works with wp-graphql-headless-login's SITETOKEN provider
 *   - Tokens are short-lived and automatically refreshed
 *
 * Note: The WordPress `login` mutation must be publicly accessible for SiteToken
 * to work. Configure this in WP Admin → GraphQL → Settings → Auth.
 */
export async function getWordPressGraphqlAuthOptions() {
  const options = [];
  const learnedMode = getLearnedAuthMode();

  const bearerToken = normalizeEnv(process.env.WORDPRESS_GRAPHQL_AUTH_TOKEN);
  const username =
    normalizeEnv(process.env.WORDPRESS_GRAPHQL_USERNAME) ||
    normalizeEnv(process.env.WORDPRESS_USERNAME) ||
    normalizeEnv(process.env.WORDPRESS_USER);
  const appPassword = normalizeEnv(
    process.env.WORDPRESS_GRAPHQL_APPLICATION_PASSWORD ||
      process.env.WORDPRESS_GRAPHQL_APP_PASSWORD,
  );

  for (const mode of orderAuthModes()) {
    if (options.some((option) => option.mode === mode)) continue;
    if (mode === "sitetoken") {
      if (
        learnedMode &&
        learnedMode !== "sitetoken" &&
        options.some((option) => option.mode === learnedMode)
      ) {
        continue;
      }
      try {
        const bearer = await getSiteTokenBearer();
        if (bearer) {
          options.push({ mode: "sitetoken", authorization: bearer });
        }
      } catch {
        _siteTokenRetryAfter = Date.now() + SITETOKEN_RETRY_MS;
      }
      continue;
    }
    if (mode === "relay-secret") {
      const relayOption = buildRelaySecretOption();
      if (relayOption) options.push(relayOption);
      continue;
    }
    if (mode === "basic") {
      const basicOption = buildBasicOption({
        bearerToken,
        username,
        appPassword,
      });
      if (basicOption) options.push(basicOption);
      continue;
    }
    if (mode === "bearer") {
      const bearerOption = buildBearerOption({ bearerToken });
      if (bearerOption) options.push(bearerOption);
      continue;
    }
    if (mode === "none") {
      options.push({ mode: "none", authorization: "" });
    }
  }

  if (options.length === 0) {
    options.push({ mode: "none", authorization: "" });
  }
  return options;
}

export async function getWordPressGraphqlAuth() {
  const [first] = await getWordPressGraphqlAuthOptions();
  return first || { mode: "none", authorization: "" };
}

export function recordWordPressGraphqlAuthResult(mode, { ok, latencyMs } = {}) {
  if (ok) {
    rememberSuccessfulAuthMode(mode, latencyMs);
  } else {
    rememberFailedAuthMode(mode);
  }
}

export function getWordPressGraphqlAuthDiagnostics() {
  return {
    preferredMode: getLearnedAuthMode() || "",
    siteTokenRetryAfter: _siteTokenRetryAfter || 0,
    stats: Object.fromEntries(_authModeStats.entries()),
  };
}

/** Invalidate the cached SiteToken JWT (e.g. on auth failure). */
export function invalidateSiteTokenCache() {
  _tokenCache = null;
}
