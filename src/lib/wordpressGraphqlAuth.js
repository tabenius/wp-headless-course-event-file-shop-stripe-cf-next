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
