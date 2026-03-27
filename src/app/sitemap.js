import { fetchGraphQL } from "@/lib/client";
import site from "@/lib/site";

const siteUrl = site.url;
const SITEMAP_COMBINED_QUERY = `
  query SitemapCombined {
    pages(first: 100) {
      edges {
        node {
          uri
          modified
        }
      }
    }
    posts(first: 100) {
      edges {
        node {
          uri
          modified
        }
      }
    }
    lpCourses(first: 100) {
      edges {
        node {
          uri
          modified
        }
      }
    }
  }
`;

const SITEMAP_CORE_QUERY = `
  query SitemapCore {
    pages(first: 100) {
      edges {
        node {
          uri
          modified
        }
      }
    }
    posts(first: 100) {
      edges {
        node {
          uri
          modified
        }
      }
    }
  }
`;

function pushNodes(entries, nodes, { priority, changeFrequency }) {
  for (const { node } of nodes || []) {
    if (!node?.uri || node.uri === "/") continue;
    entries.push({
      url: `${siteUrl}${node.uri.replace(/\/$/, "")}`,
      lastModified: node.modified ? new Date(node.modified) : undefined,
      changeFrequency,
      priority,
    });
  }
}

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

  try {
    const data = await fetchGraphQL(SITEMAP_COMBINED_QUERY, {}, 3600, {
      edgeCache: true,
    });
    pushNodes(entries, data?.pages?.edges, {
      priority: 0.7,
      changeFrequency: "monthly",
    });
    pushNodes(entries, data?.posts?.edges, {
      priority: 0.6,
      changeFrequency: "monthly",
    });
    pushNodes(entries, data?.lpCourses?.edges, {
      priority: 0.8,
      changeFrequency: "monthly",
    });
    return entries;
  } catch {
    // Fallback for installs where LearnPress types are not present.
  }

  try {
    const data = await fetchGraphQL(SITEMAP_CORE_QUERY, {}, 3600, {
      edgeCache: true,
    });
    pushNodes(entries, data?.pages?.edges, {
      priority: 0.7,
      changeFrequency: "monthly",
    });
    pushNodes(entries, data?.posts?.edges, {
      priority: 0.6,
      changeFrequency: "monthly",
    });
  } catch {
    // Keep static defaults only when upstream content fetch fails.
  }

  return entries;
}
