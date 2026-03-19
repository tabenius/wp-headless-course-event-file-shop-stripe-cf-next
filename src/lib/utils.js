import { fetchGraphQL } from "../lib/client";

export function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return String(dateString);
  return date.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function capitalizeWords(str) {
  if (!str) return "";
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function getPosts({
  query,
  slug = "",
  pageSize = 10,
  after = null,
  revalidate = null,
}) {
  if (!slug) {
    return await fetchGraphQL(
      query,
      {
        first: pageSize,
        after,
      },
      revalidate,
    );
  }

  const querySlug = typeof slug === "string" ? slug : String(slug);
  return await fetchGraphQL(
    query,
    {
      slug: querySlug,
      first: pageSize,
      after,
    },
    revalidate,
  );
}

export function getPostsPerPage() {
  return 10;
}

export function createExcerpt(content, length = 150) {
  if (!content) return "";
  return (
    content.replace(/<[^>]*>/g, "").substring(0, length) +
    (content.length > length ? "..." : "")
  );
}
