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

  const data = await fetchGraphQL(
    `query RagbazIndex {
      posts(first: 20) { edges { node { id uri title excerpt content } } }
      pages(first: 20) { edges { node { id uri title excerpt content } } }
      events(first: 20) { edges { node { id uri title excerpt content } } }
      lpCourses(first: 20) { edges { node { id uri title excerpt content } } }
      products(first: 20, where: { status: "publish" }) { edges { node {
        ... on SimpleProduct   { id: databaseId uri: slug name shortDescription content: description }
        ... on VariableProduct { id: databaseId uri: slug name shortDescription content: description }
        ... on ExternalProduct { id: databaseId uri: slug name shortDescription content: description }
      } } }
    }`,
    {},
    120,
  );

  const nodes = [
    ...(data?.posts?.edges || []).map((e) => ({ ...e.node, kind: "post" })),
    ...(data?.pages?.edges || []).map((e) => ({ ...e.node, kind: "page" })),
    ...(data?.events?.edges || []).map((e) => ({ ...e.node, kind: "event" })),
    ...(data?.lpCourses?.edges || []).map((e) => ({
      ...e.node,
      kind: "course",
    })),
    ...(data?.products?.edges || [])
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
  ];
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
