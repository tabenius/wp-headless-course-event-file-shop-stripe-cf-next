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

  try {
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
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.includes("application/json")) {
      console.error(
        `Invalid GraphQL response: ${response.status} ${response.statusText}`,
      );
      return {};
    }

    const result = await response.json();
    if (Array.isArray(result?.errors) && result.errors.length > 0) {
      console.error("GraphQL Error:", result.errors);
    }

    return result?.data || {};
  } catch (error) {
    console.error("Error fetching from WordPress:", error);
    return {};
  }
}
