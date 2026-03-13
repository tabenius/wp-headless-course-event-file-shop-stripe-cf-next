import { fetchGraphQL } from "@/lib/client";
import site from "@/lib/site";

const MENU_QUERY = `
  query GetPrimaryMenu {
    menus(where: { location: PRIMARY }) {
      edges {
        node {
          menuItems(first: 100) {
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
`;

/**
 * Fetch the primary WordPress menu. Falls back to site.json navigation
 * if the menu is empty or the query fails.
 */
export async function getNavigation() {
  try {
    const data = await fetchGraphQL(MENU_QUERY, {}, 1800);
    const menuItems =
      data?.menus?.edges?.[0]?.node?.menuItems?.edges?.map((e) => e.node) || [];

    if (menuItems.length === 0) return site.navigation;

    return menuItems.map((item) => ({
      href: item.path || item.url || "#",
      label: item.label || "",
    }));
  } catch {
    return site.navigation;
  }
}
