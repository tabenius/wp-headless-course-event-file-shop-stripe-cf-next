import { fetchGraphQL } from "@/lib/client";
import { embedTexts } from "@/lib/ai";
import { manuals } from "@/lib/manuals";
import { appendServerLog } from "@/lib/serverLog";
import { stripHtml } from "@/lib/stripHtml";
import { chunkText, cosine } from "./rag-utils";

export { chunkText, cosine } from "./rag-utils";

export const INDEX_CACHE = { ts: 0, chunks: [], indexed: [], errors: [] };
export const CACHE_TTL_MS = 10 * 60 * 1000;

// Prevent concurrent rebuilds from double-charging embeddings
let _buildPromise = null;

/**
 * Fetch one content type, returning { label, items, error }.
 * - Uses only fields that are universally supported for each CPT.
 * - Logs failures to appendServerLog so admin can diagnose schema gaps.
 */
async function tryFetch(label, query, extract) {
  try {
    const data = await fetchGraphQL(query, {}, 120);
    // fetchGraphQL returns {} on timeout — detect empty-object response
    if (!data || Object.keys(data).length === 0) {
      const msg = `RAG index: ${label} returned empty data (timeout or auth error)`;
      appendServerLog({ level: "warn", msg }).catch(() => {});
      return { label, items: [], error: "empty response (timeout?)" };
    }
    const items = extract(data) || [];
    return { label, items, error: null };
  } catch (err) {
    const msg = `RAG index: ${label} failed — ${err?.message || err}`;
    appendServerLog({ level: "error", msg }).catch(() => {});
    return { label, items: [], error: err?.message || "fetch failed" };
  }
}

/**
 * Try to fetch extra fields for already-fetched items and merge them in.
 * Silently returns baseItems unchanged if the query fails or the fields
 * don't exist in the schema — so base content is never lost.
 * extractExtras(data) must return [{ id, extraText }] where extraText is
 * plain-text lines to append to the item's content.
 */
async function tryEnrich(baseItems, label, query, extractExtras) {
  if (baseItems.length === 0) return baseItems;
  try {
    const data = await fetchGraphQL(query, {}, 60);
    if (!data || Object.keys(data).length === 0) return baseItems;
    const extras = extractExtras(data) || [];
    const extraMap = new Map(extras.map((e) => [e.id, e.extraText]));
    return baseItems.map((item) => {
      const extra = extraMap.get(item.id);
      if (!extra) return item;
      return { ...item, content: `${item.content || ""}\n\n${extra}`.trim() };
    });
  } catch (err) {
    appendServerLog({
      level: "warn",
      msg: `RAG enrich: ${label} failed — ${err?.message || err}`,
    }).catch(() => {});
    return baseItems;
  }
}

