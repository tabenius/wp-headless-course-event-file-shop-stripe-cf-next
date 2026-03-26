import { resolveWordPressUrl } from "@/lib/wordpressUrl";

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

function getFaustSecret() {
  return (
    normalizeEnv(process.env.FAUST_SECRET_KEY) ||
    normalizeEnv(process.env.FAUSTWP_SECRET_KEY) ||
    normalizeEnv(process.env.FAUST_SECRET)
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
      headers,
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
  if (!token) return null;
  _tokenCache = token;
  return `Bearer ${token.authToken}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns an ordered list of auth header options to try for WordPress GraphQL.
 *
 * Priority:
 * 1. SiteToken → JWT Bearer  (Faust secret exchanged for a short-lived JWT)
 * 2. Basic auth              (Application Password, most reliable fallback)
 * 3. Bearer JWT              (explicit WORDPRESS_GRAPHQL_AUTH_TOKEN, if JWT-shaped)
 * 4. Unauthenticated         (if nothing else is configured)
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

  // 1. SiteToken → JWT (try first; fails gracefully if WP not configured)
  try {
    const bearer = await getSiteTokenBearer();
    if (bearer) {
      options.push({ mode: "sitetoken", authorization: bearer });
    }
  } catch {
    // SiteToken unavailable — continue to other options
  }

  const bearerToken = normalizeEnv(process.env.WORDPRESS_GRAPHQL_AUTH_TOKEN);
  const username =
    normalizeEnv(process.env.WORDPRESS_GRAPHQL_USERNAME) ||
    normalizeEnv(process.env.WORDPRESS_USERNAME) ||
    normalizeEnv(process.env.WORDPRESS_USER);
  const appPassword = normalizeEnv(
    process.env.WORDPRESS_GRAPHQL_APPLICATION_PASSWORD ||
      process.env.WORDPRESS_GRAPHQL_APP_PASSWORD,
  );

  const tokenIsAppPassword =
    bearerToken && looksLikeApplicationPassword(bearerToken);
  const effectiveAppPassword =
    appPassword || (tokenIsAppPassword ? bearerToken : "");

  // 2. Basic auth (Application Password)
  if (username && effectiveAppPassword) {
    options.push({
      mode: "basic",
      authorization: `Basic ${encodeBasicCredentials(username, effectiveAppPassword)}`,
    });
  }

  // 3. Bearer JWT (only if token looks like a JWT — has dots, no spaces)
  if (bearerToken && !tokenIsAppPassword) {
    options.push({
      mode: "bearer",
      authorization: `Bearer ${bearerToken}`,
    });
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

/** Invalidate the cached SiteToken JWT (e.g. on auth failure). */
export function invalidateSiteTokenCache() {
  _tokenCache = null;
}
