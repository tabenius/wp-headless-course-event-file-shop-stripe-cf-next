import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { headBucketObject, isS3Configured } from "@/lib/s3upload";

export const runtime = "nodejs";

// ─── URL validation ───────────────────────────────────────────────────────────

function getPublicBaseUrl() {
  return (
    process.env.S3_PUBLIC_URL ||
    process.env.CF_R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");
}

function getPublicBaseHost() {
  const base = getPublicBaseUrl();
  if (!base) return "";
  try {
    return new URL(base).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Validate that `rawUrl` is an HTTPS URL pointing at the configured R2/S3
 * public domain.  Returns an error string, or null when valid.
 */
function validateR2Url(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "Invalid URL.";
  }
  if (parsed.protocol !== "https:") {
    return "URL must use HTTPS.";
  }
  const allowedHost = getPublicBaseHost();
  if (!allowedHost) {
    return "R2/S3 public URL is not configured on this server.";
  }
  if (parsed.hostname.toLowerCase() !== allowedHost) {
    return `URL host '${parsed.hostname}' is not the configured R2/S3 domain ('${allowedHost}').`;
  }
  return null;
}

/**
 * Convert a public URL back to an object key.
 * e.g. https://pub.example.com/uploads/foo.jpg → uploads/foo.jpg
 */
function urlToKey(rawUrl) {
  const base = getPublicBaseUrl();
  if (!base) return null;
  const path = rawUrl.startsWith(base) ? rawUrl.slice(base.length) : null;
  if (!path) return null;
  return path.replace(/^\/+/, "") || null;
}

// ─── Asset shape helpers ──────────────────────────────────────────────────────

const MIME_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  zip: "application/zip",
};

function extFromName(name) {
  const match = String(name || "").match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function mimeFromName(name) {
  return MIME_BY_EXTENSION[extFromName(name)] || "";
}

function typeLabelFromMime(mimeType, fallbackName) {
  if (mimeType) return mimeType;
  const ext = extFromName(fallbackName);
  return ext ? ext.toUpperCase() : "unknown";
}

function sanitizeText(value, max = 600) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function asIsoDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ts = Date.parse(text);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

/**
 * Build the normalized asset record that the media library understands.
 * `meta` comes from headBucketObject() — already normalized (lowercased keys).
 */
function buildAssetRecord({
  key,
  url,
  contentType,
  contentLength,
  meta,
  title,
}) {
  const mimeType = contentType || mimeFromName(key);
  const displayTitle = title || meta?.asset_title || meta?.title || key || url;

  return {
    id: `r2:${key}`,
    source: "r2",
    sourceId: null,
    key,
    title: displayTitle,
    url,
    mimeType,
    fileType: typeLabelFromMime(mimeType, key),
    sizeBytes: normalizeInt(contentLength),
    width: null,
    height: null,
    updatedAt: null,
    metadata: {
      title: displayTitle,
      caption: sanitizeText(meta?.caption),
      description: sanitizeText(meta?.description),
      altText: sanitizeText(meta?.alt_text || meta?.alttext || ""),
      tooltip: sanitizeText(meta?.tooltip),
      usageNotes: sanitizeText(meta?.usage_notes || meta?.usagenotes || ""),
      structuredMeta: sanitizeText(
        meta?.structured_meta || meta?.structuredmeta || "",
      ),
      schemaRef: sanitizeText(meta?.schema_ref || meta?.schemaref || ""),
    },
    rights: {
      copyrightHolder: sanitizeText(
        meta?.copyright_holder || meta?.copyrightholder || "",
      ),
      license: sanitizeText(meta?.license),
    },
    asset: {
      assetId: sanitizeText(meta?.asset_id || meta?.assetid || "", 96) || null,
      ownerUri:
        sanitizeText(meta?.asset_owner_uri || meta?.owneruri || "/", 320) ||
        "/",
      uri: sanitizeText(meta?.asset_uri || meta?.asseturi || "", 320) || null,
      slug: sanitizeText(meta?.asset_slug || meta?.slug || "", 120) || null,
      accessInheritance:
        sanitizeText(meta?.access_inheritance || "owner", 24) || "owner",
      role: sanitizeText(meta?.asset_role || meta?.role || "", 64) || null,
      format:
        sanitizeText(meta?.asset_format || meta?.format || "", 64) || null,
      variantKind:
        sanitizeText(meta?.variant_kind || meta?.variantkind || "", 64) || null,
      sourceHash:
        sanitizeText(meta?.source_hash || meta?.sourcehash || "", 128) || null,
      originalUrl: null,
      originalId: null,
      author: {
        type: sanitizeText(meta?.author_type || "admin", 24) || "admin",
        id: sanitizeText(meta?.author_id || "admins", 160) || "admins",
      },
    },
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const rawUrl = String(body?.url || "").trim();
  if (!rawUrl) {
    return NextResponse.json(
      { ok: false, error: "url is required." },
      { status: 400 },
    );
  }

  const urlError = validateR2Url(rawUrl);
  if (urlError) {
    return NextResponse.json({ ok: false, error: urlError }, { status: 400 });
  }

  const key = urlToKey(rawUrl);
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Could not derive object key from URL." },
      { status: 400 },
    );
  }

  if (!isS3Configured("r2")) {
    return NextResponse.json(
      { ok: false, error: "R2 storage is not configured on this server." },
      { status: 503 },
    );
  }

  let head;
  try {
    head = await headBucketObject({ key, backend: "r2" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Object not found.";
    // HeadObject 404 surfaces as an error; treat it as not found
    return NextResponse.json(
      { ok: false, error: `Object not found in R2: ${msg}` },
      { status: 404 },
    );
  }

  const title = String(body?.title || "").trim() || null;
  const publicUrl = getPublicBaseUrl();
  const url = `${publicUrl}/${key}`;

  const asset = buildAssetRecord({
    key,
    url,
    contentType: head.contentType,
    contentLength: null, // HeadObject ContentLength not exposed via headBucketObject currently
    meta: head.metadata,
    title,
  });

  return NextResponse.json({ ok: true, asset });
}
