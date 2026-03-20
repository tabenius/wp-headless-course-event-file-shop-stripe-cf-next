import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";
import { isS3Configured, listBucketObjects } from "@/lib/s3upload";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 120;
const PROBE_CONCURRENCY = 6;
const PROBE_IMAGE_LIMIT = 24;

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
  const width = normalizeInt(details?.width);
  const height = normalizeInt(details?.height);
  const sizeBytes =
    normalizeInt(details?.filesize) ||
    normalizeInt(details?.sizes?.full?.filesize) ||
    normalizeInt(row?.filesize);
  const mimeType =
    typeof row?.mime_type === "string" && row.mime_type.trim()
      ? row.mime_type
      : mimeFromName(row?.source_url || "");
  const title =
    row?.title?.rendered ||
    row?.title ||
    row?.slug ||
    row?.source_url ||
    `Media #${row?.id || "?"}`;

  return {
    id: `wordpress:${row?.id ?? Math.random().toString(36).slice(2)}`,
    source: "wordpress",
    sourceId: row?.id ?? null,
    key: null,
    title: String(title),
    url: row?.source_url || "",
    mimeType: mimeType || "",
    fileType: typeLabelFromMime(mimeType, row?.source_url || ""),
    sizeBytes,
    width,
    height,
    updatedAt: asIsoDate(row?.date_gmt || row?.date),
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
      "id,date,date_gmt,source_url,mime_type,slug,title,media_type,media_details",
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
    return {
      id: `r2:${object?.key || Math.random().toString(36).slice(2)}`,
      source: "r2",
      sourceId: null,
      key: object?.key || "",
      title: object?.key || object?.url || "R2 object",
      url: object?.url || "",
      mimeType: mimeType || "",
      fileType: typeLabelFromMime(mimeType, object?.key || ""),
      sizeBytes: normalizeInt(object?.size),
      width: null,
      height: null,
      updatedAt: asIsoDate(object?.lastModified),
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
