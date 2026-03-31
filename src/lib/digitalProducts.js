import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { deriveDigitalProductCategories } from "@/lib/contentCategories";
import { slugify } from "@/lib/slugify";

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

  if (imageUrl && !isValidHttpUrl(imageUrl)) return null;
  if (productMode === "digital_file" && !isValidHttpUrl(fileUrl)) return null;
  if (productMode === "manual_uri" && !contentUri) return null;
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
    active: product?.active !== false,
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
