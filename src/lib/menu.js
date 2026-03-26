import { fetchGraphQL } from "@/lib/client";
import site from "@/lib/site";
import { resolveWordPressUrl } from "@/lib/wordpressUrl";
import { ensureShopMenuEntry, filterNavigationByExistence } from "@/lib/menuFilter";
import { cache } from "react";

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
let sitemapCache = {
  expiresAt: 0,
  paths: null,
  pending: null,
};

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

async function loadSitemapPathSet() {
  const wordpressUrl = await resolveWordPressUrl();
  const base = String(wordpressUrl || site.url || "").replace(/\/+$/, "");
  if (!base) return null;

  const rootCandidates = [`${base}/sitemap.xml`, `${base}/wp-sitemap.xml`];
  let rootXml = "";
  for (const candidate of rootCandidates) {
    rootXml = await fetchTextWithTimeout(candidate);
    if (rootXml) break;
  }
  if (!rootXml) return null;

  const paths = new Set();
  const rootLocs = extractLocs(rootXml);
  const isIndex = /<sitemapindex[\s>]/i.test(rootXml);

  if (!isIndex) {
    for (const loc of rootLocs) {
      const path = locToPath(loc);
      if (path) paths.add(path);
    }
    return paths;
  }

  const childSitemaps = rootLocs.slice(0, MENU_SITEMAP_MAX_FILES);
  for (const sitemapLoc of childSitemaps) {
    const xml = await fetchTextWithTimeout(sitemapLoc);
    if (!xml) continue;
    const locs = extractLocs(xml);
    for (const loc of locs) {
      const path = locToPath(loc);
      if (path) paths.add(path);
    }
  }

  return paths;
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
  try {
    const data = await fetchGraphQL(MENU_QUERY, {}, 1800);
    const menuItems =
      data?.menus?.edges?.[0]?.node?.menuItems?.edges?.map((e) => e.node) || [];

    if (menuItems.length === 0) {
      const filtered = await filterNavigationByExistence(
        site.navigation,
        canRenderMenuHref,
      );
      return ensureShopMenuEntry(filtered);
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
    return ensureShopMenuEntry(filtered);
  } catch {
    const filtered = await filterNavigationByExistence(
      site.navigation,
      canRenderMenuHref,
    );
    return ensureShopMenuEntry(filtered);
  }
});
