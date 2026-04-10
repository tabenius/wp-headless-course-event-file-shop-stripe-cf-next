import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  headBucketObject,
  isS3Configured,
  listBucketObjects,
  replaceBucketObjectMetadata,
} from "@/lib/s3upload";
import {
  getMediaAssetRegistryStorageInfo,
  listMediaAssetRegistry,
  upsertMediaAssetRegistry,
} from "@/lib/mediaAssetRegistry";

export const runtime = "nodejs";

const REPLACED_META_KEYS = [
  "asset_title",
  "asset_caption",
  "asset_description",
  "asset_alt_text",
  "asset_tooltip",
  "asset_usage_notes",
  "asset_structured_meta",
  "asset_schema_ref",
  "asset_owner_uri",
  "asset_uri",
  "asset_slug",
  "asset_author_type",
  "asset_author_id",
  "asset_copyright_holder",
  "asset_license",
  "asset_id",
  "asset_role",
  "asset_format",
  "asset_variant_kind",
  "asset_hash",
  "asset_original_url",
  "asset_original_id",
  "asset_mime",
  "asset_size",
  "asset_width",
  "asset_height",
];

function safeText(value, max = 600) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sanitizeObjectKey(value) {
  return safeText(value, 512).replace(/^\/+/, "");
}

function sanitizeAssetId(value, max = 96) {
  const raw = safeText(value, max).toLowerCase();
  if (!raw) return "";
  return raw.replace(/[^a-z0-9._:-]/g, "");
}

function sanitizeAssetSlug(value, max = 120) {
  const raw = safeText(value, max).toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, max);
}

function normalizeOwnerUri(value, max = 320) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "/";
  let safe = raw.replace(/\s+/g, "").replace(/\/{2,}/g, "/");
  if (!safe.startsWith("/")) safe = `/${safe}`;
  if (safe.length > 1) safe = safe.replace(/\/+$/, "");
  return safe.slice(0, max) || "/";
}

function normalizeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function toIso(value) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function fileNameFromKey(key) {
  const safe = sanitizeObjectKey(key);
  if (!safe) return "";
  const parts = safe.split("/").filter(Boolean);
  return parts[parts.length - 1] || safe;
}

function mimeFromKey(key) {
  const extension = fileNameFromKey(key).toLowerCase().split(".").pop() || "";
  const mapping = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml",
    json: "application/json",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    sqlite: "application/vnd.sqlite3",
    sqlite3: "application/vnd.sqlite3",
    db: "application/vnd.sqlite3",
  };
  return mapping[extension] || "";
}

function extensionFromKey(key) {
  const fileName = fileNameFromKey(key).toLowerCase();
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  return match ? match[1] : "";
}

function defaultAssetUri(assetId) {
  if (!assetId) return "";
  return `/assets/${encodeURIComponent(assetId)}`;
}

function buildPublicUrlFromKey(key) {
  const base = safeText(
    process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || "",
    1200,
  ).replace(/\/+$/, "");
  const safeKey = sanitizeObjectKey(key);
  if (!base || !safeKey) return "";
  const encoded = safeKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return encoded ? `${base}/${encoded}` : base;
}

