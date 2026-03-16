function normalizeEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}

function encodeBasicCredentials(username, password) {
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

function looksLikeApplicationPassword(value) {
  return value.includes(" ") && !value.includes(".");
}

/**
 * Returns an ordered list of auth header options to try for WordPress GraphQL.
 * Preference: Bearer token first (if present), then Basic (username + app password).
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

  if (bearerToken) {
    options.push({
      mode: "bearer",
      authorization: `Bearer ${bearerToken}`,
    });
  }

  if (username && (appPassword || looksLikeApplicationPassword(bearerToken))) {
    const password = appPassword || bearerToken;
    options.push({
      mode: "basic",
      authorization: `Basic ${encodeBasicCredentials(username, password)}`,
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
