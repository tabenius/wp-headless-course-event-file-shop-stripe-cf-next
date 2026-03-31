import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  buildProductSlug,
  listDigitalProducts,
  saveDigitalProducts,
} from "@/lib/digitalProducts";

export const runtime = "edge";

function sanitizeText(value, max = 200) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeAssetId(value) {
  return sanitizeText(value, 96).toLowerCase().replace(/[^a-z0-9._:-]/g, "");
}

function normalizeMimeType(value) {
  return sanitizeText(value, 120).toLowerCase();
}

function normalizeHttpUrl(value) {
  const candidate = sanitizeText(value, 2048);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function inferNameFromUrl(value) {
  const safeUrl = normalizeHttpUrl(value);
  if (!safeUrl) return "";
  try {
    const { pathname } = new URL(safeUrl);
    const base = decodeURIComponent(pathname.split("/").pop() || "").trim();
    if (!base) return "";
    return base.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
}

function toAssetToken(value) {
  const safe = sanitizeText(value, 140).toLowerCase().replace(/[^a-z0-9._:]/g, "");
  return safe.slice(0, 72);
}

function buildFallbackAssetId(body = {}) {
  const source = toAssetToken(body.source) || "asset";
  const candidates = [
    body.key,
    body.sourceId,
    body.title,
    body.url,
    body.imageUrl,
  ];
  for (const candidate of candidates) {
    const token = toAssetToken(candidate);
    if (token) return normalizeAssetId(`${source}:${token}`);
  }
  return normalizeAssetId(`${source}:${Date.now().toString(36)}`);
}

function resolveAssetId(body = {}) {
  const fromAsset = normalizeAssetId(body.asset?.assetId || "");
  if (fromAsset) return fromAsset;
  const fromBody = normalizeAssetId(body.assetId || "");
  if (fromBody) return fromBody;
  return buildFallbackAssetId(body);
}

function resolveProductName(body = {}, assetId = "") {
  const explicit = sanitizeText(body.title, 140);
  if (explicit) return explicit;
  const fromUrl = sanitizeText(inferNameFromUrl(body.url), 140);
  if (fromUrl) return fromUrl;
  const fromAssetId = sanitizeText(assetId, 80);
  if (fromAssetId) return `Asset ${fromAssetId}`;
  return "Asset download";
}

function resolveProductSlug(name, assetId) {
  const fromName = buildProductSlug(name);
  if (fromName) return fromName;
  const fromAsset = buildProductSlug(`asset-${assetId.replace(/[:._]+/g, "-")}`);
  if (fromAsset) return fromAsset;
  return `asset-${Date.now().toString(36)}`;
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const assetId = resolveAssetId(body);
    if (!assetId) {
      return NextResponse.json(
        { ok: false, error: "Missing assetId for product creation." },
        { status: 400 },
      );
    }

    const products = await listDigitalProducts({ includeInactive: true });
    const existing = products.find(
      (entry) =>
        entry?.productMode === "asset" &&
        normalizeAssetId(entry?.assetId || "") === assetId,
    );
    if (existing) {
      return NextResponse.json({
        ok: true,
        created: false,
        product: existing,
        message: "A product for this asset already exists.",
      });
    }

    const mimeType = normalizeMimeType(body.mimeType || "");
    const name = resolveProductName(body, assetId);
    const fileUrl = normalizeHttpUrl(body.url || "");
    const explicitImageUrl = normalizeHttpUrl(body.imageUrl || "");
    const imageUrlCandidate = normalizeHttpUrl(body.url || "");
    const imageUrl =
      explicitImageUrl ||
      (imageUrlCandidate && mimeType.startsWith("image/")
        ? imageUrlCandidate
        : "");

    const nextProduct = {
      name,
      slug: resolveProductSlug(name, assetId),
      type: "digital_file",
      productMode: "asset",
      description: "",
      imageUrl,
      priceCents: 0,
      free: false,
      currency: "SEK",
      fileUrl,
      mimeType,
      assetId,
      vatPercent: null,
      courseUri: "",
      active: false,
    };

    let saved;
    try {
      saved = await saveDigitalProducts([...products, nextProduct]);
    } catch (saveError) {
      console.error("Admin create product from asset — save failed:", saveError);
      return NextResponse.json(
        {
          ok: false,
          error: `Could not save product list: ${saveError?.message || "unknown write error"}.`,
          debug: { assetId, slug: nextProduct.slug, name: nextProduct.name },
        },
        { status: 500 },
      );
    }

    const created =
      saved.find(
        (entry) =>
          entry?.productMode === "asset" &&
          normalizeAssetId(entry?.assetId || "") === assetId,
      ) || null;

    if (!created) {
      return NextResponse.json(
        {
          ok: false,
          error: `Product was rejected during validation (name: "${nextProduct.name}", slug: "${nextProduct.slug}", assetId: "${assetId}", productMode: "${nextProduct.productMode}").`,
          debug: { assetId, slug: nextProduct.slug, name: nextProduct.name, productMode: nextProduct.productMode },
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      created: true,
      product: created,
      total: saved.length,
    });
  } catch (error) {
    console.error("Admin create product from asset failed:", error);
    return NextResponse.json(
      { ok: false, error: `Could not create product from asset: ${error?.message || "unknown error"}.` },
      { status: 400 },
    );
  }
}
