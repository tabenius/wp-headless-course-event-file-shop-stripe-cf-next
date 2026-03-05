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

  const debugGraphQL = process.env.NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG === "1";

  try {
    if (debugGraphQL) {
      console.debug("[GraphQL Debug] Query:", query);
      console.debug("[GraphQL Debug] Variables:", variables);
    }
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

    const response = await fetch(`${wordpressUrl}/graphql`, fetchOptions);
    if (debugGraphQL) {
      console.debug("[GraphQL Debug] HTTP status:", response.status, response.statusText);
    }
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.includes("application/json")) {
      console.error(
        `Invalid GraphQL response: ${response.status} ${response.statusText}`,
      );
      return {};
    }

    const result = await response.json();
    if (debugGraphQL) {
      console.debug("[GraphQL Debug] Response payload:", result);
    }
    if (Array.isArray(result?.errors) && result.errors.length > 0) {
      console.error("GraphQL Error:", result.errors);
    }

    return result?.data || {};
  } catch (error) {
    console.error("Error fetching from WordPress:", error);
    return {};
  }
}
