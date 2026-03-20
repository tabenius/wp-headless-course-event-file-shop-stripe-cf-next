import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";
import { buildR2Url, signR2Put } from "@/lib/r2Edge";
import { t } from "@/lib/i18n";

const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
const EDGE_R2_MAX_BYTES = 100 * 1024 * 1024;
const S3_ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const ALLOWED_ASSET_FORMATS = new Set(["raw", "webp", "avif"]);
const ALLOWED_VARIANT_KINDS = new Set(["original", "compressed", "derived-work"]);

function isS3BackendEnabled() {
  const raw = String(
    process.env.ENABLE_S3_UPLOAD || process.env.S3_UPLOAD_ENABLED || "",
  )
    .trim()
    .toLowerCase();
  return S3_ENABLED_VALUES.has(raw);
}

function resolveUploadBackend(requested) {
  const normalized = String(requested || "")
    .trim()
    .toLowerCase();
  if (normalized === "wordpress" || normalized === "r2") return normalized;
  if (normalized === "s3" && isS3BackendEnabled()) return "s3";

  const envBackend = String(process.env.UPLOAD_BACKEND || "wordpress")
    .trim()
    .toLowerCase();
  if (envBackend === "wordpress" || envBackend === "r2") return envBackend;
  if (envBackend === "s3" && isS3BackendEnabled()) return "s3";
  return "wordpress";
}

function maxImageUploadBytes() {
  const raw = Number.parseInt(process.env.MAX_IMAGE_UPLOAD_BYTES || "", 10);
  return Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_MAX_IMAGE_UPLOAD_BYTES;
}

