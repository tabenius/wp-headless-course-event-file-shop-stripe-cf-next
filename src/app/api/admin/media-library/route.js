import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";
import {
  headBucketObject,
  isS3Configured,
  listBucketObjects,
  replaceBucketObjectMetadata,
} from "@/lib/s3upload";
import { decodeEntities } from "@/lib/decodeEntities";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 120;
const PROBE_CONCURRENCY = 6;
const PROBE_IMAGE_LIMIT = 24;
const PROBE_METADATA_LIMIT = 32;
const MAX_METADATA_TEXT = 600;

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

function clampLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  if (parsed < 1) return 1;
  if (parsed > MAX_LIMIT) return MAX_LIMIT;
  return parsed;
}

function toSafeSearch(value) {
  const safe = String(value || "").trim();
  return safe.slice(0, 120);
}

function toSafePrefix(value) {
  const safe = String(value || "").trim();
  if (!safe) return "uploads/";
  return safe.slice(0, 160);
}

function extFromName(name) {
  const safe = String(name || "");
  const match = safe.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function mimeFromName(name) {
  const ext = extFromName(name);
  return MIME_BY_EXTENSION[ext] || "";
}

function typeLabelFromMime(mimeType, fallbackName) {
  if (mimeType) return mimeType;
  const ext = extFromName(fallbackName);
  return ext ? ext.toUpperCase() : "unknown";
}

function asIsoDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function normalizeInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function sanitizeText(value, max = MAX_METADATA_TEXT) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeOwnerUri(value, max = 320) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "/";
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname || "/";
    } catch {
      path = raw;
    }
  }
  let safe = path
    .replace(/\s+/g, "")
    .replace(/\/{2,}/g, "/");
  if (!safe.startsWith("/")) safe = `/${safe}`;
  if (safe.length > 1) safe = safe.replace(/\/+$/, "");
  return safe.slice(0, max) || "/";
}

function sanitizeAssetSlug(value, max = 120) {
  const raw = sanitizeText(value, max).toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, max);
}

function sanitizeAssetId(value, max = 96) {
  const raw = sanitizeText(value, max).toLowerCase();
  if (!raw) return "";
  return raw.replace(/[^a-z0-9._:-]/g, "");
}

function normalizeAvatarId(value) {
  const raw = sanitizeText(value, 128).toLowerCase();
  if (!raw) return "";
  const withoutPrefix = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!withoutPrefix || !/^[0-9a-f]+$/.test(withoutPrefix)) return "";
  return withoutPrefix;
}

function normalizeAuthorType(value) {
  const safe = sanitizeText(value, 24).toLowerCase();
  if (safe === "avatar") return "avatar";
  if (safe === "user") return "user";
  return "admin";
}

function normalizeAuthorId(value, authorType) {
  if (authorType === "admin") return "admins";
  if (authorType === "avatar") return normalizeAvatarId(value);
  return sanitizeText(value, 160);
}

function buildAssetIdUri(assetId) {
  const safeId = sanitizeAssetId(assetId);
  if (!safeId) return "";
  return `/asset/${encodeURIComponent(safeId)}`;
}

function htmlToText(value, max = MAX_METADATA_TEXT) {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return "";
  const withoutTags = raw
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return sanitizeText(decodeEntities(withoutTags), max);
}

function normalizeWordPressText(value, max = MAX_METADATA_TEXT) {
  if (typeof value === "string") {
    return htmlToText(value, max);
  }
  if (!value || typeof value !== "object") return "";
  const objectValue =
    value.raw ??
    value.rendered ??
    value.value ??
    value.text ??
    value.label ??
    "";
  return normalizeWordPressText(objectValue, max);
}

function readWordPressMeta(meta, key, max = MAX_METADATA_TEXT) {
  if (!meta || typeof meta !== "object") return "";
  return sanitizeText(meta[key], max);
}