async function resolveR2Object(key) {
  const safeKey = sanitizeObjectKey(key);
  if (!safeKey) {
    throw new Error("Object key is required.");
  }
  const listed = await listBucketObjects({
    prefix: safeKey,
    limit: 50,
    backend: "r2",
  });
  const exact = listed.find((row) => row.key === safeKey) || null;
  if (!exact) {
    throw new Error("No R2 object found for this key.");
  }
  const head = await headBucketObject({ key: safeKey, backend: "r2" });
  const metadata =
    head?.metadata && typeof head.metadata === "object" ? head.metadata : {};
  const width = normalizeInteger(metadata.asset_width);
  const height = normalizeInteger(metadata.asset_height);
  const sizeBytes =
    normalizeInteger(exact.size) || normalizeInteger(metadata.asset_size);
  const contentType =
    safeText(head?.contentType, 160) || safeText(metadata.asset_mime, 160);
  const url = safeText(exact.url, 1200) || buildPublicUrlFromKey(safeKey);
  return {
    key: safeKey,
    url,
    metadata,
    contentType: contentType || mimeFromKey(safeKey),
    sizeBytes,
    width,
    height,
    updatedAt: toIso(exact.lastModified) || new Date().toISOString(),
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const assets = await listMediaAssetRegistry();
    return NextResponse.json({
      ok: true,
      r2Configured: isS3Configured("r2"),
      storage: getMediaAssetRegistryStorageInfo(),
      assets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load R2 manual asset registry.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  if (!isS3Configured("r2")) {
    return NextResponse.json(
      {
        ok: false,
        error: "R2 upload backend is not configured.",
      },
      { status: 400 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const key = sanitizeObjectKey(body?.key);
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "Object key is required." },
        { status: 400 },
      );
    }

    const persist = body?.persist !== false;
    const object = await resolveR2Object(key);
    const objectMeta = object.metadata || {};
    const suggestedTitle =
      safeText(objectMeta.asset_title, 200) || fileNameFromKey(key);

    const assetId =
      sanitizeAssetId(body?.assetId || objectMeta.asset_id, 96) ||
      sanitizeAssetId(`asset-${key.replace(/[^a-z0-9._:-]+/gi, "-")}`, 96);
    const ownerUri = normalizeOwnerUri(
      body?.ownerUri || objectMeta.asset_owner_uri || "/",
    );
    const assetUri =
      safeText(body?.assetUri || objectMeta.asset_uri, 400) ||
      defaultAssetUri(assetId);
    const assetSlug = sanitizeAssetSlug(
      body?.assetSlug || objectMeta.asset_slug,
      120,
    );
    const title = safeText(body?.title, 200) || suggestedTitle;
    const copyrightHolder = safeText(
      body?.rights?.copyrightHolder ||
        body?.copyrightHolder ||
        objectMeta.asset_copyright_holder,
      180,
    );
    const license = safeText(
      body?.rights?.license || body?.license || objectMeta.asset_license,
      180,
    );
    const format =
      safeText(objectMeta.asset_format, 40) || extensionFromKey(key);
    const mimeType = safeText(object.contentType, 160) || mimeFromKey(key);
    const preview = {
      key,
      url: object.url,
      title,
      mimeType,
      sizeBytes: object.sizeBytes,
      width: object.width,
      height: object.height,
      updatedAt: object.updatedAt,
      isImage: mimeType.startsWith("image/"),
      publicUrlConfigured: Boolean(object.url),
    };

    if (!persist) {
      return NextResponse.json({
        ok: true,
        persisted: false,
        preview,
        storage: getMediaAssetRegistryStorageInfo(),
      });
    }

    const metadataForR2 = {
      asset_title: title,
      asset_owner_uri: ownerUri,
      asset_uri: assetUri,
      asset_slug: assetSlug,
      asset_author_type: "admin",
      asset_author_id: "admins",
      asset_copyright_holder: copyrightHolder,
      asset_license: license,
      asset_id: assetId,
      asset_role: "original",
      asset_variant_kind: "original",
      asset_format: format,
      asset_original_url: object.url,
      asset_original_id: key,
      asset_mime: mimeType,
      asset_size: object.sizeBytes,
      asset_width: object.width,
      asset_height: object.height,
    };
    await replaceBucketObjectMetadata({
      key,
      backend: "r2",
      metadata: metadataForR2,
      replaceKeys: REPLACED_META_KEYS,
    });

    const asset = await upsertMediaAssetRegistry({
      id: `r2:${key}`,
      key,
      source: "r2",
      sourceId: key,
      title,
      url: object.url,
      mimeType,
      sizeBytes: object.sizeBytes,
      width: object.width,
      height: object.height,
      updatedAt: object.updatedAt,
      rights: {
        copyrightHolder,
        license,
      },
      metadata: {
        title,
      },
      asset: {
        assetId,
        ownerUri,
        uri: assetUri,
        slug: assetSlug,
        role: "original",
        format,
        variantKind: "original",
        originalUrl: object.url,
        originalId: key,
      },
    });

    return NextResponse.json({
      ok: true,
      persisted: true,
      preview,
      asset,
      storage: getMediaAssetRegistryStorageInfo(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not preview or save R2 asset.",
      },
      { status: 500 },
    );
  }
}
