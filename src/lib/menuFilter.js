export async function filterNavigationByExistence(items, resolver) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const canResolve = typeof resolver === "function" ? resolver : async () => true;

  const resolved = await Promise.all(
    items.map(async (item) => {
      if (!item || typeof item !== "object") return null;
      if (typeof item.href !== "string" || typeof item.label !== "string") {
        return null;
      }

      const rawChildren = Array.isArray(item.children) ? item.children : [];
      const children =
        rawChildren.length > 0
          ? await filterNavigationByExistence(rawChildren, canResolve)
          : [];
      const keepSelf = await canResolve(item.href);

      if (keepSelf) {
        return {
          ...item,
          ...(children.length > 0 ? { children } : {}),
        };
      }

      if (children.length > 0) {
        console.warn(
          `[menu] Parent link filtered as stale, keeping children under non-clickable group: ${item.href}`,
        );
        return {
          ...item,
          href: "#",
          children,
        };
      }

      console.warn(`[menu] Filtered stale internal link from nav: ${item.href}`);
      return null;
    }),
  );

  return resolved.filter(Boolean);
}

function normalizePath(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "/") return "/";
  const withoutQuery = raw.split("?")[0].split("#")[0];
  const withLeading = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const collapsed = withLeading.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/+$/, "");
}

export function ensureShopMenuEntry(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const hasShop = list.some(
    (item) =>
      item &&
      typeof item === "object" &&
      normalizePath(item.href) === "/shop",
  );
  if (hasShop) return list;
  return [...list, { href: "/shop", label: "Shop" }];
}