function isImageMime(mimeType, fileName) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const ext = extFromName(fileName);
  return [
    "png",
    "jpg",
    "jpeg",
    "jpe",
    "webp",
    "gif",
    "bmp",
    "avif",
    "tif",
    "tiff",
    "heic",
    "heif",
  ].includes(ext);
}

function parsePngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return null;
  }
  const width =
    (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height =
    (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  if (width <= 0 || height <= 0) return null;
  return {
    width: width >>> 0,
    height: height >>> 0,
    mimeType: "image/png",
  };
}

function parseGifDimensions(bytes) {
  if (bytes.length < 10) return null;
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (header !== "GIF8") return null;
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (width <= 0 || height <= 0) return null;
  return { width, height, mimeType: "image/gif" };
}

function parseJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  const sofMarkers = new Set([
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (offset + 4 >= bytes.length) break;
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (!Number.isFinite(segmentLength) || segmentLength < 2) break;
    if (sofMarkers.has(marker) && offset + 8 < bytes.length) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width > 0 && height > 0) {
        return { width, height, mimeType: "image/jpeg" };
      }
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseWebpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const riff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  const webp =
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (!riff || !webp) return null;
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    if (width > 0 && height > 0) {
      return { width, height, mimeType: "image/webp" };
    }
  }

  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    if (width > 0 && height > 0) {
      return { width, height, mimeType: "image/webp" };
    }
  }

  if (chunk === "VP8 " && bytes.length >= 30) {
    const startCode =
      bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a;
    if (startCode) {
      const width = bytes[26] | ((bytes[27] & 0x3f) << 8);
      const height = bytes[28] | ((bytes[29] & 0x3f) << 8);
      if (width > 0 && height > 0) {
        return { width, height, mimeType: "image/webp" };
      }
    }
  }

  return null;
}

function parseImageDimensions(bytes, mimeType, fileName) {
  const byPng = parsePngDimensions(bytes);
  if (byPng) return byPng;
  const byGif = parseGifDimensions(bytes);
  if (byGif) return byGif;
  const byJpeg = parseJpegDimensions(bytes);
  if (byJpeg) return byJpeg;
  const byWebp = parseWebpDimensions(bytes);
  if (byWebp) return byWebp;

  const mime = String(mimeType || "").toLowerCase();
  if (mime === "image/svg+xml" || extFromName(fileName) === "svg") {
    return { width: null, height: null, mimeType: "image/svg+xml" };
  }
  return null;
}

async function probeRemoteResolution(url, mimeType, fileName) {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-65535" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return parseImageDimensions(bytes, mimeType, fileName);
  } catch {
    return null;
  }
}

