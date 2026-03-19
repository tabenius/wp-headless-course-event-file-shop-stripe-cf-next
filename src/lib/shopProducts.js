import { fetchGraphQL } from "@/lib/client";
import { appendServerLog } from "@/lib/serverLog";
import { getCourseAccessState } from "@/lib/courseAccess";
import { listDigitalProducts } from "@/lib/digitalProducts";
import { ALL_TYPES, getShopSettings } from "@/lib/shopSettings";
import { stripHtml } from "@/lib/slugify";
import { decodeEntities } from "@/lib/decodeEntities";
import { parsePriceCents } from "@/lib/parsePrice";
import site from "@/lib/site";

/**
 * Fetch all purchasable items for the public shop:
 * WooCommerce products, LearnPress courses, Events, and digital products.
 *
 * Returns a unified array of { id, slug, name, description, imageUrl,
 *   price, priceCents, currency, type, uri, source }.
 * - WP items link to their content page (Paywall handles checkout).
 * - Digital products link to /shop/{slug} with in-page checkout.
 */

const defaultCurrency = site.defaultCurrency || "SEK";

async function fetchWooCommerceProducts() {
  try {
    const data = await fetchGraphQL(
      `{
        products(first: 100, where: { status: "publish" }) {
          edges {
            node {
              __typename
              ... on SimpleProduct {
                databaseId name slug uri price regularPrice
                shortDescription
                featuredImage { node { sourceUrl } }
              }
              ... on VariableProduct {
                databaseId name slug uri price regularPrice
                shortDescription
                featuredImage { node { sourceUrl } }
              }
              ... on ExternalProduct {
                databaseId name slug uri price regularPrice
                shortDescription
                featuredImage { node { sourceUrl } }
              }
            }
          }
        }
      }`,
      {},
      300,
    );
    return (data?.products?.edges || [])
      .map((e) => e.node)
      .filter((n) => n?.name);
  } catch (err) {
    appendServerLog({
      level: "error",
      msg: `fetchWooCommerceProducts failed: ${err?.message || err}`,
    }).catch(() => {});
    return [];
  }
}

async function fetchLearnPressCourses() {
  try {
    const data = await fetchGraphQL(
      `{ lpCourses(first: 100) { edges { node {
        databaseId uri title price priceRendered duration
        featuredImage { node { sourceUrl } }
      } } } }`,
      {},
      300,
    );
    return (data?.lpCourses?.edges || []).map((e) => e.node);
  } catch (err) {
    appendServerLog({
      level: "error",
      msg: `fetchLearnPressCourses failed: ${err?.message || err}`,
    }).catch(() => {});
    return [];
  }
}

async function fetchEvents() {
  try {
    const data = await fetchGraphQL(
      `{ events(first: 100) { edges { node {
        databaseId uri title slug
        featuredImage { node { sourceUrl } }
      } } } }`,
      {},
      300,
    );
    return (data?.events?.edges || []).map((e) => e.node);
  } catch (err) {
    appendServerLog({
      level: "error",
      msg: `fetchEvents failed: ${err?.message || err}`,
    }).catch(() => {});
    return [];
  }
}

/**
 * Fetch every purchasable item and return a flat, normalized array.
 * Only items with a price > 0 are included (free items are skipped).
 */
export async function listAllShopItems() {
  const [
    wcProducts,
    lpCourses,
    events,
    digitalProducts,
    accessState,
    shopSettings,
  ] = await Promise.all([
    fetchWooCommerceProducts(),
    fetchLearnPressCourses(),
    fetchEvents(),
    listDigitalProducts(),
    getCourseAccessState(),
    getShopSettings(),
  ]);

  const visibleTypes = Array.isArray(shopSettings?.visibleTypes)
    ? shopSettings.visibleTypes
    : ALL_TYPES;
  const hasAtLeastOneCoreType = ["product", "course", "event"].some((type) =>
    visibleTypes.includes(type),
  );
  // Guardrail: if all core source types are hidden, storefront appears broken
  // and only digital items remain visible. Fall back to all types.
  const safeVisibleTypes = hasAtLeastOneCoreType ? visibleTypes : ALL_TYPES;

  const courseConfigs = accessState?.courses || {};
  const items = [];

  // WooCommerce products
  for (const p of wcProducts) {
    const uri = p.uri?.replace(/\/+$/, "") || `/product/${p.slug}`;
    const config = courseConfigs[uri];
    items.push({
      id: `wc-${p.databaseId}`,
      slug: p.slug,
      name: decodeEntities(p.name),
      description: decodeEntities(stripHtml(p.shortDescription)),
      imageUrl: p.featuredImage?.node?.sourceUrl || "",
      price: decodeEntities(p.price || p.regularPrice || ""),
      priceCents:
        config?.priceCents || parsePriceCents(p.price || p.regularPrice),
      currency: config?.currency || defaultCurrency,
      type: "product",
      source: "woocommerce",
      uri,
      active: config?.active !== false,
    });
  }

  // LearnPress courses
  for (const c of lpCourses) {
    const uri = c.uri?.replace(/\/+$/, "") || "";
    if (!uri) continue;
    const config = courseConfigs[uri];
    items.push({
      id: `lp-${c.databaseId}`,
      slug: uri.replace(/^\//, ""),
      name: decodeEntities(c.title),
      description: "",
      imageUrl: c.featuredImage?.node?.sourceUrl || "",
      price: decodeEntities(c.priceRendered || c.price || ""),
      priceCents:
        config?.priceCents || parsePriceCents(c.priceRendered || c.price),
      currency: config?.currency || defaultCurrency,
      type: "course",
      source: "learnpress",
      uri,
      active: config?.active !== false,
      duration: c.duration || "",
    });
  }

  // Events (only those with a configured price)
  for (const e of events) {
    const uri = e.uri?.replace(/\/+$/, "") || "";
    if (!uri) continue;
    const config = courseConfigs[uri];
    if (!config || !config.priceCents) continue; // skip free / unconfigured events
    items.push({
      id: `ev-${e.databaseId}`,
      slug: e.slug || uri.replace(/^\//, ""),
      name: decodeEntities(e.title),
      description: "",
      imageUrl: e.featuredImage?.node?.sourceUrl || "",
      price: "",
      priceCents: config.priceCents,
      currency: config.currency || defaultCurrency,
      type: "event",
      source: "wordpress",
      uri,
      active: config?.active !== false,
    });
  }

  // Digital products (from admin / KV)
  for (const d of digitalProducts) {
    items.push({
      id: d.id,
      slug: d.slug,
      name: d.name,
      description: d.description || "",
      imageUrl: d.imageUrl || "",
      price: "",
      priceCents: d.priceCents || 0,
      currency: d.currency || defaultCurrency,
      type: d.type === "course" ? "digital_course" : "digital_file",
      source: "digital",
      uri: `/shop/${d.slug}`,
    });
  }

  // Filter by visible type.
  // Core WordPress-backed items (WooCommerce/LearnPress/Events) should still
  // be listable even if their parsed price is missing, otherwise the storefront
  // looks empty except for digital products.
  return items.filter(
    (item) => {
      if (!safeVisibleTypes.includes(item.type)) return false;
      if (item.active === false) return false;
      const hasPrice = item.priceCents > 0 || (item.price && item.price !== "0");
      if (item.source === "digital") return hasPrice;
      return true;
    },
  );
}
