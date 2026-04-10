import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { deriveDigitalProductCategories } from "@/lib/contentCategories";
import { slugify } from "@/lib/slugify";
import { getD1Database } from "@/lib/d1Bindings";

const log = (...args) => {
  // Console output is streamed by wrangler tail in production.
  console.error("[/lib/digitalProducts.js]", ...args);
};

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

const BUYABLE_KIND_SET = new Set([
  "download",
  "asset",
  "course",
  "event",
  "workshop",
  "service",
]);
const PRODUCT_LANGUAGE_SET = new Set(["sv", "en", "es"]);

function normalizeBuyableKind(kind, productMode, type) {
  const safe = typeof kind === "string" ? kind.trim().toLowerCase() : "";
  if (BUYABLE_KIND_SET.has(safe)) return safe;
  if (productMode === "asset") return "asset";
  if (productMode === "manual_uri" || type === "course") return "course";
  return "download";
}

function normalizeScheduleValue(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  if (raw.length > 40) return "";
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(raw)) {
    return raw.replace(" ", "T");
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return "";
  return raw;
}

function normalizeShortText(value, maxLength = 160) {
  const safe = typeof value === "string" ? value.trim() : "";
  if (!safe) return "";
  return safe.slice(0, maxLength);
}

function normalizeScheduleTimezone(value) {
  return normalizeShortText(value, 64);
}

function normalizeExternalBookingLabel(value) {
  return normalizeShortText(value, 48);
}

function normalizeBuyableNoun(value) {
  return normalizeShortText(value, 40).toLowerCase();
}

function normalizeExternalBookingUrl(value) {
  const safe = typeof value === "string" ? value.trim() : "";
  if (!safe) return "";
  if (!isValidHttpUrl(safe)) return "";
  return safe;
}

function normalizeProductLanguage(value) {
  const safe = typeof value === "string" ? value.trim().toLowerCase() : "";
  return PRODUCT_LANGUAGE_SET.has(safe) ? safe : "sv";
}

function productRowToObject(row) {
  if (!row) return null;
  let extra = {};
  try {
    extra = JSON.parse(row.categories || "{}");
  } catch {
    /* ignore */
  }
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    title: row.title || row.name,
    description: row.description,
    imageUrl: row.image_url,
    type: row.type,
    productMode: row.product_mode,
    priceCents: row.price_cents,
    free: row.free === 1,
    currency: row.currency,
    fileUrl: row.file_url,
    contentUri: row.content_uri,
    mimeType: row.mime_type,
    assetId: row.asset_id,
    vatPercent: row.vat_percent,
    active: row.active === 1,
    buyableKind: normalizeBuyableKind(
      extra.buyableKind,
      row.product_mode,
      row.type,
    ),
    buyableNoun: normalizeBuyableNoun(extra.buyableNoun),
    scheduleStart: normalizeScheduleValue(extra.scheduleStart),
    scheduleEnd: normalizeScheduleValue(extra.scheduleEnd),
    scheduleTimezone: normalizeScheduleTimezone(extra.scheduleTimezone),
    venueName: normalizeShortText(extra.venueName, 120),
    venueAddress: normalizeShortText(extra.venueAddress, 240),
    externalBookingEnabled: extra.externalBookingEnabled === true,
    externalBookingUrl: normalizeExternalBookingUrl(extra.externalBookingUrl),
    externalBookingLabel: normalizeExternalBookingLabel(
      extra.externalBookingLabel,
    ),
    language: normalizeProductLanguage(extra.language),
    updatedAt: row.updated_at,
    categories: Array.isArray(extra.categories) ? extra.categories : [],
    categorySlugs: Array.isArray(extra.categorySlugs)
      ? extra.categorySlugs
      : [],
  };
}

function productObjectToRow(p) {
  const {
    id,
    slug,
    name,
    title,
    description,
    imageUrl,
    type,
    productMode,
    priceCents,
    free,
    currency,
    fileUrl,
    contentUri,
    mimeType,
    assetId,
    vatPercent,
    active,
    updatedAt,
    ...rest
  } = p;
  const cats = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) cats[k] = v;
  }
  return {
    slug,
    name,
    title: title || name,
    description: description || "",
    image_url: imageUrl || "",
    type: type || "digital_file",
    product_mode: productMode || "digital_file",
    price_cents: priceCents || 0,
    currency: currency || "SEK",
    free: free ? 1 : 0,
    active: active !== false ? 1 : 0,
    file_url: fileUrl || "",
    content_uri: contentUri || "",
    mime_type: mimeType || "",
    asset_id: assetId || "",
    vat_percent: vatPercent ?? null,
    categories: JSON.stringify(cats),
    updated_at: updatedAt || new Date().toISOString(),
  };
}

