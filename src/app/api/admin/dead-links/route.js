import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { fetchGraphQL } from "@/lib/client";
import {
  classifyHref,
  extractAnchorsFromHtml,
  summarizeLinkKinds,
} from "@/lib/deadLinks";

export const runtime = "nodejs";

const MAX_LINK_CHECKS = 200;
const DEFAULT_LINK_CHECKS = 100;
const LINK_CHECK_TIMEOUT_MS = 6000;

function parseLimit(input) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LINK_CHECKS;
  return Math.max(1, Math.min(parsed, MAX_LINK_CHECKS));
}

function normalizeUrlHost(rawUrl) {
  try {
    return new URL(String(rawUrl || "")).hostname;
  } catch {
    return "";
  }
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return "";
}

async function collectWordPressContent() {
  const [postsData, pagesData, eventsData, coursesData, productsData] =
    await Promise.all([
      fetchGraphQL(
        "{ posts(first: 100) { edges { node { id uri title excerpt content } } } }",
      ),
      fetchGraphQL(
        "{ pages(first: 100) { edges { node { id uri title excerpt content } } } }",
      ),
      fetchGraphQL(
        "{ events(first: 100) { edges { node { id uri title content } } } }",
      ),
      fetchGraphQL(
        "{ lpCourses(first: 100) { edges { node { id uri title excerpt content } } } }",
      ),
      fetchGraphQL(`{
        products(first: 100, where: { status: "publish" }) {
          edges {
            node {
              ... on SimpleProduct { databaseId uri name shortDescription description }
              ... on VariableProduct { databaseId uri name shortDescription description }
              ... on ExternalProduct { databaseId uri name shortDescription description }
            }
          }
        }
      }`),
    ]);

  const nodes = [];
  for (const edge of postsData?.posts?.edges || []) {
    nodes.push({
      id: edge?.node?.id,
      kind: "post",
      title: firstString(edge?.node?.title, edge?.node?.uri),
      uri: firstString(edge?.node?.uri, "/"),
      htmlFields: [edge?.node?.excerpt, edge?.node?.content],
    });
  }
  for (const edge of pagesData?.pages?.edges || []) {
    nodes.push({
      id: edge?.node?.id,
      kind: "page",
      title: firstString(edge?.node?.title, edge?.node?.uri),
      uri: firstString(edge?.node?.uri, "/"),
      htmlFields: [edge?.node?.excerpt, edge?.node?.content],
    });
  }
  for (const edge of eventsData?.events?.edges || []) {
    nodes.push({
      id: edge?.node?.id,
      kind: "event",
      title: firstString(edge?.node?.title, edge?.node?.uri),
      uri: firstString(edge?.node?.uri, "/"),
      htmlFields: [edge?.node?.content],
    });
  }
  for (const edge of coursesData?.lpCourses?.edges || []) {
    nodes.push({
      id: edge?.node?.id,
      kind: "course",
      title: firstString(edge?.node?.title, edge?.node?.uri),
      uri: firstString(edge?.node?.uri, "/"),
      htmlFields: [edge?.node?.excerpt, edge?.node?.content],
    });
  }
  for (const edge of productsData?.products?.edges || []) {
    const node = edge?.node || {};
    const title = firstString(node.name, node.uri, String(node.databaseId || ""));
    nodes.push({
      id: String(node.databaseId || title),
      kind: "product",
      title,
      uri: firstString(node.uri, "/shop"),
      htmlFields: [node.shortDescription, node.description],
    });
  }

  return nodes;
}

function collectLinkOccurrences(nodes, classificationContext) {
  const grouped = new Map();

  for (const node of Array.isArray(nodes) ? nodes : []) {
    const source = {
      kind: node.kind || "content",
      title: firstString(node.title, node.uri),
      uri: firstString(node.uri, "/"),
    };
    for (const html of node.htmlFields || []) {
      for (const href of extractAnchorsFromHtml(html)) {
        const key = href.trim().toLowerCase();
        if (!grouped.has(key)) {
          const classified = classifyHref(href, classificationContext);
          grouped.set(key, {
            href,
            kind: classified.kind,
            translatedPath: classified.translatedPath,
            checkUrl: classified.checkUrl,
            occurrences: 0,
            sourcesMap: new Map(),
          });
        }
        const entry = grouped.get(key);
        entry.occurrences += 1;
        entry.sourcesMap.set(`${source.kind}:${source.uri}`, source);
      }
    }
  }

  return Array.from(grouped.values()).map((entry) => ({
    href: entry.href,
    kind: entry.kind,
    translatedPath: entry.translatedPath,
    checkUrl: entry.checkUrl,
    occurrences: entry.occurrences,
    sources: Array.from(entry.sourcesMap.values()),
  }));
}

function fetchWithTimeout(url, init, timeoutMs = LINK_CHECK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, redirect: "follow", cache: "no-store", signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

async function checkLinkReachability(entry) {
  if (!entry?.checkUrl) {
    return {
      reachability: "skipped",
      statusCode: null,
      finalUrl: null,
      error: null,
    };
  }
  try {
    let response = await fetchWithTimeout(entry.checkUrl, { method: "HEAD" });
    if (response.status === 405 || response.status === 501) {
      response = await fetchWithTimeout(entry.checkUrl, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
    }
    return {
      reachability: response.status < 400 ? "ok" : "broken",
      statusCode: response.status,
      finalUrl: response.url || entry.checkUrl,
      error: null,
    };
  } catch (error) {
    return {
      reachability: "broken",
      statusCode: null,
      finalUrl: null,
      error: String(error?.name === "AbortError" ? "timeout" : error?.message || "network_error"),
    };
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const result = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      result[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return result;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const requestOrigin = url.origin;
  const siteHost =
    normalizeUrlHost(process.env.NEXT_PUBLIC_WORDPRESS_URL) ||
    normalizeUrlHost(requestOrigin);

  try {
    const nodes = await collectWordPressContent();
    const groupedLinks = collectLinkOccurrences(nodes, {
      siteHost,
      origin: requestOrigin,
    });
    const sorted = groupedLinks.sort((a, b) => {
      if (a.kind !== b.kind) return String(a.kind).localeCompare(String(b.kind));
      if (a.occurrences !== b.occurrences) return b.occurrences - a.occurrences;
      return String(a.href).localeCompare(String(b.href));
    });

    const toCheck = sorted.slice(0, limit);
    const checked = await mapWithConcurrency(toCheck, 8, async (entry) => ({
      ...entry,
      ...(await checkLinkReachability(entry)),
    }));
    const unchecked = sorted.slice(limit).map((entry) => ({
      ...entry,
      reachability: "unchecked",
      statusCode: null,
      finalUrl: null,
      error: null,
    }));
    const links = [...checked, ...unchecked];

    const linkKinds = summarizeLinkKinds(links);
    const reachability = links.reduce(
      (acc, link) => {
        if (link.reachability === "ok") acc.ok += 1;
        else if (link.reachability === "broken") acc.broken += 1;
        else if (link.reachability === "unchecked") acc.unchecked += 1;
        else acc.skipped += 1;
        return acc;
      },
      { ok: 0, broken: 0, unchecked: 0, skipped: 0 },
    );

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      siteHost,
      totals: {
        ...linkKinds,
        ...reachability,
      },
      links,
      scannedContentItems: nodes.length,
      limit,
      truncated: links.length > limit,
    });
  } catch (error) {
    console.error("admin dead-links error", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to scan links",
      },
      { status: 500 },
    );
  }
}
