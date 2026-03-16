import { getWordPressGraphqlAuthOptions } from "@/lib/wordpressGraphqlAuth";

const DEFAULT_DELAY_MS = Number.parseInt(process.env.GRAPHQL_DELAY_MS || "150", 10) || 0;
let lastCallTs = 0;

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
    // On error, assume the type does not exist to avoid breaking queries
    _typeCache.set(typeName, false);
    return false;
  }
}

export async function fetchGraphQL(query, variables = {}, revalidate = null) {
  if (typeof query !== "string" || query.trim().length === 0) {
    console.error("fetchGraphQL called with an invalid query");
    return {};
  }

  const wordpressUrl = process.env.NEXT_PUBLIC_WORDPRESS_URL;
  if (!wordpressUrl) {
    console.error("NEXT_PUBLIC_WORDPRESS_URL is not set");
    return {};
  }
  const graphqlEndpoint = `${wordpressUrl.replace(/\/+$/, "")}/graphql`;

  const debugGraphQL = process.env.NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG === "1";

  try {
    if (debugGraphQL) {
      console.debug("[GraphQL Debug] Query:", query);
      console.debug("[GraphQL Debug] Variables:", variables);
    }
    const authOptions = getWordPressGraphqlAuthOptions();
    let lastError = null;

    for (const auth of authOptions) {
      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(auth.authorization ? { Authorization: auth.authorization } : {}),
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
      const response = await fetch(graphqlEndpoint, fetchOptions);
      lastCallTs = Date.now();
      const contentType = response.headers.get("content-type") || "";
      if (debugGraphQL) {
        console.debug("[GraphQL Debug] Auth mode:", auth.mode);
        console.debug("[GraphQL Debug] Endpoint:", graphqlEndpoint);
        console.debug("[GraphQL Debug] HTTP status:", response.status, response.statusText);
      }

      if (!response.ok || !contentType.includes("application/json")) {
        const text = await response.text().catch(() => "<unable to read body>");
        const statusTooMany = response.status === 429 || response.status === 503;
        const varnishHit = /varnish|too many/i.test(text) || statusTooMany;
        lastError = `Invalid GraphQL response: ${response.status} ${response.statusText} / content-type=${contentType} / body=${firstLines(text)}`;
        if (debugGraphQL) console.error(lastError);
        if (varnishHit) {
          await sleep(250);
          continue;
        }
        continue;
      }

      const result = await response.json();
      if (debugGraphQL) {
        console.debug("[GraphQL Debug] Response payload:", result);
      }
      if (Array.isArray(result?.errors) && result.errors.length > 0) {
        lastError = `GraphQL Error: ${JSON.stringify(result.errors)}`;
        if (debugGraphQL) console.error(lastError);
        continue;
      }

      return result?.data || {};
    }

    if (lastError) {
      console.error(lastError);
    }
    return {};
  } catch (error) {
    console.error("Error fetching from WordPress:", error);
    return {};
  }
}