export const PRODUCT_EXAMPLE_FILE = "config/digital-products.example.json";

function getProductsKvKey() {
  return process.env.CF_PRODUCTS_KV_KEY || "digital-products";
}
let inMemoryProducts = null;

function normalizeCurrency(currency) {
  return typeof currency === "string" && currency.trim()
    ? currency.trim().toUpperCase()
    : "SEK";
}

function normalizeType(type) {
  const safe = typeof type === "string" ? type.trim().toLowerCase() : "";
  return safe === "course" ? "course" : "digital_file";
}

function normalizeProductMode(mode, type, assetId) {
  const safe = typeof mode === "string" ? mode.trim().toLowerCase() : "";
  if (safe === "asset") return "asset";
  if (safe === "manual_uri" || safe === "course") return "manual_uri";
  if (safe === "digital_file" || safe === "file") return "digital_file";
  if (type === "course") return "manual_uri";
  if (assetId) return "asset";
  return "digital_file";
}

function normalizeMimeType(mimeType) {
  return typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
}

function normalizeVatPercent(vatPercent) {
  if (vatPercent === "" || vatPercent === null || vatPercent === undefined) {
    return null;
  }
  const parsed =
    typeof vatPercent === "number"
      ? vatPercent
      : Number.parseFloat(String(vatPercent).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizeContentUri(contentUri) {
  if (typeof contentUri !== "string") return "";
  const trimmed = contentUri.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeAssetId(assetId) {
  const safe = typeof assetId === "string" ? assetId.trim().toLowerCase() : "";
  if (!safe) return "";
  return safe.replace(/[^a-z0-9._:-]/g, "");
}

function isValidHttpUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeMimeForCompare(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isImageMime(mimeType) {
  return normalizeMimeForCompare(mimeType).startsWith("image/");
}

function inferMimeFromUrl(url) {
  if (!isValidHttpUrl(url)) return "";
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".mp4") || pathname.endsWith(".m4v"))
      return "video/mp4";
    if (pathname.endsWith(".mov")) return "video/quicktime";
    if (pathname.endsWith(".webm")) return "video/webm";
    if (pathname.endsWith(".mp3")) return "audio/mpeg";
    if (pathname.endsWith(".wav")) return "audio/wav";
    if (pathname.endsWith(".m4a")) return "audio/mp4";
    if (pathname.endsWith(".flac")) return "audio/flac";
    if (pathname.endsWith(".ogg")) return "audio/ogg";
    if (pathname.endsWith(".pdf")) return "application/pdf";
    if (pathname.endsWith(".zip")) return "application/zip";
    if (pathname.endsWith(".json")) return "application/json";
    if (pathname.endsWith(".csv")) return "text/csv";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg"))
      return "image/jpeg";
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".gif")) return "image/gif";
  } catch {
    return "";
  }
  return "";
}

function looksLikeStorageAssetId(value) {
  const safe = typeof value === "string" ? value.trim().toLowerCase() : "";
  return safe.startsWith("r2:") || safe.startsWith("s3:");
}

function pushCandidateUrl(target, url, mimeType) {
  const safeUrl = typeof url === "string" ? url.trim() : "";
  if (!isValidHttpUrl(safeUrl)) return;
  target.push({
    url: safeUrl,
    mimeType: normalizeMimeForCompare(mimeType),
    inferredMimeType: inferMimeFromUrl(safeUrl),
  });
}

function pickBestDownloadCandidate(candidates, preferredMimeType) {
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const preferred = normalizeMimeForCompare(preferredMimeType);
  const dedupe = new Set();
  const ranked = [];

  for (const candidate of candidates) {
    const safeUrl =
      candidate && typeof candidate.url === "string" ? candidate.url.trim() : "";
    if (!safeUrl || dedupe.has(safeUrl)) continue;
    dedupe.add(safeUrl);

    const mime = normalizeMimeForCompare(candidate.mimeType);
    const inferred = normalizeMimeForCompare(candidate.inferredMimeType);
    const candidateMime = mime || inferred;
    const candidateMajor = candidateMime.split("/")[0];
    const preferredMajor = preferred.split("/")[0];

    let score = 0;
    if (mime) score += 2;
    if (inferred) score += 1;

    if (preferred) {
      if (candidateMime === preferred) {
        score += 120;
      } else if (candidateMajor && preferredMajor && candidateMajor === preferredMajor) {
        score += 40;
      }
      if (!isImageMime(preferred) && isImageMime(candidateMime)) {
        score -= 90;
      }
    }

    if (!isImageMime(candidateMime)) {
      score += 8;
    }

    ranked.push({ url: safeUrl, score });
  }

  ranked.sort((left, right) => right.score - left.score);
  return ranked[0]?.url || "";
}

