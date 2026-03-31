import { fetchGraphQL } from "@/lib/client";
import { appendServerLog } from "@/lib/serverLog";
import { getContentAccessState } from "@/lib/contentAccess";
import { listDigitalProducts } from "@/lib/digitalProducts";
import { getAssetRecord } from "@/lib/avatarFeedStore";
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
const SHOP_CORE_MODE_TTL_MS =
  Number.parseInt(process.env.SHOP_CORE_MODE_TTL_MS || "900000", 10) || 900000;
const SHOP_CATALOG_CACHE_TTL_MS =
  Number.parseInt(process.env.SHOP_CATALOG_CACHE_TTL_MS || "300000", 10) || 300000;
let shopCoreMode = {
  mode: "unknown",
  expiresAt: 0,
};
let shopCatalogCache = {
  items: null,
  expiresAt: 0,
};

export function resetShopProductsCaches() {
  shopCoreMode = {
    mode: "unknown",
    expiresAt: 0,
  };
  shopCatalogCache = {
    items: null,
    expiresAt: 0,
  };
}

function extractNodes(data, rootField) {
  return data?.[rootField]?.edges?.map((edge) => edge?.node).filter(Boolean) || [];
}

function normalizeAssetVariant(entry) {
  if (!entry || typeof entry !== "object") return null;
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  if (!url) return null;
  const width = Number.parseInt(String(entry.width ?? ""), 10);
  const height = Number.parseInt(String(entry.height ?? ""), 10);
  return {
    url,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    mimeType: typeof entry.mimeType === "string" ? entry.mimeType : "",
    variantKind: typeof entry.variantKind === "string" ? entry.variantKind : "",
  };
}

function normalizeAssetVariants(record) {
  if (!record || typeof record !== "object") return [];
  const variants = [];
  const seen = new Set();
  const rows = [
    record.source,
    ...(Array.isArray(record.variants) ? record.variants : []),
  ];
  for (const row of rows) {
    const safe = normalizeAssetVariant(row);
    if (!safe) continue;
    if (seen.has(safe.url)) continue;
    seen.add(safe.url);
    variants.push(safe);
  }
  return variants;
}

function pickPreferredVariant(variants, fallbackUrl) {
  if (!Array.isArray(variants) || variants.length === 0) return fallbackUrl || "";
  const rank = {
    "responsive-md": 0,
    compressed: 1,
    "derived-work": 2,
    "responsive-lg": 3,
    "responsive-sm": 4,
    original: 5,
  };
  const scored = variants
    .map((variant) => {
      const key = String(variant.variantKind || "").toLowerCase();
      const weight = Number.isFinite(rank[key]) ? rank[key] : 30;
      const widthPenalty =
        Number.isFinite(variant.width) && variant.width > 0
          ? Math.abs(variant.width - 1280) / 10000
          : 5;
      return { variant, score: weight + widthPenalty };
    })
    .sort((left, right) => left.score - right.score);
  return scored[0]?.variant?.url || fallbackUrl || "";
}

function buildImageSourcesFromAsset(record, fallbackUrl = "") {
  const variants = normalizeAssetVariants(record);
  if (variants.length === 0) {
    if (!fallbackUrl) return null;
    return {
      src: fallbackUrl,
      width: null,
      height: null,
      variants: [],
      sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
    };
  }
  const src = pickPreferredVariant(variants, fallbackUrl);
  const source = variants.find((variant) => variant.url === src) || variants[0];
  return {
    src,
    width: source?.width || null,
    height: source?.height || null,
    variants: variants
      .filter((variant) => Number.isFinite(variant.width) && variant.width > 0)
      .sort((left, right) => left.width - right.width),
    sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
  };
}

function cloneItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    categories: Array.isArray(item.categories) ? [...item.categories] : [],
    categorySlugs: Array.isArray(item.categorySlugs) ? [...item.categorySlugs] : [],
    imageSources: item.imageSources
      ? {
          ...item.imageSources,
          variants: Array.isArray(item.imageSources.variants)
            ? item.imageSources.variants.map((variant) => ({ ...variant }))
            : [],
        }
      : null,
  }));
}

const SHOP_CORE_COMBINED_QUERY = `
  query ShopCoreDataCombined {
    products(first: 100, where: { status: "publish" }) {
      edges {
        node {
          __typename
          ... on SimpleProduct {
            databaseId
            name
            slug
            uri
            price
            regularPrice
            shortDescription
            featuredImage { node { sourceUrl } }
            productCategories { edges { node { name slug } } }
          }
          ... on VariableProduct {
            databaseId
            name
            slug
            uri
            price
            regularPrice
            shortDescription
            featuredImage { node { sourceUrl } }
            productCategories { edges { node { name slug } } }
          }
          ... on ExternalProduct {
            databaseId
            name
            slug
            uri
            price
            regularPrice
            shortDescription
            featuredImage { node { sourceUrl } }
            productCategories { edges { node { name slug } } }
          }
        }
      }
    }
    lpCourses(first: 100) {
      edges {
        node {
          databaseId
          uri
          title
          price
          priceRendered
          duration
          featuredImage { node { sourceUrl } }
          lpCourseCategory { nodes { name slug } }
        }
      }
    }
    events(first: 100) {
      edges {
        node {
          databaseId
          uri
          title
          slug
          featuredImage { node { sourceUrl } }
          eventCategories { nodes { name slug } }
        }
      }
    }
  }
`;

