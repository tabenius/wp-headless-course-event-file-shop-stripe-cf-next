function normalizeEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}

function encodeBasicCredentials(username, password) {
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

function looksLikeApplicationPassword(value) {
  return value.includes(" ") && !value.includes(".");
}

export function getWordPressGraphqlAuth() {
  const bearerToken = normalizeEnv(process.env.WORDPRESS_GRAPHQL_AUTH_TOKEN);
  const username = normalizeEnv(process.env.WORDPRESS_GRAPHQL_USERNAME);
  const appPassword = normalizeEnv(
    process.env.WORDPRESS_GRAPHQL_APPLICATION_PASSWORD || process.env.WORDPRESS_GRAPHQL_APP_PASSWORD,
  );

  if (username && appPassword) {
    return {
      mode: "basic",
      authorization: `Basic ${encodeBasicCredentials(username, appPassword)}`,
    };
  }

  // Backwards-compatible fallback: when token actually stores an app password.
  if (username && bearerToken && looksLikeApplicationPassword(bearerToken)) {
    return {
      mode: "basic",
      authorization: `Basic ${encodeBasicCredentials(username, bearerToken)}`,
    };
  }

  if (bearerToken) {
    return {
      mode: "bearer",
      authorization: `Bearer ${bearerToken}`,
    };
  }

  return {
    mode: "none",
    authorization: "",
  };
}