function sanitizeProduct(product, seenSlugs) {
  const nameSource =
    typeof product?.name === "string"
      ? product.name
      : typeof product?.title === "string"
        ? product.title
        : "";

  const name = String(nameSource || "").trim();
  const slugInput =
    typeof product?.slug === "string"
      ? product.slug
      : typeof product?.id === "string"
        ? product.id
        : "";
  let slug = slugify(slugInput || name);

  if (!name || !slug) return null;

  if (seenSlugs.has(slug)) {
    let index = 2;
    while (seenSlugs.has(`${slug}-${index}`)) index += 1;
    slug = `${slug}-${index}`;
  }
  seenSlugs.add(slug);

  const description =
    typeof product?.description === "string" ? product.description.trim() : "";
  const imageUrl =
    typeof product?.imageUrl === "string" ? product.imageUrl.trim() : "";
  const type = normalizeType(product?.type);
  const assetId = normalizeAssetId(product?.assetId || "");
  const productMode = normalizeProductMode(product?.productMode, type, assetId);
  const rawPrice = product?.priceCents;
  const priceCents =
    typeof rawPrice === "number" && Number.isFinite(rawPrice)
      ? Math.max(0, Math.floor(rawPrice))
      : Math.max(0, Number.parseInt(String(rawPrice || "0"), 10) || 0);
  const free = product?.free === true;
  const effectivePriceCents = free ? 0 : priceCents;

  const fileUrl =
    typeof product?.fileUrl === "string" ? product.fileUrl.trim() : "";
  const contentUri = normalizeContentUri(product?.contentUri);
  const mimeType = normalizeMimeType(product?.mimeType || product?.contentType);
  const vatPercent = normalizeVatPercent(product?.vatPercent);
  const active = product?.active !== false;
  const buyableKind = normalizeBuyableKind(
    product?.buyableKind,
    productMode,
    type,
  );
  const buyableNoun = normalizeBuyableNoun(product?.buyableNoun);
  const scheduleStart = normalizeScheduleValue(product?.scheduleStart);
  const scheduleEnd = normalizeScheduleValue(product?.scheduleEnd);
  const scheduleTimezone = normalizeScheduleTimezone(product?.scheduleTimezone);
  const venueName = normalizeShortText(product?.venueName, 120);
  const venueAddress = normalizeShortText(product?.venueAddress, 240);
  const externalBookingEnabled = product?.externalBookingEnabled === true;
  const externalBookingUrl = normalizeExternalBookingUrl(
    product?.externalBookingUrl,
  );
  const externalBookingLabel = normalizeExternalBookingLabel(
    product?.externalBookingLabel,
  );
  const language = normalizeProductLanguage(product?.language);
  const hasExternalBooking = externalBookingEnabled && !!externalBookingUrl;

  if (imageUrl && !isValidHttpUrl(imageUrl)) return null;
  if (externalBookingEnabled && !externalBookingUrl) return null;
  // Incomplete delivery fields are only hard errors for active products (drafts may be saved without them)
  if (
    active &&
    !hasExternalBooking &&
    productMode === "digital_file" &&
    !isValidHttpUrl(fileUrl)
  )
    return null;
  if (active && !hasExternalBooking && productMode === "manual_uri" && !contentUri)
    return null;
  if (!hasExternalBooking && productMode === "asset" && !assetId) return null;

  const normalizedType =
    productMode === "manual_uri" ? "digital_course" : "digital_file";
  const categories = deriveDigitalProductCategories({
    ...product,
    type: normalizedType,
    fileUrl,
    mimeType,
  });

  return {
    id: slug,
    slug,
    name,
    title: name,
    description,
    imageUrl,
    type: productMode === "manual_uri" ? "course" : "digital_file",
    productMode,
    priceCents: effectivePriceCents,
    free,
    currency: normalizeCurrency(product?.currency),
    fileUrl:
      productMode === "digital_file" || productMode === "asset" ? fileUrl : "",
    contentUri: productMode === "manual_uri" ? contentUri : "",
    mimeType:
      productMode === "digital_file" || productMode === "asset" ? mimeType : "",
    assetId: productMode === "asset" ? assetId : "",
    vatPercent,
    active,
    buyableKind,
    buyableNoun,
    scheduleStart,
    scheduleEnd,
    scheduleTimezone,
    venueName,
    venueAddress,
    externalBookingEnabled,
    externalBookingUrl,
    externalBookingLabel,
    language,
    updatedAt: new Date().toISOString(),
    categories: categories.categories || [],
    categorySlugs: categories.categorySlugs || [],
  };
}

