import { fetchGraphQL } from "@/lib/client";
import { embedTexts } from "@/lib/ai";
import { manuals } from "@/lib/manuals";
import { stripHtml } from "@/lib/stripHtml";
import { chunkText, cosine } from "./rag-utils";

export { chunkText, cosine } from "./rag-utils";

export const INDEX_CACHE = { ts: 0, chunks: [] };
export const CACHE_TTL_MS = 10 * 60 * 1000;

export async function buildIndex(force = false) {
  const now = Date.now();
  if (!force && INDEX_CACHE.chunks.length > 0 && now - INDEX_CACHE.ts < CACHE_TTL_MS) {
    return INDEX_CACHE.chunks;
  }

  const data = await fetchGraphQL(
    `query RagbazIndex {
      posts(first: 10) { edges { node { id uri title content } } }
      pages(first: 10) { edges { node { id uri title content } } }
      events(first: 10) { edges { node { id uri title content } } }
      lpCourses(first: 10) { edges { node { id uri title content } } }
    }`,
    {},
    120,
  );

  const nodes = [
    ...(data?.posts?.edges || []).map((e) => ({ ...e.node, kind: "post" })),
    ...(data?.pages?.edges || []).map((e) => ({ ...e.node, kind: "page" })),
    ...(data?.events?.edges || []).map((e) => ({ ...e.node, kind: "event" })),
    ...(data?.lpCourses?.edges || []).map((e) => ({ ...e.node, kind: "course" })),
  ];
  manuals.forEach((manual) => {
    nodes.push({ id: manual.title, uri: "/docs", title: manual.title, content: manual.text, kind: "manual" });
  });

  const chunks = [];
  for (const n of nodes) {
    const text = stripHtml(n.content || "").replace(/\s+/g, " ").trim();
    const base = `${n.title || ""}\n\n${text}`;
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
  INDEX_CACHE.chunks = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));
  INDEX_CACHE.ts = now;
  return INDEX_CACHE.chunks;
}
