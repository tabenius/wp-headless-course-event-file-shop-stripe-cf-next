function normalizeEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}

function encodeBasicCredentials(username, password) {
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
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

/**
 * Returns an ordered list of auth header options to try for WordPress GraphQL.
 *
 * Priority logic:
 * 1. If an explicit Application Password is set (WORDPRESS_GRAPHQL_APPLICATION_PASSWORD),
 *    use Basic auth first — it's the most reliable method.
 * 2. If WORDPRESS_GRAPHQL_AUTH_TOKEN looks like an Application Password (spaces, no dots),
 *    prefer Basic auth over Bearer to avoid a wasted 403 from wp-graphql-headless-login.
 * 3. If the token looks like a JWT (has dots), try Bearer first.
 * 4. Faust secret headers are tried when configured.
 * 5. Falls back to unauthenticated if nothing is configured.
 */
export function getWordPressGraphqlAuthOptions() {
  const options = [];
  const bearerToken = normalizeEnv(process.env.WORDPRESS_GRAPHQL_AUTH_TOKEN);
  const username =
    normalizeEnv(process.env.WORDPRESS_GRAPHQL_USERNAME) ||
    normalizeEnv(process.env.WORDPRESS_USERNAME) ||
    normalizeEnv(process.env.WORDPRESS_USER);
  const appPassword = normalizeEnv(
    process.env.WORDPRESS_GRAPHQL_APPLICATION_PASSWORD ||
      process.env.WORDPRESS_GRAPHQL_APP_PASSWORD,
  );

  // Determine if the token looks like an Application Password vs a JWT/Bearer token
  const tokenIsAppPassword =
    bearerToken && looksLikeApplicationPassword(bearerToken);
  const effectiveAppPassword =
    appPassword || (tokenIsAppPassword ? bearerToken : "");

  // Basic auth first when we have a username + application password
  if (username && effectiveAppPassword) {
    options.push({
      mode: "basic",
      authorization: `Basic ${encodeBasicCredentials(username, effectiveAppPassword)}`,
    });
  }

  // Bearer token only if it looks like a JWT (has dots, no spaces)
  if (bearerToken && !tokenIsAppPassword) {
    options.push({
      mode: "bearer",
      authorization: `Bearer ${bearerToken}`,
    });
  }

  const faustSecret = getFaustSecret();
  if (faustSecret) {
    options.push({
      mode: "faust",
      authorization: `Bearer ${faustSecret}`,
      headers: {
        "X-Headless-Secret": faustSecret,
        "X-Faust-Secret": faustSecret,
      },
    });
  }

  if (options.length === 0) {
    options.push({ mode: "none", authorization: "" });
  }
  return options;
}

export function getWordPressGraphqlAuth() {
  const [first] = getWordPressGraphqlAuthOptions();
  return first || { mode: "none", authorization: "" };
}
