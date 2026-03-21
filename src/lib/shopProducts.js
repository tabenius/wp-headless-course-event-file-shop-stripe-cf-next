import { fetchGraphQL } from "@/lib/client";
import { appendServerLog } from "@/lib/serverLog";
import { getCourseAccessState } from "@/lib/courseAccess";
import { listDigitalProducts } from "@/lib/digitalProducts";
import { ALL_TYPES, getShopSettings } from "@/lib/shopSettings";
import { stripHtml } from "@/lib/slugify";
import { decodeEntities } from "@/lib/decodeEntities";
import { parsePriceCents } from "@/lib/parsePrice";
import {
  deriveCategories,
  deriveDigitalProductCategories,
} from "@/lib/contentCategories";
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
const graphqlFieldSupportCache = new Map();

async function hasGraphQLField(typeName, fieldName) {
  const cacheKey = `${typeName}:${fieldName}`;
  if (graphqlFieldSupportCache.has(cacheKey)) {
    return graphqlFieldSupportCache.get(cacheKey);
  }
  const data = await fetchGraphQL(
    `query IntrospectField($name: String!) {
      __type(name: $name) {
        fields { name }
      }
    }`,
    { name: typeName },
    1800,
  );
  const exists = (data?.__type?.fields || []).some(
    (field) => field?.name === fieldName,
  );
  graphqlFieldSupportCache.set(cacheKey, exists);
  return exists;
}

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
                productCategories { edges { node { name slug } } }
              }
              ... on VariableProduct {
                databaseId name slug uri price regularPrice
                shortDescription
                featuredImage { node { sourceUrl } }
                productCategories { edges { node { name slug } } }
              }
              ... on ExternalProduct {
                databaseId name slug uri price regularPrice
                shortDescription
                featuredImage { node { sourceUrl } }
                productCategories { edges { node { name slug } } }
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
    const hasCourseCategories = await hasGraphQLField(
      "LpCourse",
      "lpCourseCategory",
    );
    const categoryFragment = hasCourseCategories
      ? "lpCourseCategory { nodes { name slug } }"
      : "";
    const data = await fetchGraphQL(
      `{ lpCourses(first: 100) { edges { node {
        databaseId uri title price priceRendered duration
        featuredImage { node { sourceUrl } }
        ${categoryFragment}
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
    const hasEventCategories = await hasGraphQLField("Event", "eventCategories");
    const categoryFragment = hasEventCategories
      ? "eventCategories { nodes { name slug } }"
      : "";
    const data = await fetchGraphQL(
      `{ events(first: 100) { edges { node {
        databaseId uri title slug
        featuredImage { node { sourceUrl } }
        ${categoryFragment}
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
    const wcCategories = deriveCategories({
      explicit: p.productCategories,
      implied: ["Product", "WooCommerce"],
    });
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
      vatPercent:
        typeof config?.vatPercent === "number" && Number.isFinite(config.vatPercent)
          ? config.vatPercent
          : null,
      active: config?.active !== false,
      ...wcCategories,
    });
  }

  // LearnPress courses
  for (const c of lpCourses) {
    const uri = c.uri?.replace(/\/+$/, "") || "";
    if (!uri) continue;
    const config = courseConfigs[uri];
    const lpCategories = deriveCategories({
      explicit: c.lpCourseCategory,
      implied: ["Course", "LearnPress"],
    });
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
      vatPercent:
        typeof config?.vatPercent === "number" && Number.isFinite(config.vatPercent)
          ? config.vatPercent
          : null,
      active: config?.active !== false,
      duration: c.duration || "",
      ...lpCategories,
    });
  }

  // Events (only those with a configured price)
  for (const e of events) {
    const uri = e.uri?.replace(/\/+$/, "") || "";
    if (!uri) continue;
    const config = courseConfigs[uri];
    if (!config || !config.priceCents) continue; // skip free / unconfigured events
    const eventCategories = deriveCategories({
      explicit: e.eventCategories,
      implied: ["Event", "WordPress"],
    });
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
      vatPercent:
        typeof config?.vatPercent === "number" && Number.isFinite(config.vatPercent)
          ? config.vatPercent
          : null,
      active: config?.active !== false,
      ...eventCategories,
    });
  }

  // Digital products (from admin / KV)
  for (const d of digitalProducts) {
    const mode =
      d.productMode ||
      (d.type === "course" ? "manual_uri" : "digital_file");
    const normalizedType =
      mode === "manual_uri" ? "digital_course" : "digital_file";
    const buyableUri =
      mode === "asset" && d.assetId
        ? `/shop/${encodeURIComponent(d.assetId)}`
        : `/shop/${d.slug}`;
    const digitalCategories = deriveDigitalProductCategories({
      ...d,
      type: normalizedType,
    });
    items.push({
      id: d.id,
      slug: d.slug,
      name: d.name,
      description: d.description || "",
      imageUrl: d.imageUrl || "",
      price: "",
      priceCents: d.priceCents || 0,
      currency: d.currency || defaultCurrency,
      type: normalizedType,
      source: "digital",
      uri: buyableUri,
      productMode: mode,
      assetId: mode === "asset" ? d.assetId || "" : "",
      vatPercent:
        typeof d.vatPercent === "number" && Number.isFinite(d.vatPercent)
          ? d.vatPercent
          : null,
      ...digitalCategories,
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
