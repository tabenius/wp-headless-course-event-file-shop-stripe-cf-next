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

function mapItem(node) {
  const rawHref = node.path || node.url || "#";
  return {
    href: PATH_REWRITES[rawHref] || rawHref,
    label: node.label || "",
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
        ...mapItem(item),
        ...(children.length > 0 ? { children } : {}),
      };
    });
  } catch {
    return site.navigation;
  }
}
