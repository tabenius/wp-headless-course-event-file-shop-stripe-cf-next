import path from "node:path";

export const PRODUCT_FILE = "config/digital-products.json";
export const PRODUCT_EXAMPLE_FILE = "config/digital-products.example.json";

function normalizeCurrency(currency) {
  return typeof currency === "string" && currency.trim()
    ? currency.trim().toLowerCase()
    : "usd";
}

function normalizeType(type) {
  const safe = typeof type === "string" ? type.trim().toLowerCase() : "";
  return safe === "course" ? "course" : "digital_file";
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCourseUri(courseUri) {
  if (typeof courseUri !== "string") return "";
  const trimmed = courseUri.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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
  const imageUrl = typeof product?.imageUrl === "string" ? product.imageUrl.trim() : "";
  const type = normalizeType(product?.type);
  const priceCents =
    typeof product?.priceCents === "number"
      ? Math.max(0, Math.floor(product.priceCents))
      : Number.parseInt(String(product?.priceCents || "0"), 10) || 0;

  const fileUrl = typeof product?.fileUrl === "string" ? product.fileUrl.trim() : "";
  const courseUri = normalizeCourseUri(product?.courseUri);

  if (imageUrl && !isValidHttpUrl(imageUrl)) return null;
  if (type === "digital_file" && !isValidHttpUrl(fileUrl)) return null;
  if (type === "course" && !courseUri) return null;

  return {
    id: slug,
    slug,
    name,
    title: name,
    description,
    imageUrl,
    type,
    priceCents,
    currency: normalizeCurrency(product?.currency),
    fileUrl: type === "digital_file" ? fileUrl : "",
    courseUri: type === "course" ? courseUri : "",
    active: product?.active !== false,
    updatedAt: new Date().toISOString(),
  };
}

async function readProductFileRaw() {
  const [{ promises: fs }] = await Promise.all([import("node:fs")]);
  const fullPath = path.join(process.cwd(), PRODUCT_FILE);
  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
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

export async function listDigitalProducts({ includeInactive = false } = {}) {
  try {
    const rawProducts = await readProductFileRaw();
    const products = sanitizeProducts(rawProducts);
    return includeInactive ? products : products.filter((product) => product.active);
  } catch (error) {
    console.error("Failed to read product catalog:", error);
    return [];
  }
}

export async function getDigitalProductBySlug(slug) {
  const safeSlug = slugify(slug);
  if (!safeSlug) return null;
  const products = await listDigitalProducts({ includeInactive: true });
  return products.find((product) => product.slug === safeSlug) || null;
}

export async function getDigitalProductById(productId) {
  return getDigitalProductBySlug(productId);
}

export function buildProductSlug(name) {
  return slugify(name);
}

export async function saveDigitalProducts(products) {
  const safeProducts = sanitizeProducts(products);
  const [{ promises: fs }] = await Promise.all([import("node:fs")]);
  const fullPath = path.join(process.cwd(), PRODUCT_FILE);
  await fs.writeFile(fullPath, JSON.stringify(safeProducts, null, 2), "utf8");
  return safeProducts;
}
