import { fetchGraphQL } from "@/lib/client";
import { embedTexts } from "@/lib/ai";
import { manuals } from "@/lib/manuals";
import { stripHtml } from "@/lib/stripHtml";
import { chunkText, cosine } from "./rag-utils";

export { chunkText, cosine } from "./rag-utils";

export const INDEX_CACHE = { ts: 0, chunks: [], indexed: [] };
export const CACHE_TTL_MS = 10 * 60 * 1000;

export async function buildIndex(force = false) {
  const now = Date.now();
  if (
    !force &&
    INDEX_CACHE.chunks.length > 0 &&
    now - INDEX_CACHE.ts < CACHE_TTL_MS
  ) {
    return INDEX_CACHE.chunks;
  }

  // Run each content type as a separate query so a missing CPT (events,
  // lpCourses, WooCommerce) doesn't silently kill the entire fetch.
  async function tryFetch(query, extract) {
    try {
      const data = await fetchGraphQL(query, {}, 120);
      return extract(data) || [];
    } catch {
      return [];
    }
  }

  const [posts, pages, events, courses, products] = await Promise.all([
    tryFetch(
      `{ posts(first: 20) { edges { node { id uri title excerpt content } } } }`,
      (d) => (d?.posts?.edges || []).map((e) => ({ ...e.node, kind: "post" })),
    ),
    tryFetch(
      `{ pages(first: 20) { edges { node { id uri title excerpt content } } } }`,
      (d) => (d?.pages?.edges || []).map((e) => ({ ...e.node, kind: "page" })),
    ),
    tryFetch(
      `{ events(first: 20) { edges { node { id uri title excerpt content } } } }`,
      (d) =>
        (d?.events?.edges || []).map((e) => ({ ...e.node, kind: "event" })),
    ),
    tryFetch(
      `{ lpCourses(first: 20) { edges { node { id uri title excerpt content } } } }`,
      (d) =>
        (d?.lpCourses?.edges || []).map((e) => ({ ...e.node, kind: "course" })),
    ),
    tryFetch(
      `{ products(first: 20, where: { status: "publish" }) { edges { node {
        ... on SimpleProduct   { id: databaseId uri: slug name shortDescription content: description }
        ... on VariableProduct { id: databaseId uri: slug name shortDescription content: description }
        ... on ExternalProduct { id: databaseId uri: slug name shortDescription content: description }
      } } } }`,
      (d) =>
        (d?.products?.edges || [])
          .map((e) => e.node)
          .filter((n) => n?.name)
          .map((n) => ({
            id: String(n.id),
            uri: n.uri ? `/product/${n.uri}` : "/shop",
            title: n.name,
            excerpt: n.shortDescription || "",
            content: n.content || n.shortDescription || "",
            kind: "product",
          })),
    ),
  ]);

  const nodes = [...posts, ...pages, ...events, ...courses, ...products];
  manuals.forEach((manual) => {
    nodes.push({
      id: manual.title,
      uri: "/docs",
      title: manual.title,
      content: manual.text,
      kind: "manual",
    });
  });

  const chunks = [];
  for (const n of nodes) {
    const excerpt = stripHtml(n.excerpt || n.shortDescription || "")
      .replace(/\s+/g, " ")
      .trim();
    const body = stripHtml(n.content || "")
      .replace(/\s+/g, " ")
      .trim();
    // Lead with excerpt/short description so it appears in every chunk;
    // append full body for deep retrieval.
    const combined = [excerpt, body].filter(Boolean).join("\n\n");
    const base = `${n.title || ""}\n\n${combined}`;
    for (const chunk of chunkText(base)) {
      chunks.push({
        id: `${n.id}-${chunks.length}`,
        uri: n.uri,
        title: n.title,
        kind: n.kind,
        text: chunk,
      });
    }
  }

  const embeddings = await embedTexts(chunks.map((c) => c.text));
  INDEX_CACHE.chunks = chunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i],
  }));
  INDEX_CACHE.ts = now;

  // Deduplicated list of indexed items for the rebuild summary
  const seen = new Set();
  INDEX_CACHE.indexed = [];
  for (const chunk of chunks) {
    const key = `${chunk.kind}:${chunk.uri}`;
    if (!seen.has(key)) {
      seen.add(key);
      INDEX_CACHE.indexed.push({
        kind: chunk.kind,
        title: chunk.title,
        uri: chunk.uri,
      });
    }
  }

  return INDEX_CACHE.chunks;
}

/** Return the deduplicated index manifest (populated after first buildIndex call). */
export function getIndexedItems() {
  return INDEX_CACHE.indexed;
}
