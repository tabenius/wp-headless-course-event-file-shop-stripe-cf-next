import { fetchGraphQL } from "@/lib/client";
import site from "@/lib/site";
import { filterNavigationByExistence } from "@/lib/menuFilter";
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

const MENU_NODE_EXISTS_QUERY = `
  query MenuNodeExists($uri: String!) {
    nodeByUri(uri: $uri) {
      __typename
      ... on ContentNode {
        id
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

function buildUriLookupAttempts(uri) {
  const normalized = normalizeUriForLookup(uri);
  if (normalized === "/") return ["/"];
  return [normalized, `${normalized}/`];
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

async function doesWordPressUriExist(path) {
  const normalized = normalizeUriForLookup(path);
  if (normalized === "/") return true;

  const cached = menuUriExistenceCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.exists;
  }

  const attempts = buildUriLookupAttempts(normalized);
  let gotDefinitiveNodeByUriResponse = false;
  let exists = false;

  for (const candidateUri of attempts) {
    const data = await fetchGraphQL(MENU_NODE_EXISTS_QUERY, { uri: candidateUri }, 300);
    if (!data || typeof data !== "object") continue;
    if (!Object.prototype.hasOwnProperty.call(data, "nodeByUri")) continue;
    gotDefinitiveNodeByUriResponse = true;
    if (data.nodeByUri) {
      exists = true;
      break;
    }
  }

  // Fail-open when upstream couldn't confirm nodeByUri shape (rate limit/outage).
  const resolvedExists = gotDefinitiveNodeByUriResponse ? exists : true;
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
      return await filterNavigationByExistence(site.navigation, canRenderMenuHref);
    }

    const mapped = menuItems.map((item) => {
      const children =
        item.childItems?.edges?.map((e) => mapItem(e.node)) || [];
      return {
        ...mapItem(item, { uppercase: true }),
        ...(children.length > 0 ? { children } : {}),
      };
    });
    return await filterNavigationByExistence(mapped, canRenderMenuHref);
  } catch {
    return await filterNavigationByExistence(site.navigation, canRenderMenuHref);
  }
});
