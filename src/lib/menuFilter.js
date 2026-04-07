export async function filterNavigationByExistence(items, resolver) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const canResolve =
    typeof resolver === "function" ? resolver : async () => true;

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

      console.warn(
        `[menu] Filtered stale internal link from nav: ${item.href}`,
      );
      return null;
    }),
  );

  return resolved.filter(Boolean);
}

function normalizePath(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "/") return "/";
  const withoutQuery = raw.split("?")[0].split("#")[0];
  const withLeading = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  const collapsed = withLeading.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/+$/, "");
}

const CORE_MENU_FALLBACKS = [
  { href: "/blog", label: "BLOG" },
  { href: "/events", label: "EVENTS" },
  { href: "/courses", label: "COURSES" },
  { href: "/shop", label: "SHOP" },
];

export function ensureCoreMenuEntries(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const seen = new Set(
    list
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizePath(item.href)),
  );
  const appended = CORE_MENU_FALLBACKS.filter(
    (entry) => !seen.has(normalizePath(entry.href)),
  );
  return [...list, ...appended];
}

export async function ensureCoreMenuEntriesByExistence(items, resolver) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const canResolve =
    typeof resolver === "function" ? resolver : async () => true;
  const seen = new Set(
    list
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizePath(item.href)),
  );
  const missingCore = CORE_MENU_FALLBACKS.filter(
    (entry) => !seen.has(normalizePath(entry.href)),
  );
  if (missingCore.length === 0) return list;

  const checks = await Promise.all(
    missingCore.map(async (entry) => {
      try {
        const keep = await canResolve(entry.href);
        return keep ? entry : null;
      } catch {
        // Fail-open to avoid unexpectedly stripping core storefront routes.
        return entry;
      }
    }),
  );
  return [...list, ...checks.filter(Boolean)];
}