function sanitizeFileName(name) {
  return (
    String(name || "upload")
      .trim()
      .replace(/[\\/]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .slice(0, 120) || "upload"
  );
}

function createAssetId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `asset-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function sanitizeAssetValue(value, max = 512) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function sanitizeAssetId(value) {
  const raw = sanitizeAssetValue(value, 96).toLowerCase();
  const safe = raw.replace(/[^a-z0-9._:-]/g, "");
  return safe || "";
}

function parseNullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function inferAssetFormat(fileType) {
  const mime = String(fileType || "").toLowerCase();
  if (mime === "image/webp") return "webp";
  if (mime === "image/avif") return "avif";
  return "raw";
}

function parseAssetContext(formData, file, sizeBytes) {
  const rawRole = String(
    formData.get("assetRole") || formData.get("variantRole") || "",
  )
    .trim()
    .toLowerCase();
  const assetRole = rawRole === "original" ? "original" : "variant";
  const rawFormat = String(formData.get("assetFormat") || "")
    .trim()
    .toLowerCase();
  const inferredFormat = inferAssetFormat(file.type);
  const assetFormat =
    assetRole === "original"
      ? "raw"
      : ALLOWED_ASSET_FORMATS.has(rawFormat)
        ? rawFormat
        : inferredFormat;
  const rawVariantKind = String(formData.get("variantKind") || "")
    .trim()
    .toLowerCase();
  const variantKind =
    assetRole === "original"
      ? "original"
      : ALLOWED_VARIANT_KINDS.has(rawVariantKind)
        ? rawVariantKind
        : "compressed";

  return {
    assetId: sanitizeAssetId(formData.get("assetId")) || createAssetId(),
    assetRole,
    assetFormat,
    originalUrl: sanitizeAssetValue(formData.get("originalUrl"), 1000),
    originalId: sanitizeAssetValue(formData.get("originalId"), 64),
    sourceHash: sanitizeAssetValue(formData.get("sourceHash"), 160),
    copyrightHolder: sanitizeAssetValue(formData.get("copyrightHolder"), 160),
    license: sanitizeAssetValue(formData.get("license"), 160),
    variantKind,
    width: parseNullableInt(formData.get("width")),
    height: parseNullableInt(formData.get("height")),
    sizeBytes,
    mimeType: file.type || "application/octet-stream",
  };
}

function toStorageMetadata(asset) {
  const metadata = {
    asset_id: asset.assetId,
    asset_role: asset.assetRole,
    asset_format: asset.assetFormat,
    asset_mime: asset.mimeType,
    asset_size: String(asset.sizeBytes),
  };
  if (asset.originalUrl) metadata.asset_original_url = asset.originalUrl;
  if (asset.originalId) metadata.asset_original_id = asset.originalId;
  if (asset.sourceHash) metadata.asset_hash = asset.sourceHash;
  if (asset.variantKind) metadata.asset_variant_kind = asset.variantKind;
  if (asset.copyrightHolder) {
    metadata.asset_copyright_holder = asset.copyrightHolder;
  }
  if (asset.license) metadata.asset_license = asset.license;
  if (Number.isFinite(asset.width)) metadata.asset_width = String(asset.width);
  if (Number.isFinite(asset.height)) {
    metadata.asset_height = String(asset.height);
  }
  return metadata;
}

function toR2MetadataHeaders(metadata) {
  const headers = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    const safeKey = String(key || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 64);
    if (!safeKey) continue;
    const safeValue = sanitizeAssetValue(value, 1024);
    if (!safeValue) continue;
    headers[`x-amz-meta-${safeKey}`] = safeValue;
  }
  return headers;
}

function buildAssetResponse(asset, uploadResult, backend) {
  const uploaded = {
    url: uploadResult?.url || null,
    id: uploadResult?.id ?? null,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: Number.isFinite(asset.width) ? asset.width : null,
    height: Number.isFinite(asset.height) ? asset.height : null,
    format: asset.assetFormat,
  };
  const original =
    asset.assetRole === "original"
      ? { url: uploaded.url, id: uploaded.id }
      : { url: asset.originalUrl || null, id: asset.originalId || null };

  return {
    assetId: asset.assetId,
    backend,
    role: asset.assetRole,
    format: asset.assetFormat,
    sourceHash: asset.sourceHash || null,
    variantKind: asset.variantKind,
    rights: {
      copyrightHolder: asset.copyrightHolder || null,
      license: asset.license || null,
    },
    original,
    variant: asset.assetRole === "original" ? null : uploaded,
  };
}

async function maybeUpdateWordPressMediaMeta({
  wpUrl,
  auth,
  mediaId,
  meta,
}) {
  if (!mediaId || !meta || typeof meta !== "object") return;
  try {
    const response = await fetch(`${wpUrl}/wp-json/wp/v2/media/${mediaId}`, {
      method: "POST",
      headers: {
        Authorization: auth.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ meta }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        "WordPress media metadata update skipped:",
        response.status,
        text.slice(0, 240),
      );
    }
  } catch (error) {
    console.warn("WordPress media metadata update failed:", error);
  }
}

async function uploadToWordPress(arrayBuffer, file, assetContext) {
  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").replace(
    /\/+$/,
    "",
  );
  if (!wpUrl) throw new Error(t("apiErrors.wpUrlMissing"));

  const auth = getWordPressGraphqlAuth();
  if (!auth.authorization) throw new Error(t("apiErrors.wpAuthMissing"));

  const response = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: auth.authorization,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: arrayBuffer,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("WordPress media upload failed:", response.status, text);
    throw new Error(t("apiErrors.uploadWpFailed", { status: response.status }));
  }

  const media = await response.json();
  const result = {
    url: media.source_url || "",
    id: media.id,
    title: media.title?.rendered || file.name,
  };

  if (assetContext?.assetId) {
    const meta = {
      ragbaz_asset_id: assetContext.assetId,
      ragbaz_asset_role: assetContext.assetRole,
      ragbaz_asset_format: assetContext.assetFormat,
      ragbaz_asset_original_url:
        assetContext.assetRole === "original"
          ? result.url
          : assetContext.originalUrl || "",
      ragbaz_asset_original_id:
        assetContext.assetRole === "original"
          ? String(result.id || "")
          : assetContext.originalId || "",
      ragbaz_asset_mime: assetContext.mimeType,
      ragbaz_asset_size: assetContext.sizeBytes,
      ragbaz_asset_hash: assetContext.sourceHash || "",
      ragbaz_asset_variant_kind: assetContext.variantKind,
      ragbaz_asset_copyright_holder: assetContext.copyrightHolder || "",
      ragbaz_asset_license: assetContext.license || "",
      ragbaz_asset_width:
        Number.isFinite(assetContext.width) ? assetContext.width : "",
      ragbaz_asset_height:
        Number.isFinite(assetContext.height) ? assetContext.height : "",
    };
    await maybeUpdateWordPressMediaMeta({
      wpUrl,
      auth,
      mediaId: result.id,
      meta,
    });
  }

  return result;
}

function getR2Config() {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "";
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID || "";
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.CF_R2_SECRET_ACCESS_KEY ||
    "";
  const bucket =
    process.env.S3_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME || "";
  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.CF_R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required for R2 uploads.");
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are missing.");
  }
  if (!bucket) throw new Error("R2 bucket is missing.");
  if (!publicUrl) throw new Error("R2 public URL is missing.");

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
  };
}

async function uploadToR2(arrayBuffer, file, metadata = {}) {
  if (arrayBuffer.byteLength > EDGE_R2_MAX_BYTES) {
    throw new Error(
      `File too large for edge R2 upload (max ${EDGE_R2_MAX_BYTES / (1024 * 1024)} MB).`,
    );
  }

  const {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
  } = getR2Config();
  const safeName = sanitizeFileName(file.name);
  const key = `uploads/${Date.now()}-${safeName}`;
  const url = buildR2Url({ accountId, bucket, key });
  const bytes = new Uint8Array(arrayBuffer);
  const requestHeaders = {
    "content-type": file.type || "application/octet-stream",
    ...toR2MetadataHeaders(metadata),
  };
  const signedHeaders = await signR2Put({
    url,
    body: bytes,
    headers: requestHeaders,
    accessKeyId,
    secretAccessKey,
    region: "auto",
  });

  const response = await fetch(url, {
    method: "PUT",
    headers: signedHeaders,
    body: bytes,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 upload failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return {
    url: `${publicUrl}/${key}`,
    title: file.name,
    key,
  };
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const backend = resolveUploadBackend(
      request.nextUrl.searchParams.get("backend"),
    );
    const uploadKind = request.nextUrl.searchParams.get("kind");
    const imageOnly = uploadKind === "image";
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.uploadNoFile") },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    if (imageOnly) {
      const isImageMime =
        typeof file.type === "string" && file.type.startsWith("image/");
      if (!isImageMime) {
        return NextResponse.json(
          { ok: false, error: t("admin.uploadImageTypeInvalid") },
          { status: 400 },
        );
      }
      const maxBytes = maxImageUploadBytes();
      if (arrayBuffer.byteLength > maxBytes) {
        return NextResponse.json(
          {
            ok: false,
            error: t("admin.uploadImageTooLarge", {
              mb: Math.floor(maxBytes / (1024 * 1024)),
            }),
          },
          { status: 413 },
        );
      }
    }

    const assetContext = parseAssetContext(formData, file, arrayBuffer.byteLength);
    const storageMetadata = toStorageMetadata(assetContext);

    if (backend === "r2") {
      const result = await uploadToR2(arrayBuffer, file, storageMetadata);
      const asset = buildAssetResponse(assetContext, result, backend);
      return NextResponse.json({
        ok: true,
        ...result,
        backend,
        mimeType: file.type || "application/octet-stream",
        asset,
        originalUrl: asset?.original?.url || null,
      });
    }

    if (backend === "s3") {
      if (!isS3BackendEnabled()) {
        return NextResponse.json(
          { ok: false, error: "S3 uploads are disabled on this platform." },
          { status: 400 },
        );
      }
      const { isS3Configured, uploadToS3 } = await import("@/lib/s3upload");
      if (!isS3Configured("s3")) {
        return NextResponse.json(
          { ok: false, error: "S3 is not fully configured." },
          { status: 400 },
        );
      }
      const url = await uploadToS3(
        new Uint8Array(arrayBuffer),
        file.name,
        file.type,
        "s3",
        { metadata: storageMetadata },
      );
      const result = { url, title: file.name };
      const asset = buildAssetResponse(assetContext, result, backend);
      return NextResponse.json({
        ok: true,
        ...result,
        backend,
        mimeType: file.type || "application/octet-stream",
        asset,
        originalUrl: asset?.original?.url || null,
      });
    }

    const result = await uploadToWordPress(arrayBuffer, file, assetContext);
    const asset = buildAssetResponse(assetContext, result, "wordpress");
    return NextResponse.json({
      ok: true,
      ...result,
      backend: "wordpress",
      mimeType: file.type || "application/octet-stream",
      asset,
      originalUrl: asset?.original?.url || null,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || t("apiErrors.uploadFailed") },
      { status: 500 },
    );
  }
}
