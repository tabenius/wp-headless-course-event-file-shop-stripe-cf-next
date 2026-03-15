import { fetchGraphQL } from "@/lib/client";
import site from "@/lib/site";

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
  } catch { /* not a URL, treat as path */ }
  return href.replace(/\/+$/, "") || "/";
}

function mapItem(node, { uppercase = false } = {}) {
  const rawHref = node.path || node.url || "#";
  const label = node.label || "";
  const rewritten = PATH_REWRITES[rawHref] || PATH_REWRITES[rawHref.replace(/\/+$/, "")] || rawHref;
  return {
    href: toRelativePath(rewritten),
    label: uppercase ? label.toUpperCase() : label,
  };
}

/**
 * Fetch the primary WordPress menu with submenus.
 * Falls back to site.json navigation if the menu is empty or the query fails.
 * Returns items with optional `children` arrays.
 */
export async function getNavigation() {
  try {
    const data = await fetchGraphQL(MENU_QUERY, {}, 1800);
    const menuItems =
      data?.menus?.edges?.[0]?.node?.menuItems?.edges?.map((e) => e.node) || [];

    if (menuItems.length === 0) return site.navigation;

    return menuItems.map((item) => {
      const children =
        item.childItems?.edges?.map((e) => mapItem(e.node)) || [];
      return {
        ...mapItem(item, { uppercase: true }),
        ...(children.length > 0 ? { children } : {}),
      };
    });
  } catch {
    return site.navigation;
  }
}