function sanitizeProducts(input) {
  const seenSlugs = new Set();
  const output = [];
  for (const item of Array.isArray(input) ? input : []) {
    const safe = sanitizeProduct(item, seenSlugs);
    if (safe) output.push(safe);
  }
  return output;
}

async function readFromCloudflare() {
  const data = await readCloudflareKvJson(getProductsKvKey());
  if (!data) return null;
  return Array.isArray(data) ? data : [];
}

async function writeToCloudflare(products) {
  return writeCloudflareKvJson(getProductsKvKey(), products);
}

async function readFromBundled() {
  // Build-time bundled JSON — seed source for KV when no products exist yet
  try {
    const data = (await import("../../config/digital-products.json")).default;
    return Array.isArray(data) ? data : [];
  } catch {
    return inMemoryProducts || [];
  }
}

async function readProducts() {
  try {
    const cloudflareProducts = await readFromCloudflare();
    if (cloudflareProducts !== null) return cloudflareProducts;
    // KV key doesn't exist yet — seed from bundled defaults
    const seed = await readFromBundled();
    if (seed.length > 0) {
      await writeToCloudflare(seed).catch(() => {});
    }
    return seed;
  } catch (error) {
    console.error(
      "Cloudflare KV products read failed, falling back to bundled:",
      error,
    );
    return readFromBundled();
  }
}

async function writeProducts(products) {
  try {
    const wrote = await writeToCloudflare(products);
    if (wrote) return;
    throw new Error("writeToCloudflare returned falsy");
  } catch (error) {
    console.error("Cloudflare KV products write failed:", error);
    // In-memory fallback so the current request cycle sees the update
    inMemoryProducts = products;
  }
}

export async function listDigitalProducts({ includeInactive = false } = {}) {
  try {
    const db = await tryGetD1();
    if (db) {
      const query = includeInactive
        ? "SELECT * FROM products ORDER BY updated_at DESC"
        : "SELECT * FROM products WHERE active = 1 ORDER BY updated_at DESC";
      const { results } = await db.prepare(query).all();
      return (results || []).map(productRowToObject).filter(Boolean);
    }

    // existing KV path below (unchanged)
    const rawProducts = await readProducts();
    const products = sanitizeProducts(rawProducts);
    return includeInactive
      ? products
      : products.filter((product) => product.active);
  } catch (error) {
    console.error("Failed to read product catalog:", error);
    return [];
  }
}

