import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { deriveDigitalProductCategories } from "@/lib/contentCategories";
import { slugify } from "@/lib/slugify";
import { getD1Database } from "@/lib/d1Bindings";

async function tryGetD1() {
  try {
    return await getD1Database();
  } catch {
    return null;
  }
}

function productRowToObject(row) {
  if (!row) return null;
  let categories = {};
  try { categories = JSON.parse(row.categories || "{}"); } catch { /* ignore */ }
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
    updatedAt: row.updated_at,
    ...categories,
  };
}

function productObjectToRow(p) {
  const { id, slug, name, title, description, imageUrl, type, productMode,
    priceCents, free, currency, fileUrl, contentUri, mimeType, assetId,
    vatPercent, active, updatedAt, ...rest } = p;
  const cats = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) cats[k] = v;
  }
  return {
    slug, name, title: title || name, description: description || "",
    image_url: imageUrl || "", type: type || "digital_file",
    product_mode: productMode || "digital_file",
    price_cents: priceCents || 0, currency: currency || "SEK",
    free: free ? 1 : 0, active: active !== false ? 1 : 0,
    file_url: fileUrl || "", content_uri: contentUri || "",
    mime_type: mimeType || "", asset_id: assetId || "",
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

  if (imageUrl && !isValidHttpUrl(imageUrl)) return null;
  // Incomplete delivery fields are only hard errors for active products (drafts may be saved without them)
  if (active && productMode === "digital_file" && !isValidHttpUrl(fileUrl)) return null;
  if (active && productMode === "manual_uri" && !contentUri) return null;
  if (productMode === "asset" && !assetId) return null;

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
    fileUrl: productMode === "digital_file" ? fileUrl : "",
    contentUri: productMode === "manual_uri" ? contentUri : "",
    mimeType: productMode === "digital_file" || productMode === "asset" ? mimeType : "",
    assetId: productMode === "asset" ? assetId : "",
    vatPercent,
    active,
    updatedAt: new Date().toISOString(),
    ...categories,
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
    console.error("Cloudflare KV products read failed, falling back to bundled:", error);
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
  const rawSlug = String(slug || "").trim().replace(/^\/+|\/+$/g, "");
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
  if (db) {
    let row = null;
    if (safeSlug) {
      row = await db.prepare("SELECT * FROM products WHERE slug = ? LIMIT 1").bind(safeSlug).first();
    }
    if (!row && safeAssetId) {
      row = await db.prepare("SELECT * FROM products WHERE product_mode = 'asset' AND asset_id = ? LIMIT 1").bind(safeAssetId).first();
    }
    return row ? productRowToObject(row) : null;
  }

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
      .prepare("SELECT * FROM products WHERE product_mode = 'asset' AND asset_id = ? LIMIT 1")
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
    for (const p of safeProducts) {
      const r = productObjectToRow(p);
      await db
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
        .bind(r.slug, r.name, r.title, r.description, r.image_url, r.type, r.product_mode, r.price_cents, r.currency, r.free, r.active, r.file_url, r.content_uri, r.mime_type, r.asset_id, r.vat_percent, r.categories, r.updated_at)
        .run();
    }
    return safeProducts;
  }

  // existing KV path below (unchanged)
  await writeProducts(safeProducts);
  return safeProducts;
}

export function isProductListable(product) {
  if (!product?.active) return false;
  if (product.free === true) return true;
  return typeof product.priceCents === "number" && product.priceCents > 0;
}

export function sanitizeProductForTest(product) {
  return sanitizeProduct(product, new Set());
}