async function runWithConcurrency(items, limit, worker) {
  if (!Array.isArray(items) || items.length === 0) return;
  const total = items.length;
  let cursor = 0;
  const workers = Array.from({
    length: Math.max(1, Math.min(limit, total)),
  }).map(async () => {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

function normalizeWordPressUrl() {
  const raw =
    process.env.NEXT_PUBLIC_WORDPRESS_URL ||
    process.env.WORDPRESS_API_URL ||
    "";
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/\/graphql\/?$/i, "")
    .replace(/\/wp-json\/?$/i, "")
    .replace(/\/+$/, "");
}

function normalizeWordPressMediaRow(row) {
  const details = row?.media_details || {};
  const rowMeta = row?.meta && typeof row.meta === "object" ? row.meta : {};
  const rowAsset =
    row?.ragbaz_asset && typeof row.ragbaz_asset === "object"
      ? row.ragbaz_asset
      : null;
  const rowAssetDimensions =
    rowAsset?.dimensions && typeof rowAsset.dimensions === "object"
      ? rowAsset.dimensions
      : {};
  const width =
    normalizeInt(details?.width) ||
    normalizeInt(rowAssetDimensions?.width) ||
    normalizeInt(readWordPressMeta(rowMeta, "ragbaz_asset_width"));
  const height =
    normalizeInt(details?.height) ||
    normalizeInt(rowAssetDimensions?.height) ||
    normalizeInt(readWordPressMeta(rowMeta, "ragbaz_asset_height"));
  const sizeBytes =
    normalizeInt(details?.filesize) ||
    normalizeInt(details?.sizes?.full?.filesize) ||
    normalizeInt(rowAsset?.size) ||
    normalizeInt(readWordPressMeta(rowMeta, "ragbaz_asset_size")) ||
    normalizeInt(row?.filesize);
  const mimeType =
    typeof row?.mime_type === "string" && row.mime_type.trim()
      ? row.mime_type
      : mimeFromName(row?.source_url || "");
  const titleText =
    normalizeWordPressText(row?.title, 200) ||
    sanitizeText(row?.slug, 200) ||
    sanitizeText(row?.source_url, 200) ||
    `Media #${row?.id || "?"}`;
  const caption = normalizeWordPressText(row?.caption);
  const description = normalizeWordPressText(row?.description);
  const altText = sanitizeText(row?.alt_text, 300);
  const tooltip = readWordPressMeta(rowMeta, "ragbaz_asset_tooltip", 300) || caption;
  const usageNotes = readWordPressMeta(rowMeta, "ragbaz_asset_usage_notes", 1200);
  const structuredMeta = readWordPressMeta(
    rowMeta,
    "ragbaz_asset_structured_meta",
    1800,
  );
  const schemaRef = readWordPressMeta(rowMeta, "ragbaz_asset_schema_ref", 400);
  const assetId = sanitizeAssetId(
    rowAsset?.assetId || readWordPressMeta(rowMeta, "ragbaz_asset_id", 96),
  );
  const ownerUri = normalizeOwnerUri(
    rowAsset?.ownerUri || readWordPressMeta(rowMeta, "ragbaz_asset_owner_uri", 320) || "/",
  );
  const assetUri =
    sanitizeText(rowAsset?.uri, 400) ||
    sanitizeText(rowMeta.ragbaz_asset_uri, 400) ||
    buildAssetIdUri(assetId);
  const assetSlug = sanitizeAssetSlug(
    rowAsset?.slug || readWordPressMeta(rowMeta, "ragbaz_asset_slug", 120),
  );
  const assetRole = sanitizeText(
    rowAsset?.role || readWordPressMeta(rowMeta, "ragbaz_asset_role", 40),
    40,
  );
  const assetFormat = sanitizeText(
    rowAsset?.format || readWordPressMeta(rowMeta, "ragbaz_asset_format", 40),
    40,
  );
  const variantKind =
    sanitizeText(
      rowAsset?.variantKind || readWordPressMeta(rowMeta, "ragbaz_asset_variant_kind", 80),
      80,
    ) ||
    (assetRole === "original" ? "original" : "");
  const sourceHash = sanitizeText(
    rowAsset?.hash || readWordPressMeta(rowMeta, "ragbaz_asset_hash", 180),
    180,
  );
  const originalUrl = sanitizeText(
    rowAsset?.original?.url || readWordPressMeta(rowMeta, "ragbaz_asset_original_url", 1024),
    1024,
  );
  const originalId = sanitizeText(
    rowAsset?.original?.id || readWordPressMeta(rowMeta, "ragbaz_asset_original_id", 96),
    96,
  );
  const authorType = normalizeAuthorType(
    readWordPressMeta(rowMeta, "ragbaz_asset_author_type", 24),
  );
  const authorId =
    normalizeAuthorId(
      readWordPressMeta(rowMeta, "ragbaz_asset_author_id", 160),
      authorType,
    ) || "admins";
  const copyrightHolder = readWordPressMeta(
    rowMeta,
    "ragbaz_asset_copyright_holder",
    180,
  );
  const license = readWordPressMeta(rowMeta, "ragbaz_asset_license", 180);
  const variants = Array.isArray(rowAsset?.variants)
    ? rowAsset.variants.map((variant) => ({
        sourceId: normalizeInt(variant?.sourceId),
        url: sanitizeText(variant?.url, 1024) || null,
        mime: sanitizeText(variant?.mime, 120) || null,
        size: normalizeInt(variant?.size),
        width: normalizeInt(variant?.width),
        height: normalizeInt(variant?.height),
        format: sanitizeText(variant?.format, 40) || null,
        role: sanitizeText(variant?.role, 40) || null,
        variantKind: sanitizeText(variant?.variantKind, 80) || null,
        hash: sanitizeText(variant?.hash, 180) || null,
        originalId: sanitizeText(variant?.originalId, 96) || null,
        originalUrl: sanitizeText(variant?.originalUrl, 1024) || null,
      }))
    : [];

  return {
    id: `wordpress:${row?.id ?? Math.random().toString(36).slice(2)}`,
    source: "wordpress",
    sourceId: row?.id ?? null,
    key: null,
    title: titleText,
    url: row?.source_url || "",
    mimeType: mimeType || "",
    fileType: typeLabelFromMime(mimeType, row?.source_url || ""),
    sizeBytes,
    width,
    height,
    updatedAt: asIsoDate(row?.date_gmt || row?.date),
    metadata: {
      title: titleText,
      caption,
      description,
      altText,
      tooltip,
      usageNotes,
      structuredMeta,
      schemaRef,
    },
    rights: {
      copyrightHolder,
      license,
    },
    asset: {
      assetId: assetId || null,
      ownerUri,
      uri: assetUri || null,
      slug: assetSlug || null,
      accessInheritance: "owner",
      role: assetRole || null,
      format: assetFormat || null,
      variantKind: variantKind || null,
      sourceHash: sourceHash || null,
      originalUrl: originalUrl || null,
      originalId: originalId || null,
      variants,
      author: {
        type: authorType,
        id: authorId,
      },
    },
  };
}

async function fetchWordPressMedia({ limit, search }) {
  const baseUrl = normalizeWordPressUrl();
  if (!baseUrl) {
    throw new Error("WordPress URL is not configured.");
  }
  const auth = getWordPressGraphqlAuth();
  const params = new URLSearchParams({
    per_page: String(limit),
    page: "1",
    orderby: "date",
    order: "desc",
    _fields:
      "id,date,date_gmt,source_url,mime_type,slug,title,media_type,media_details,alt_text,caption,description,meta,ragbaz_asset",
  });
  if (search) params.set("search", search);
  const response = await fetch(`${baseUrl}/wp-json/wp/v2/media?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      ...(auth?.authorization ? { Authorization: auth.authorization } : {}),
      ...(auth?.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `WordPress media request failed (${response.status}) ${body.slice(0, 160)}`.trim(),
    );
  }
  const rows = await response.json().catch(() => []);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeWordPressMediaRow(row));
}

async function fetchR2Media({ limit, prefix, search }) {
  if (!isS3Configured("r2")) {
    throw new Error("R2 is not configured.");
  }
  let objects = await listBucketObjects({
    prefix,
    limit: Math.min(Math.max(limit * 2, limit), MAX_LIMIT),
    backend: "r2",
  });

  if (search) {
    const needle = search.toLowerCase();
    objects = objects.filter((object) =>
      `${object?.key || ""} ${object?.url || ""}`.toLowerCase().includes(needle),
    );
  }

  const rows = objects.slice(0, limit).map((object) => {
    const mimeType = mimeFromName(object?.key || object?.url || "");
    const key = object?.key || "";
    const title = key || object?.url || "R2 object";
    return {
      id: `r2:${key || Math.random().toString(36).slice(2)}`,
      source: "r2",
      sourceId: null,
      key,
      title,
      url: object?.url || "",
      mimeType: mimeType || "",
      fileType: typeLabelFromMime(mimeType, key),
      sizeBytes: normalizeInt(object?.size),
      width: null,
      height: null,
      updatedAt: asIsoDate(object?.lastModified),
      metadata: {
        title: title,
        caption: "",
        description: "",
        altText: "",
        tooltip: "",
        usageNotes: "",
        structuredMeta: "",
        schemaRef: "",
      },
      rights: {
        copyrightHolder: "",
        license: "",
      },
      asset: {
        assetId: null,
        ownerUri: "/",
        uri: null,
        slug: null,
        accessInheritance: "owner",
        role: null,
        format: null,
        variantKind: null,
        sourceHash: null,
        originalUrl: null,
        originalId: null,
        author: {
          type: "admin",
          id: "admins",
        },
      },
    };
  });

  const imageRows = rows
    .filter((row) => isImageMime(row.mimeType, row.title))
    .slice(0, PROBE_IMAGE_LIMIT);
  await runWithConcurrency(imageRows, PROBE_CONCURRENCY, async (row) => {
    const dimensions = await probeRemoteResolution(row.url, row.mimeType, row.title);
    if (!dimensions) return;
    if (dimensions.mimeType && !row.mimeType) {
      row.mimeType = dimensions.mimeType;
      row.fileType = typeLabelFromMime(dimensions.mimeType, row.title);
    }
    row.width = normalizeInt(dimensions.width);
    row.height = normalizeInt(dimensions.height);
  });

  const metadataRows = rows
    .filter((row) => row.key)
    .slice(0, Math.min(limit, PROBE_METADATA_LIMIT));
  await runWithConcurrency(metadataRows, PROBE_CONCURRENCY, async (row) => {
    try {
      const head = await headBucketObject({ key: row.key, backend: "r2" });
      if (head.contentType && !row.mimeType) {
        row.mimeType = head.contentType;
        row.fileType = typeLabelFromMime(head.contentType, row.key);
      }
      const meta = head.metadata || {};
      const title = sanitizeText(meta.asset_title || row.title, 200);
      row.title = title || row.title;
      row.metadata = {
        title: title || row.title,
        caption: sanitizeText(meta.asset_caption, 300),
        description: sanitizeText(meta.asset_description),
        altText: sanitizeText(meta.asset_alt_text, 300),
        tooltip: sanitizeText(meta.asset_tooltip, 300),
        usageNotes: sanitizeText(meta.asset_usage_notes, 1200),
        structuredMeta: sanitizeText(meta.asset_structured_meta, 1800),
        schemaRef: sanitizeText(meta.asset_schema_ref, 400),
      };
      row.rights = {
        copyrightHolder: sanitizeText(meta.asset_copyright_holder, 180),
        license: sanitizeText(meta.asset_license, 180),
      };
      const metaWidth = normalizeInt(meta.asset_width);
      const metaHeight = normalizeInt(meta.asset_height);
      if (!row.width && metaWidth) row.width = metaWidth;
      if (!row.height && metaHeight) row.height = metaHeight;
      const assetId = sanitizeAssetId(meta.asset_id, 96);
      const ownerUri = normalizeOwnerUri(meta.asset_owner_uri || "/");
      const assetUri = sanitizeText(meta.asset_uri, 400) || buildAssetIdUri(assetId);
      const assetSlug = sanitizeAssetSlug(meta.asset_slug, 120);
      const authorType = normalizeAuthorType(meta.asset_author_type);
      const authorId =
        normalizeAuthorId(meta.asset_author_id, authorType) || "admins";
      row.asset = {
        assetId: assetId || null,
        ownerUri,
        uri: assetUri || null,
        slug: assetSlug || null,
        accessInheritance: "owner",
        role: sanitizeText(meta.asset_role, 40) || null,
        format: sanitizeText(meta.asset_format, 40) || null,
        variantKind: sanitizeText(meta.asset_variant_kind, 80) || null,
        sourceHash: sanitizeText(meta.asset_hash, 180) || null,
        originalUrl: sanitizeText(meta.asset_original_url, 1024) || null,
        originalId: sanitizeText(meta.asset_original_id, 96) || null,
        author: {
          type: authorType,
          id: authorId,
        },
      };
    } catch {
      // Keep base list row if metadata probe fails.
    }
  });

  return rows;
}

function sortByNewest(items) {
  return items.sort((left, right) => {
    const leftParsed = left.updatedAt ? Date.parse(left.updatedAt) : 0;
    const rightParsed = right.updatedAt ? Date.parse(right.updatedAt) : 0;
    const leftTs = Number.isFinite(leftParsed) ? leftParsed : 0;
    const rightTs = Number.isFinite(rightParsed) ? rightParsed : 0;
    if (rightTs !== leftTs) return rightTs - leftTs;
    return String(left.title || "").localeCompare(String(right.title || ""));
  });
}

const R2_MANAGED_METADATA_KEYS = [
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
];

function toPatchPayload(body) {
  const source = sanitizeText(body?.source, 24).toLowerCase();
  if (source !== "wordpress" && source !== "r2") {
    const error = new Error("Invalid media source.");
    error.statusCode = 400;
    throw error;
  }
  const sourceIdRaw = body?.sourceId;
  const sourceId =
    source === "wordpress" ? normalizeInt(sourceIdRaw) : null;
  if (source === "wordpress" && !sourceId) {
    const error = new Error("WordPress attachment id is required.");
    error.statusCode = 400;
    throw error;
  }
  const key = source === "r2" ? sanitizeText(body?.key, 512) : "";
  if (source === "r2" && !key) {
    const error = new Error("R2 object key is required.");
    error.statusCode = 400;
    throw error;
  }
  const metadata = body?.metadata || {};
  const rights = body?.rights || {};
  const asset = body?.asset || {};
  const ownerUri = normalizeOwnerUri(asset?.ownerUri || "/");
  const assetUriRaw = sanitizeText(asset?.uri, 400);
  const assetId = sanitizeAssetId(asset?.assetId || "", 96);
  const assetUri = assetUriRaw || buildAssetIdUri(assetId);
  const assetSlug = sanitizeAssetSlug(asset?.slug, 120);
  const authorType = normalizeAuthorType(asset?.author?.type || asset?.authorType);
  const authorId =
    normalizeAuthorId(
      asset?.author?.id || asset?.authorId,
      authorType,
    ) || "admins";
  return {
    source,
    sourceId,
    key,
    asset: {
      ownerUri,
      uri: assetUri,
      slug: assetSlug,
      author: {
        type: authorType,
        id: authorId,
      },
    },
    metadata: {
      title: sanitizeText(metadata?.title, 200),
      caption: sanitizeText(metadata?.caption, 300),
      description: sanitizeText(metadata?.description),
      altText: sanitizeText(metadata?.altText, 300),
      tooltip: sanitizeText(metadata?.tooltip, 300),
      usageNotes: sanitizeText(metadata?.usageNotes, 1200),
      structuredMeta: sanitizeText(metadata?.structuredMeta, 1800),
      schemaRef: sanitizeText(metadata?.schemaRef, 400),
    },
    rights: {
      copyrightHolder: sanitizeText(rights?.copyrightHolder, 180),
      license: sanitizeText(rights?.license, 180),
    },
  };
}

async function updateWordPressAttachmentMetadata({ sourceId, metadata, rights, asset }) {
  const baseUrl = normalizeWordPressUrl();
  if (!baseUrl) throw new Error("WordPress URL is not configured.");
  const auth = getWordPressGraphqlAuth();
  const payloadWithMeta = {
    title: metadata.title,
    caption: metadata.caption,
    description: metadata.description,
    alt_text: metadata.altText,
    meta: {
      ragbaz_asset_title: metadata.title,
      ragbaz_asset_caption: metadata.caption,
      ragbaz_asset_description: metadata.description,
      ragbaz_asset_alt_text: metadata.altText,
      ragbaz_asset_tooltip: metadata.tooltip,
      ragbaz_asset_usage_notes: metadata.usageNotes,
      ragbaz_asset_structured_meta: metadata.structuredMeta,
      ragbaz_asset_schema_ref: metadata.schemaRef,
      ragbaz_asset_owner_uri: asset.ownerUri || "/",
      ragbaz_asset_uri: asset.uri || "",
      ragbaz_asset_slug: asset.slug || "",
      ragbaz_asset_author_type: asset.author?.type || "admin",
      ragbaz_asset_author_id: asset.author?.id || "admins",
      ragbaz_asset_copyright_holder: rights.copyrightHolder,
      ragbaz_asset_license: rights.license,
    },
  };
  const payloadWithoutMeta = {
    title: metadata.title,
    caption: metadata.caption,
    description: metadata.description,
    alt_text: metadata.altText,
  };

  async function postUpdate(payload) {
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/media/${sourceId}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(auth?.authorization ? { Authorization: auth.authorization } : {}),
        ...(auth?.headers || {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const text = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  }

  let result = await postUpdate(payloadWithMeta);
  if (!result.ok && result.status === 400) {
    result = await postUpdate(payloadWithoutMeta);
  }
  if (!result.ok) {
    throw new Error(
      `WordPress attachment update failed (${result.status}) ${result.text.slice(0, 160)}`.trim(),
    );
  }

  let row = null;
  try {
    row = JSON.parse(result.text || "null");
  } catch {
    row = null;
  }
  if (!row || typeof row !== "object") return null;
  return normalizeWordPressMediaRow(row);
}

async function updateR2ObjectMetadata({ key, metadata, rights, asset }) {
  if (!isS3Configured("r2")) {
    throw new Error("R2 is not configured.");
  }
  await replaceBucketObjectMetadata({
    backend: "r2",
    key,
    metadata: {
      asset_title: metadata.title,
      asset_caption: metadata.caption,
      asset_description: metadata.description,
      asset_alt_text: metadata.altText,
      asset_tooltip: metadata.tooltip,
      asset_usage_notes: metadata.usageNotes,
      asset_structured_meta: metadata.structuredMeta,
      asset_schema_ref: metadata.schemaRef,
      asset_owner_uri: asset.ownerUri || "/",
      asset_uri: asset.uri || "",
      asset_slug: asset.slug || "",
      asset_author_type: asset.author?.type || "admin",
      asset_author_id: asset.author?.id || "admins",
      asset_copyright_holder: rights.copyrightHolder,
      asset_license: rights.license,
    },
    replaceKeys: R2_MANAGED_METADATA_KEYS,
  });
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const sourceRaw = String(
    request.nextUrl.searchParams.get("source") || "all",
  ).toLowerCase();
  const sourceParam = ["all", "wordpress", "r2"].includes(sourceRaw)
    ? sourceRaw
    : "all";
  const includeWordPress = sourceParam === "all" || sourceParam === "wordpress";
  const includeR2 = sourceParam === "all" || sourceParam === "r2";
  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
  const search = toSafeSearch(request.nextUrl.searchParams.get("search"));
  const prefix = toSafePrefix(request.nextUrl.searchParams.get("prefix"));

  const sources = {
    wordpress: { enabled: includeWordPress, ok: false, error: null, count: 0 },
    r2: { enabled: includeR2, ok: false, error: null, count: 0 },
  };
  const warnings = [];
  let wordpressItems = [];
  let r2Items = [];

  if (includeWordPress) {
    try {
      wordpressItems = await fetchWordPressMedia({ limit, search });
      sources.wordpress.ok = true;
      sources.wordpress.count = wordpressItems.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load WordPress media.";
      sources.wordpress.error = message;
      warnings.push(`WordPress: ${message}`);
    }
  }

  if (includeR2) {
    try {
      r2Items = await fetchR2Media({ limit, prefix, search });
      sources.r2.ok = true;
      sources.r2.count = r2Items.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load R2 media.";
      sources.r2.error = message;
      warnings.push(`R2: ${message}`);
    }
  }

  const items = sortByNewest([...wordpressItems, ...r2Items]);
  return NextResponse.json({
    ok: true,
    items,
    total: items.length,
    warnings,
    sources,
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const patch = toPatchPayload(body);
    if (patch.source === "wordpress") {
      const item = await updateWordPressAttachmentMetadata(patch);
      return NextResponse.json({ ok: true, item });
    }
    await updateR2ObjectMetadata(patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    const message =
      error instanceof Error ? error.message : "Failed to update media metadata.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
