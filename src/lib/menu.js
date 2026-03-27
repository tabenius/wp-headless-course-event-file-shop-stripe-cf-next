import { fetchGraphQL } from "@/lib/client";
import site from "@/lib/site";
import { resolveWordPressUrl } from "@/lib/wordpressUrl";
import {
  ensureCoreMenuEntriesByExistence,
  filterNavigationByExistence,
} from "@/lib/menuFilter";
import { cache } from "react";
import { readCloudflareKvJson, writeCloudflareKvJson } from "@/lib/cloudflareKv";

const MENU_QUERY = `
  query GetPrimaryMenu {
    menus(where: { location: PRIMARY }) {
      edges {
        node {
          menuItems(first: 100, where: { parentId: 0 }) {
            edges {
              node {
                label
                path
                url
                childItems {
                  edges {
                    node {
                      label
                      path
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/** Remap known WordPress paths to frontend routes */
const PATH_REWRITES = {
  "/events/event/": "/events",
  "/events/event": "/events",
  "/butik/": "/shop",
  "/butik": "/shop",
  "/blog-section/": "/blog",
  "/blog-section": "/blog",
};

const MENU_URI_CHECK_TTL_MS =
  Number.parseInt(process.env.MENU_URI_CHECK_TTL_MS || "300000", 10) || 300000;
const menuUriExistenceCache = new Map();
const MENU_SITEMAP_TTL_MS =
  Number.parseInt(process.env.MENU_SITEMAP_TTL_MS || "600000", 10) || 600000;
const MENU_SITEMAP_MAX_FILES =
  Number.parseInt(process.env.MENU_SITEMAP_MAX_FILES || "24", 10) || 24;
const MENU_SITEMAP_TIMEOUT_MS =
  Number.parseInt(process.env.MENU_SITEMAP_TIMEOUT_MS || "8000", 10) || 8000;
const MENU_SNAPSHOT_KV_KEY = process.env.MENU_SNAPSHOT_KV_KEY || "menu:primary:v1";
const MENU_SNAPSHOT_TTL_MS =
  Number.parseInt(process.env.MENU_SNAPSHOT_TTL_MS || "300000", 10) || 300000;
let sitemapCache = {
  expiresAt: 0,
  paths: null,
  pending: null,
};
let menuSnapshotCache = {
  expiresAt: 0,
  items: null,
  pending: null,
};

export function resetMenuCaches() {
  menuUriExistenceCache.clear();
  sitemapCache = {
    expiresAt: 0,
    paths: null,
    pending: null,
  };
  menuSnapshotCache = {
    expiresAt: 0,
    items: null,
    pending: null,
  };
}

export async function purgeMenuSnapshot() {
  menuSnapshotCache = {
    expiresAt: 0,
    items: null,
    pending: null,
  };
  try {
    await writeCloudflareKvJson(MENU_SNAPSHOT_KV_KEY, {
      items: [],
      purgedAt: new Date().toISOString(),
    });
  } catch {
    // Ignore KV errors — local reset is already applied.
  }
}

const ALWAYS_ALLOW_PATHS = new Set(["/", "/#", "#"]);
const ALWAYS_ALLOW_PREFIXES = [
  "/admin",
  "/auth",
  "/api",
  "/inventory",
  "/assets",
  "/profile",
  "/avatar",
  "/me",
  "/setup",
];

/** Strip the WordPress domain so all menu links become internal paths. */
function toRelativePath(href) {
  if (!href || href === "#") return href;
  try {
    const parsed = new URL(href, "https://_");
    // If it's an absolute URL pointing to the WP site, keep only the path
    if (href.startsWith("http")) {
      const wpHost = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "")
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .toLowerCase();
      const siteHost = (site.url || "")
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .toLowerCase();
      const linkHost = (parsed.hostname || "").toLowerCase();
      if (!linkHost) return href.replace(/\/+$/, "") || "/";
      const bareLink = linkHost.replace(/^www\./, "");
      const bareWp = wpHost.replace(/^www\./, "");
      const bareSite = siteHost.replace(/^www\./, "");
      if (bareLink === bareWp || bareLink === bareSite) {
        return parsed.pathname.replace(/\/+$/, "") || "/";
      }
    }
  } catch {
    /* not a URL, treat as path */
  }
  return href.replace(/\/+$/, "") || "/";
}

function mapItem(node, { uppercase = false } = {}) {
  const rawHref = node.path || node.url || "#";
  const label = node.label || "";
  const rewritten =
    PATH_REWRITES[rawHref] ||
    PATH_REWRITES[rawHref.replace(/\/+$/, "")] ||
    rawHref;
  return {
    href: toRelativePath(rewritten),
    label: uppercase ? label.toUpperCase() : label,
  };
}

function normalizeSnapshotItems(items) {
  if (!Array.isArray(items)) return null;
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const href = typeof item.href === "string" ? item.href : "";
      const label = typeof item.label === "string" ? item.label : "";
      if (!href || !label) return null;
      const children = Array.isArray(item.children)
        ? item.children
            .map((child) => {
              if (!child || typeof child !== "object") return null;
              const childHref =
                typeof child.href === "string" ? child.href : "";
              const childLabel =
                typeof child.label === "string" ? child.label : "";
              if (!childHref || !childLabel) return null;
              return { href: childHref, label: childLabel };
            })
            .filter(Boolean)
        : [];
      return children.length > 0 ? { href, label, children } : { href, label };
    })
    .filter(Boolean);
}

async function getMenuSnapshot() {
  const now = Date.now();
  if (menuSnapshotCache.items && menuSnapshotCache.expiresAt > now) {
    return menuSnapshotCache.items;
  }
  if (menuSnapshotCache.pending) {
    return menuSnapshotCache.pending;
  }

  menuSnapshotCache.pending = (async () => {
    try {
      const payload = await readCloudflareKvJson(MENU_SNAPSHOT_KV_KEY);
      const items = normalizeSnapshotItems(payload?.items);
      if (items && items.length > 0) {
        menuSnapshotCache.items = items;
        menuSnapshotCache.expiresAt = Date.now() + MENU_SNAPSHOT_TTL_MS;
        return items;
      }
      return null;
    } catch {
      return null;
    } finally {
      menuSnapshotCache.pending = null;
    }
  })();
  return menuSnapshotCache.pending;
}

async function writeMenuSnapshot(items) {
  const normalized = normalizeSnapshotItems(items);
  if (!normalized || normalized.length === 0) return;
  menuSnapshotCache.items = normalized;
  menuSnapshotCache.expiresAt = Date.now() + MENU_SNAPSHOT_TTL_MS;
  try {
    await writeCloudflareKvJson(MENU_SNAPSHOT_KV_KEY, {
      items: normalized,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // KV persistence is best effort; in-memory snapshot still helps this isolate.
  }
}

function normalizeUriForLookup(uri) {
  const raw = typeof uri === "string" ? uri.trim() : "";
  if (!raw || raw === "/") return "/";
  const withoutQuery = raw.split("?")[0].split("#")[0];
  const ensuredLeading = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  const collapsed = ensuredLeading.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/+$/, "");
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isKnownFrontendRoute(path) {
  if (ALWAYS_ALLOW_PATHS.has(path)) return true;
  return ALWAYS_ALLOW_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function extractLocs(xml) {
  if (typeof xml !== "string" || !xml.includes("<loc>")) return [];
  const matches = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)];
  return matches.map((match) => match[1]?.trim()).filter(Boolean);
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function locToPath(loc) {
  const text = decodeXmlEntities(loc);
  if (!text) return "";
  try {
    const url = new URL(text);
    return normalizeUriForLookup(url.pathname);
  } catch {
    if (text.startsWith("/")) return normalizeUriForLookup(text);
    return "";
  }
}

async function fetchTextWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MENU_SITEMAP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/xml,text/xml,text/plain,*/*" },
      signal: controller.signal,
      cache: "force-cache",
      next: { revalidate: Math.floor(MENU_SITEMAP_TTL_MS / 1000) },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function extractPathsFromUrlset(xml) {
  const paths = new Set();
  const locs = extractLocs(xml);
  for (const loc of locs) {
    const path = locToPath(loc);
    if (path) paths.add(path);
  }
  return paths;
}

async function collectPathsFromRootCandidate(rootUrl) {
  const rootXml = await fetchTextWithTimeout(rootUrl);
  if (!rootXml) return null;

  const rootLocs = extractLocs(rootXml);
  if (rootLocs.length === 0) return null;
  const isIndex = /<sitemapindex[\s>]/i.test(rootXml);

  if (!isIndex) {
    const directPaths = extractPathsFromUrlset(rootXml);
    return directPaths.size > 0 ? directPaths : null;
  }

  const paths = new Set();
  const childSitemaps = rootLocs.slice(0, MENU_SITEMAP_MAX_FILES);
  for (const sitemapLoc of childSitemaps) {
    const childXml = await fetchTextWithTimeout(sitemapLoc);
    if (!childXml) continue;
    const childPaths = extractPathsFromUrlset(childXml);
    for (const path of childPaths) {
      paths.add(path);
    }
  }
  return paths.size > 0 ? paths : null;
}

async function loadSitemapPathSet() {
  const wordpressUrl = await resolveWordPressUrl();
  const base = String(wordpressUrl || site.url || "").replace(/\/+$/, "");
  if (!base) return null;

  const rootCandidates = [
    `${base}/sitemap_index.xml`,
    `${base}/wp-sitemap.xml`,
    `${base}/sitemap.xml`,
  ];
  let best = null;
  for (const candidate of rootCandidates) {
    const paths = await collectPathsFromRootCandidate(candidate);
    if (!paths || paths.size === 0) continue;
    if (!best || paths.size > best.size) best = paths;
  }
  return best;
}

async function getSitemapPathSet() {
  const now = Date.now();
  if (sitemapCache.paths && sitemapCache.expiresAt > now) {
    return sitemapCache.paths;
  }
  if (sitemapCache.pending) {
    return sitemapCache.pending;
  }
  sitemapCache.pending = loadSitemapPathSet()
    .then((paths) => {
      sitemapCache.paths = paths;
      sitemapCache.expiresAt = Date.now() + MENU_SITEMAP_TTL_MS;
      return paths;
    })
    .catch(() => null)
    .finally(() => {
      sitemapCache.pending = null;
    });
  return sitemapCache.pending;
}

async function doesWordPressUriExist(path) {
  const normalized = normalizeUriForLookup(path);
  if (normalized === "/") return true;

  const cached = menuUriExistenceCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.exists;
  }

  const sitemapPaths = await getSitemapPathSet();
  // Fail-open when sitemap cannot be read.
  const resolvedExists = sitemapPaths ? sitemapPaths.has(normalized) : true;
  menuUriExistenceCache.set(normalized, {
    exists: resolvedExists,
    expiresAt: Date.now() + MENU_URI_CHECK_TTL_MS,
  });
  return resolvedExists;
}

async function canRenderMenuHref(href) {
  const value = typeof href === "string" ? href.trim() : "";
  if (!value || value === "#" || value.startsWith("#")) return true;
  if (isHttpUrl(value)) return true;
  if (/^(mailto|tel|sms):/i.test(value)) return true;
  if (!value.startsWith("/")) return true;
  if (isKnownFrontendRoute(value)) return true;
  try {
    return await doesWordPressUriExist(value);
  } catch {
    // Never hide nav on transient network/runtime issues.
    return true;
  }
}

/**
 * Fetch the primary WordPress menu with submenus.
 * Falls back to site.json navigation if the menu is empty or the query fails.
 * Returns items with optional `children` arrays.
 */
export const getNavigation = cache(async function getNavigation() {
  const snapshot = await getMenuSnapshot();
  if (snapshot && snapshot.length > 0) {
    return ensureCoreMenuEntriesByExistence(snapshot, canRenderMenuHref);
  }

  try {
    const data = await fetchGraphQL(MENU_QUERY, {}, 1800, { edgeCache: true });
    const menuItems =
      data?.menus?.edges?.[0]?.node?.menuItems?.edges?.map((e) => e.node) || [];

    if (menuItems.length === 0) {
      const filtered = await filterNavigationByExistence(
        site.navigation,
        canRenderMenuHref,
      );
      const ensured = await ensureCoreMenuEntriesByExistence(
        filtered,
        canRenderMenuHref,
      );
      writeMenuSnapshot(ensured).catch(() => {});
      return ensured;
    }

    const mapped = menuItems.map((item) => {
      const children =
        item.childItems?.edges?.map((e) => mapItem(e.node)) || [];
      return {
        ...mapItem(item, { uppercase: true }),
        ...(children.length > 0 ? { children } : {}),
      };
    });
    const filtered = await filterNavigationByExistence(mapped, canRenderMenuHref);
    const ensured = await ensureCoreMenuEntriesByExistence(
      filtered,
      canRenderMenuHref,
    );
    writeMenuSnapshot(ensured).catch(() => {});
    return ensured;
  } catch {
    const filtered = await filterNavigationByExistence(
      site.navigation,
      canRenderMenuHref,
    );
    const ensured = await ensureCoreMenuEntriesByExistence(
      filtered,
      canRenderMenuHref,
    );
    writeMenuSnapshot(ensured).catch(() => {});
    return ensured;
  }
});