const SHOP_PRODUCTS_ONLY_QUERY = `
  query ShopProductsOnly {
    products(first: 100, where: { status: "publish" }) {
      edges {
        node {
          __typename
          ... on SimpleProduct {
            databaseId
            name
            slug
            uri
            price
            regularPrice
            shortDescription
            featuredImage { node { sourceUrl } }
            productCategories { edges { node { name slug } } }
          }
          ... on VariableProduct {
            databaseId
            name
            slug
            uri
            price
            regularPrice
            shortDescription
            featuredImage { node { sourceUrl } }
            productCategories { edges { node { name slug } } }
          }
          ... on ExternalProduct {
            databaseId
            name
            slug
            uri
            price
            regularPrice
            shortDescription
            featuredImage { node { sourceUrl } }
            productCategories { edges { node { name slug } } }
          }
        }
      }
    }
  }
`;

const SHOP_COURSES_ONLY_QUERY = `
  query ShopCoursesOnly {
    lpCourses(first: 100) {
      edges {
        node {
          databaseId
          uri
          title
          price
          priceRendered
          duration
          featuredImage { node { sourceUrl } }
        }
      }
    }
  }
`;

const SHOP_EVENTS_ONLY_QUERY = `
  query ShopEventsOnly {
    events(first: 100) {
      edges {
        node {
          databaseId
          uri
          title
          slug
          featuredImage { node { sourceUrl } }
        }
      }
    }
  }
`;

async function fetchShopCoreGraphDataCombined() {
  const data = await fetchGraphQL(SHOP_CORE_COMBINED_QUERY, {}, 300, {
    edgeCache: true,
  });
  return {
    wcProducts: extractNodes(data, "products").filter((node) => node?.name),
    lpCourses: extractNodes(data, "lpCourses"),
    events: extractNodes(data, "events"),
  };
}

async function fetchShopCoreGraphDataLegacy() {
  const [productsData, coursesData, eventsData] = await Promise.all([
    fetchGraphQL(SHOP_PRODUCTS_ONLY_QUERY, {}, 300, { edgeCache: true }).catch(
      () => ({}),
    ),
    fetchGraphQL(SHOP_COURSES_ONLY_QUERY, {}, 300, { edgeCache: true }).catch(
      () => ({}),
    ),
    fetchGraphQL(SHOP_EVENTS_ONLY_QUERY, {}, 300, { edgeCache: true }).catch(
      () => ({}),
    ),
  ]);
  return {
    wcProducts: extractNodes(productsData, "products").filter((node) => node?.name),
    lpCourses: extractNodes(coursesData, "lpCourses"),
    events: extractNodes(eventsData, "events"),
  };
}

async function fetchShopCoreGraphData() {
  const now = Date.now();
  const mode = shopCoreMode.expiresAt > now ? shopCoreMode.mode : "unknown";

  if (mode !== "legacy") {
    try {
      const combined = await fetchShopCoreGraphDataCombined();
      shopCoreMode = {
        mode: "combined",
        expiresAt: Date.now() + SHOP_CORE_MODE_TTL_MS,
      };
      return combined;
    } catch (err) {
      appendServerLog({
        level: "warn",
        msg: `Shop combined query failed, falling back to legacy split queries: ${err?.message || err}`,
        persist: false,
      }).catch(() => {});
      shopCoreMode = {
        mode: "legacy",
        expiresAt: Date.now() + SHOP_CORE_MODE_TTL_MS,
      };
    }
  }

  return fetchShopCoreGraphDataLegacy().catch((err) => {
    appendServerLog({
      level: "error",
      msg: `Shop legacy queries failed: ${err?.message || err}`,
      persist: false,
    }).catch(() => {});
    return {
      wcProducts: [],
      lpCourses: [],
      events: [],
    };
  });
}

/**
 * Fetch every purchasable item and return a flat, normalized array.
 * Only items with a price > 0 are included (free items are skipped).
 */
export async function listAllShopItems({ bypassCache = false } = {}) {
  const now = Date.now();
  if (
    !bypassCache &&
    shopCatalogCache.items &&
    shopCatalogCache.expiresAt > now
  ) {
    return cloneItems(shopCatalogCache.items);
  }

  const { wcProducts, lpCourses, events } = await fetchShopCoreGraphData();
  const [
    digitalProducts,
    accessState,
    shopSettings,
  ] = await Promise.all([
    listDigitalProducts(),
    getContentAccessState(),
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
  const filtered = items.filter(
    (item) => {
      if (!safeVisibleTypes.includes(item.type)) return false;
      if (item.active === false) return false;
      const hasPrice = item.priceCents > 0 || (item.price && item.price !== "0");
      if (item.source === "digital") return hasPrice;
      return true;
    },
  );

  const assetIds = [
    ...new Set(
      filtered
        .filter(
          (item) =>
            item?.source === "digital" &&
            item?.productMode === "asset" &&
            typeof item?.assetId === "string" &&
            item.assetId.trim(),
        )
        .map((item) => item.assetId.trim().toLowerCase()),
    ),
  ];
  let assetRecordsById = new Map();
  if (assetIds.length > 0) {
    const resolved = await Promise.all(
      assetIds.map(async (assetId) => [assetId, await getAssetRecord(assetId)]),
    );
    assetRecordsById = new Map(resolved);
  }

  const enriched = filtered.map((item) => {
    if (item.source !== "digital" || item.productMode !== "asset" || !item.assetId) {
      return item;
    }
    const record = assetRecordsById.get(String(item.assetId).toLowerCase()) || null;
    const imageSources = buildImageSourcesFromAsset(record, item.imageUrl);
    const imageUrl = imageSources?.src || item.imageUrl || "";
    return {
      ...item,
      imageUrl,
      imageSources,
    };
  });

  shopCatalogCache = {
    items: cloneItems(enriched),
    expiresAt: now + SHOP_CATALOG_CACHE_TTL_MS,
  };
  return cloneItems(enriched);
}