async function _doRebuild() {
  const results = await Promise.all([
    tryFetch(
      "posts",
      `{ posts(first: 20) { edges { node { id uri title excerpt content } } } }`,
      (d) => (d?.posts?.edges || []).map((e) => ({ ...e.node, kind: "post" })),
    ),
    tryFetch(
      "pages",
      `{ pages(first: 20) { edges { node { id uri title excerpt content } } } }`,
      (d) => (d?.pages?.edges || []).map((e) => ({ ...e.node, kind: "page" })),
    ),
    // events: no excerpt field in standard WPGraphQL
    tryFetch(
      "events",
      `{ events(first: 20) { edges { node { id uri title content } } } }`,
      (d) =>
        (d?.events?.edges || []).map((e) => ({ ...e.node, kind: "event" })),
    ),
    // lpCourses: no excerpt field in standard LearnPress WPGraphQL
    tryFetch(
      "courses",
      `{ lpCourses(first: 20) { edges { node { id uri title content } } } }`,
      (d) =>
        (d?.lpCourses?.edges || []).map((e) => ({ ...e.node, kind: "course" })),
    ),
    // products: avoid field aliases which some WooCommerce WPGraphQL versions reject
    tryFetch(
      "products",
      `{ products(first: 20, where: { status: "publish" }) { edges { node {
        ... on SimpleProduct   { databaseId uri name shortDescription description }
        ... on VariableProduct { databaseId uri name shortDescription description }
        ... on ExternalProduct { databaseId uri name shortDescription description }
      } } } }`,
      (d) =>
        (d?.products?.edges || [])
          .map((e) => e.node)
          .filter((n) => n?.name)
          .map((n) => ({
            id: String(n.databaseId || n.name),
            uri: n.uri || `/shop`,
            title: n.name,
            excerpt: n.shortDescription || "",
            content: n.description || n.shortDescription || "",
            kind: "product",
          })),
    ),
  ]);

  // Enrich events with date/venue/organizer and courses with categories.
  // These run in parallel; each fails silently if the fields aren't in the schema.
  const [eventsEnriched, coursesEnriched] = await Promise.all([
    tryEnrich(
      results[2].items,
      "events-extra",
      `{ events(first: 20) { edges { node {
        id
        startDate
        endDate
        venue { node { title address city } }
        organizer { nodes { title } }
      } } } }`,
      (d) =>
        (d?.events?.edges || []).map((e) => ({
          id: e.node.id,
          extraText: [
            e.node.startDate ? `Date: ${e.node.startDate}` : null,
            e.node.endDate && e.node.endDate !== e.node.startDate
              ? `End date: ${e.node.endDate}`
              : null,
            e.node.venue?.node?.title
              ? `Venue: ${e.node.venue.node.title}`
              : null,
            e.node.venue?.node?.address
              ? `Address: ${e.node.venue.node.address}${e.node.venue.node.city ? `, ${e.node.venue.node.city}` : ""}`
              : null,
            e.node.organizer?.nodes?.length
              ? `Organizer: ${e.node.organizer.nodes.map((o) => o.title).join(", ")}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
    ),
    tryEnrich(
      results[3].items,
      "courses-extra",
      `{ lpCourses(first: 20) { edges { node {
        id
        lpCourseCategory { nodes { name } }
      } } } }`,
      (d) =>
        (d?.lpCourses?.edges || []).map((e) => ({
          id: e.node.id,
          extraText: e.node.lpCourseCategory?.nodes?.length
            ? `Category: ${e.node.lpCourseCategory.nodes.map((c) => c.name).join(", ")}`
            : "",
        })),
    ),
  ]);
  results[2].items = eventsEnriched;
  results[3].items = coursesEnriched;

  const nodes = results.flatMap((r) => r.items);
  INDEX_CACHE.errors = results
    .filter((r) => r.error)
    .map((r) => `${r.label}: ${r.error}`);

  manuals.forEach((manual) => {
    nodes.push({
      id: manual.title,
      uri: manual.uri || "https://ragbaz.xyz/docs/en/technical-manual",
      title: manual.title,
      content: manual.text,
      kind: "manual",
    });
  });

  const chunks = [];
  for (const n of nodes) {
    const excerpt = stripHtml(n.excerpt || "")
      .replace(/\s+/g, " ")
      .trim();
    const body = stripHtml(n.content || "")
      .replace(/\s+/g, " ")
      .trim();
    const combined = [excerpt, body].filter(Boolean).join("\n\n");
    // Skip items with no meaningful text — don't waste embedding budget
    if (!combined && !n.title) continue;
    const base = `${n.title || ""}\n\n${combined}`.trim();
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
  INDEX_CACHE.ts = Date.now();

  // Deduplicated manifest for rebuild summary
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

  // Log summary
  const counts = results.map((r) => `${r.label}:${r.items.length}`).join(" ");
  appendServerLog({
    level: "info",
    msg: `RAG index rebuilt — ${INDEX_CACHE.indexed.filter((i) => i.kind !== "manual").length} WP items, ${chunks.length} chunks. ${counts}${INDEX_CACHE.errors.length ? ` ERRORS: ${INDEX_CACHE.errors.join("; ")}` : ""}`,
  }).catch(() => {});
}

export async function buildIndex(force = false) {
  const now = Date.now();
  if (
    !force &&
    INDEX_CACHE.chunks.length > 0 &&
    now - INDEX_CACHE.ts < CACHE_TTL_MS
  ) {
    return INDEX_CACHE.chunks;
  }

  // If a rebuild is already running, wait for it instead of starting another
  if (_buildPromise) {
    await _buildPromise;
    return INDEX_CACHE.chunks;
  }

  _buildPromise = _doRebuild().finally(() => {
    _buildPromise = null;
  });
  await _buildPromise;
  return INDEX_CACHE.chunks;
}

/** Return the deduplicated index manifest (populated after first buildIndex call). */
export function getIndexedItems() {
  return INDEX_CACHE.indexed;
}

/** Return any errors from the last rebuild. */
export function getIndexErrors() {
  return INDEX_CACHE.errors;
}