export async function getDigitalProductBySlug(slug) {
  log("getDigitalProductBySlug");
  const rawSlug = String(slug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const decodedSlug = (() => {
    if (!rawSlug) return "";
    try {
      return decodeURIComponent(rawSlug);
    } catch {
      return rawSlug;
    }
  })();
  const safeSlug = slugify(decodedSlug);
  const safeAssetId = normalizeAssetId(decodedSlug);
  if (!safeSlug && !safeAssetId) return null;

  const db = await tryGetD1();
  log("getDigitalProductBySlug: got DB");
  if (db) {
    let row = null;
    if (safeSlug) {
      row = await db
        .prepare("SELECT * FROM products WHERE slug = ? LIMIT 1")
        .bind(safeSlug)
        .first();
    }
    if (!row && safeAssetId) {
      row = await db
        .prepare(
          "SELECT * FROM products WHERE product_mode = 'asset' AND asset_id = ? LIMIT 1",
        )
        .bind(safeAssetId)
        .first();
    }
    return row ? productRowToObject(row) : null;
  }

  log("getDigitalProductBySlug: searching for inactive too");
  const products = await listDigitalProducts({ includeInactive: true });
  return (
    products.find(
      (product) =>
        product.slug === safeSlug ||
        (product.productMode === "asset" && product.assetId === safeAssetId),
    ) || null
  );
}

export async function getDigitalProductById(productId) {
  return getDigitalProductBySlug(productId);
}

export async function getDigitalProductByAssetId(assetId) {
  const safeAssetId = normalizeAssetId(assetId);
  if (!safeAssetId) return null;

  const db = await tryGetD1();
  if (db) {
    const row = await db
      .prepare(
        "SELECT * FROM products WHERE product_mode = 'asset' AND asset_id = ? LIMIT 1",
      )
      .bind(safeAssetId)
      .first();
    return row ? productRowToObject(row) : null;
  }

  const products = await listDigitalProducts({ includeInactive: true });
  return (
    products.find(
      (product) =>
        product.productMode === "asset" && product.assetId === safeAssetId,
    ) || null
  );
}

export function buildProductSlug(name) {
  return slugify(name);
}

export async function saveDigitalProducts(products) {
  const safeProducts = sanitizeProducts(products);

  const db = await tryGetD1();
  if (db) {
    const statements = safeProducts.map((p) => {
      const r = productObjectToRow(p);
      return db
        .prepare(
          `INSERT INTO products (slug, name, title, description, image_url, type, product_mode, price_cents, currency, free, active, file_url, content_uri, mime_type, asset_id, vat_percent, categories, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             name=excluded.name, title=excluded.title, description=excluded.description,
             image_url=excluded.image_url, type=excluded.type, product_mode=excluded.product_mode,
             price_cents=excluded.price_cents, currency=excluded.currency, free=excluded.free,
             active=excluded.active, file_url=excluded.file_url, content_uri=excluded.content_uri,
             mime_type=excluded.mime_type, asset_id=excluded.asset_id, vat_percent=excluded.vat_percent,
             categories=excluded.categories, updated_at=excluded.updated_at`,
        )
        .bind(
          r.slug,
          r.name,
          r.title,
          r.description,
          r.image_url,
          r.type,
          r.product_mode,
          r.price_cents,
          r.currency,
          r.free,
          r.active,
          r.file_url,
          r.content_uri,
          r.mime_type,
          r.asset_id,
          r.vat_percent,
          r.categories,
          r.updated_at,
        );
    });
    if (statements.length > 0) {
      await db.batch(statements);
    }
    return safeProducts;
  }

  // existing KV path below (unchanged)
  await writeProducts(safeProducts);
  return safeProducts;
}

export function isProductListable(product) {
  if (!product?.active) return false;
  const hasExternalBooking =
    product?.externalBookingEnabled === true &&
    isValidHttpUrl(product?.externalBookingUrl || "");
  if (hasExternalBooking) return true;
  if (product.free === true) return true;
  return typeof product.priceCents === "number" && product.priceCents > 0;
}

/**
 * Resolve the downloadable file URL for a product, handling asset-mode
 * products whose fileUrl may be empty (legacy records created before the fix).
 * Attempts to look up the asset record to get a real storage URL for asset-mode
 * products instead of returning the raw assetId.
 */
export async function resolveFileUrl(product) {
  if (looksLikeStorageAssetId(product?.fileUrl)) return product.fileUrl.trim();
  if (product?.fileUrl && isValidHttpUrl(product.fileUrl)) return product.fileUrl;
  if (product?.productMode === "asset" && product.assetId) {
    if (looksLikeStorageAssetId(product.assetId)) {
      return product.assetId.trim();
    }
    const candidates = [];
    const preferredMimeType = normalizeMimeForCompare(product?.mimeType);

    try {
      const { getAssetRecord } = await import("@/lib/avatarFeedStore");
      const asset = await getAssetRecord(product.assetId);
      if (asset?.source) {
        pushCandidateUrl(
          candidates,
          asset.source.originalUrl,
          asset.source.mimeType || preferredMimeType,
        );
        pushCandidateUrl(
          candidates,
          asset.source.url,
          asset.source.mimeType || preferredMimeType,
        );
      }
      if (Array.isArray(asset?.variants)) {
        for (const variant of asset.variants) {
          pushCandidateUrl(
            candidates,
            variant?.originalUrl,
            variant?.mimeType || preferredMimeType,
          );
          pushCandidateUrl(
            candidates,
            variant?.url,
            variant?.mimeType || preferredMimeType,
          );
        }
      }
    } catch {
      /* avatar feed store lookup failed — fall through */
    }
    try {
      const { findMediaAssetByAssetId } = await import(
        "@/lib/mediaAssetRegistry"
      );
      const match = await findMediaAssetByAssetId(product.assetId);
      if (match?.asset) {
        pushCandidateUrl(
          candidates,
          match.asset.originalUrl,
          match.asset.mimeType || match.mimeType || preferredMimeType,
        );
      }
      pushCandidateUrl(
        candidates,
        match?.url,
        match?.mimeType || preferredMimeType,
      );
    } catch {
      /* media registry lookup failed — fall through */
    }

    const best = pickBestDownloadCandidate(candidates, preferredMimeType);
    if (best) return best;

    if (isImageMime(preferredMimeType) && isValidHttpUrl(product?.imageUrl)) {
      return product.imageUrl;
    }
  }
  return "";
}

export function sanitizeProductForTest(product) {
  return sanitizeProduct(product, new Set());
}
