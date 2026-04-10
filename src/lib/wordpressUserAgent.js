const DEFAULT_WORDPRESS_USER_AGENT =
  "ragbaz-storefront/1.0 (+https://ragbaz.xyz)";

export function getWordPressUserAgent() {
  const override = String(process.env.WORDPRESS_HTTP_USER_AGENT || "").trim();
  return override || DEFAULT_WORDPRESS_USER_AGENT;
}

export function withWordPressUserAgent(headers = {}) {
  return {
    ...headers,
    "User-Agent": getWordPressUserAgent(),
  };
}
