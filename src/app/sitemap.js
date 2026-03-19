import { fetchGraphQL, hasGraphQLType } from "@/lib/client";
import site from "@/lib/site";

const siteUrl = site.url;

export default async function sitemap() {
  const entries = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    { url: `${siteUrl}/blog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/courses`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/shop`, changeFrequency: "weekly", priority: 0.7 },
  ];

  // Fetch all pages
  try {
    const pageData = await fetchGraphQL(
      `{ pages(first: 100) { edges { node { uri modified } } } }`,
      {},
      3600,
    );
    for (const { node } of pageData?.pages?.edges || []) {
      if (node.uri && node.uri !== "/") {
        entries.push({
          url: `${siteUrl}${node.uri.replace(/\/$/, "")}`,
          lastModified: node.modified ? new Date(node.modified) : undefined,
          changeFrequency: "monthly",
          priority: 0.7,
        });
      }
    }
  } catch {}

  // Fetch all posts
  try {
    const postData = await fetchGraphQL(
      `{ posts(first: 100) { edges { node { uri modified } } } }`,
      {},
      3600,
    );
    for (const { node } of postData?.posts?.edges || []) {
      if (node.uri) {
        entries.push({
          url: `${siteUrl}${node.uri.replace(/\/$/, "")}`,
          lastModified: node.modified ? new Date(node.modified) : undefined,
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
    }
  } catch {}

  // Fetch LearnPress courses (auto-detected via schema introspection)
  if (await hasGraphQLType("LpCourse")) {
    try {
      const courseData = await fetchGraphQL(
        `{ lpCourses(first: 100) { edges { node { uri modified } } } }`,
        {},
        3600,
      );
      for (const { node } of courseData?.lpCourses?.edges || []) {
        if (node.uri) {
          entries.push({
            url: `${siteUrl}${node.uri.replace(/\/$/, "")}`,
            lastModified: node.modified ? new Date(node.modified) : undefined,
            changeFrequency: "monthly",
            priority: 0.8,
          });
        }
      }
    } catch {}
  }

  return entries;
}
