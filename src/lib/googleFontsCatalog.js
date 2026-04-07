import { readCloudflareKvJson, writeCloudflareKvJson } from "./cloudflareKv.js";

const CATALOG_KV_KEY = "fonts:catalog";
const CATALOG_TTL = 86400; // 24 hours

/**
 * Normalizes a Google Fonts API response OR the bundled snapshot into
 * the canonical { fonts: [{ family, category, axes, variants }] } shape.
 */
export function normalizeCatalog(raw) {
  if (!raw || typeof raw !== "object") return { fonts: [] };
  // Google Fonts API format: { items: [...] }
  const items = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.fonts)
      ? raw.fonts
      : [];
  return {
    fonts: items.map(({ family, category, axes, variants }) => ({
      family: String(family || ""),
      category: String(category || ""),
      axes: Array.isArray(axes) ? axes : [],
      variants: Array.isArray(variants) ? variants : [],
    })),
  };
}

/**
 * Returns true when the axes array contains a wght entry (variable font).
 */
export function isVariableFont(axes) {
  if (!Array.isArray(axes)) return false;
  return axes.some((a) => a?.tag === "wght");
}

/**
 * Returns the catalog from KV cache, or fetches fresh, or falls back
 * to the bundled snapshot. Always writes result to KV for 24h.
 */
export async function getFontsCatalog() {
  // Try KV cache first
  const cached = await readCloudflareKvJson(CATALOG_KV_KEY);
  if (cached?.fonts?.length > 0) return cached;

  let catalog;
  const apiKey = process.env.GOOGLE_FONTS_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        catalog = normalizeCatalog(await res.json());
      }
    } catch {
      // Fall through to snapshot
    }
  }

  if (!catalog || catalog.fonts.length === 0) {
    // Lazy load the snapshot to avoid bundling it unnecessarily in edge runtime
    const { default: snapshot } = await import("./googleFontsSnapshot.json", {
      with: { type: "json" },
    });
    catalog = normalizeCatalog(snapshot);
  }

  // Always cache (API or snapshot) so cold starts are fast
  await writeCloudflareKvJson(CATALOG_KV_KEY, catalog, {
    expirationTtl: CATALOG_TTL,
  });

  return catalog;
}
