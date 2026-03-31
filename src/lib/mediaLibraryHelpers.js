import { OPERATION_SCHEMAS } from "@/lib/derivationEngine";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_DATA_ASSET_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_MB = Math.round(MAX_IMAGE_BYTES / 1024 / 1024);
export const MAX_DATA_MB = Math.round(MAX_DATA_ASSET_BYTES / 1024 / 1024);
export const HISTORY_MAX_ENTRIES = 6;
export const DATA_ASSET_EXTENSIONS = new Set([
  "json",
  "yaml",
  "yml",
  "csv",
  "md",
  "markdown",
  "sqlite",
  "sqlite3",
  "db",
]);

export const PRESET_CROP_OPTIONS = [
  { value: "4:5", label: "4:5 portrait" },
  { value: "1:1", label: "Instagram square" },
  { value: "9:16", label: "Stories (9:16)" },
  { value: "3:4", label: "Tower" },
  { value: "16:9", label: "Banner" },
  { value: "2:1", label: "Hero (2:1)" },
  { value: "21:9", label: "Ultra-wide (21:9)" },
];

export const LS_LAST_OPENED_KEY = "mediaLibraryLastOpenedAt";

const TABLE_EXTENSIONS = new Set([
  "csv",
  "tsv",
  "xls",
  "xlsx",
  "ods",
  "numbers",
]);
const CODE_EXTENSIONS = new Set([
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "tsx",
  "sql",
  "graphql",
  "gql",
]);
const DOCUMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "rtf",
  "doc",
  "docx",
  "odt",
  "epub",
  "pages",
]);
const PRESENTATION_EXTENSIONS = new Set([
  "ppt",
  "pptx",
  "odp",
  "key",
]);
const DATABASE_EXTENSIONS = new Set([
  "sqlite",
  "sqlite3",
  "db",
  "mdb",
  "accdb",
]);
const ARCHIVE_EXTENSIONS = new Set([
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
]);
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "m4a",
  "aac",
  "opus",
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "mpeg",
  "mpg",
  "m4v",
]);
const FONT_EXTENSIONS = new Set([
  "ttf",
  "otf",
  "woff",
  "woff2",
]);
const BINARY_EXTENSIONS = new Set([
  "exe",
  "msi",
  "apk",
  "dmg",
  "pkg",
  "bin",
  "iso",
]);

export function extFromFileName(name) {
  const safe = String(name || "").toLowerCase();
  const match = safe.match(/\.([a-z0-9]+)$/i);
  return match ? match[1] : "";
}

function normalizeMimeType(mimeType) {
  return String(mimeType || "")
    .trim()
    .toLowerCase()
    .split(";")[0];
}

function detectPreviewGroup(ext, mime) {
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) return "video";
  if (
    mime.startsWith("font/") ||
    mime.includes("font") ||
    FONT_EXTENSIONS.has(ext)
  ) {
    return "font";
  }
  if (
    mime.includes("sqlite") ||
    mime.includes("database") ||
    DATABASE_EXTENSIONS.has(ext)
  ) {
    return "database";
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("ms-excel") ||
    mime === "text/csv" ||
    mime === "text/tab-separated-values" ||
    TABLE_EXTENSIONS.has(ext)
  ) {
    return "table";
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("x-tar") ||
    mime.includes("x-7z") ||
    mime.includes("rar") ||
    ARCHIVE_EXTENSIONS.has(ext)
  ) {
    return "archive";
  }
  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    PRESENTATION_EXTENSIONS.has(ext)
  ) {
    return "presentation";
  }
  if (
    mime.includes("javascript") ||
    mime.includes("json") ||
    mime.includes("yaml") ||
    mime.includes("xml") ||
    mime.includes("sql") ||
    mime.includes("graphql") ||
    CODE_EXTENSIONS.has(ext)
  ) {
    return "code";
  }
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    mime.includes("opendocument.text") ||
    mime === "text/plain" ||
    mime === "text/markdown" ||
    DOCUMENT_EXTENSIONS.has(ext)
  ) {
    return "document";
  }
  if (
    mime === "application/octet-stream" ||
    mime.includes("x-msdownload") ||
    BINARY_EXTENSIONS.has(ext)
  ) {
    return "binary";
  }
  if (mime.startsWith("text/")) return "document";
  return "file";
}

function derivePreviewLabel(ext, group) {
  if (ext && ext.length <= 5) return ext.toUpperCase();
  if (group === "database") return "DB";
  if (group === "presentation") return "PPT";
  if (group === "archive") return "ZIP";
  if (group === "document") return "DOC";
  if (group === "binary") return "BIN";
  return group.toUpperCase();
}

export function resolveAssetFilePreview(item) {
  const name = String(
    item?.name || item?.title || item?.key || item?.url || "",
  );
  const ext = extFromFileName(name);
  const mime = normalizeMimeType(item?.mimeType || item?.fileType || "");
  const group = detectPreviewGroup(ext, mime);
  return {
    group,
    label: derivePreviewLabel(ext, group),
    className: `admin-file-preview-${group}`,
  };
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const scaled = value / (1024 ** exponent);
  const precision = scaled >= 100 || exponent === 0 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(precision)} ${units[exponent]}`;
}

export function formatResolution(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return "—";
  }
  return `${w}×${h}`;
}

export function formatUpdatedAt(iso) {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  const d = new Date(time);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yy}${mm}${dd}\u00A0${hh}:${min}`;
}

export function sourceLabel(source) {
  if (source === "wordpress") return "WordPress";
  if (source === "r2") return "R2";
  if (source === "s3") return "S3";
  return "—";
}

export function sourceBadgeClass(source) {
  if (source === "wordpress") return "bg-blue-100 text-blue-800";
  if (source === "r2") return "bg-emerald-100 text-emerald-800";
  if (source === "s3") return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

export function buildPseudoDerivationName(operations) {
  if (!Array.isArray(operations) || operations.length === 0) return "empty";
  return operations
    .map((operation) => OPERATION_SCHEMAS[operation.type]?.label || operation.type)
    .map((label) => label.toLowerCase())
    .join(" · ");
}

export function getUnboundParameters(operations) {
  if (!Array.isArray(operations)) return [];
  return operations.flatMap((operation) => {
    if (operation.type === "source") return [];
    const schema = OPERATION_SCHEMAS[operation.type];
    return (schema?.parameters || [])
      .filter((param) => operation.params?.[param.key] == null)
      .map((param) => ({
        operator: schema?.label || operation.type,
        param: param.key,
      }));
  });
}

export function describeOperationParameters(operation) {
  const schema = OPERATION_SCHEMAS[operation.type];
  return (schema?.parameters || []).map((param) => {
    if (param.key === "assetId") return null;
    const value = operation.params?.[param.key];
    return value == null ? param.key : `${param.key}=${value}`;
  }).filter(Boolean);
}

export function formatParameterValue(value) {
  if (value == null) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : String(value);
  }
  if (typeof value === "object") {
    const hasRgb = ["r", "g", "b"].every((key) => Number.isFinite(Number(value?.[key])));
    if (hasRgb) {
      const r = Math.max(0, Math.min(255, Math.round(Number(value.r))));
      const g = Math.max(0, Math.min(255, Math.round(Number(value.g))));
      const b = Math.max(0, Math.min(255, Math.round(Number(value.b))));
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
        .toString(16)
        .padStart(2, "0")}`;
      return hex;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function isInvalidNumericParam(param, value) {
  if (param?.type !== "number" || value == null || value === "") return false;
  if (typeof value !== "number" || !Number.isFinite(value)) return true;
  if (typeof param.min === "number" && value < param.min) return true;
  if (typeof param.max === "number" && value > param.max) return true;
  return false;
}

export function getInvalidOperationParameters(operations) {
  if (!Array.isArray(operations)) return [];
  return operations.flatMap((operation) => {
    const schema = OPERATION_SCHEMAS[operation.type];
    return (schema?.parameters || [])
      .filter((param) =>
        isInvalidNumericParam(param, operation.params?.[param.key]),
      )
      .map((param) => ({
        operator: schema?.label || operation.type,
        param: param.key,
      }));
  });
}

export function canPreviewImage(item) {
  const mime = String(item?.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const url = String(item?.url || "");
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(url);
}

export function isImageFile(file) {
  if (!(file instanceof File)) return false;
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(file.name || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name);
}

export function detectAssetKind(file) {
  if (!(file instanceof File)) return "";
  if (isImageFile(file)) return "image";
  const extension = extFromFileName(file.name);
  if (extension === "json") return "json";
  if (extension === "csv") return "csv";
  if (extension === "yaml" || extension === "yml") return "yaml";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "sqlite" || extension === "sqlite3" || extension === "db") {
    return "sqlite";
  }
  return "";
}

export function isSupportedUploadFile(file) {
  const kind = detectAssetKind(file);
  return kind === "image" || DATA_ASSET_EXTENSIONS.has(extFromFileName(file?.name));
}

export function canOpenDataViewer(item) {
  const name = String(item?.title || item?.key || item?.url || "");
  const ext = extFromFileName(name);
  const mime = String(item?.mimeType || "").toLowerCase();
  if (["json", "csv"].includes(ext)) return true;
  if (["yaml", "yml"].includes(ext)) return true;
  if (["md", "markdown"].includes(ext)) return true;
  if (["sqlite", "sqlite3", "db"].includes(ext)) return true;
  if (mime.includes("json")) return true;
  if (mime.includes("csv")) return true;
  if (mime.includes("yaml")) return true;
  if (mime.includes("markdown")) return true;
  if (mime.includes("sqlite")) return true;
  return false;
}

export function resolveAssetType(item) {
  if (!item || typeof item !== "object") return "other";
  if (canPreviewImage(item)) return "image";
  if (canOpenDataViewer(item)) return "data";
  return "other";
}

export function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSize(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function buildUploadHistoryEntry({
  name,
  status,
  detail,
  url,
  backend,
  mimeType,
  itemId,
}) {
  return {
    id: `${status}-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: String(name || "untitled"),
    status: String(status || "info"),
    detail: String(detail || ""),
    url: String(url || ""),
    backend: String(backend || ""),
    mimeType: String(mimeType || ""),
    itemId: String(itemId || ""),
    timestamp: Date.now(),
  };
}

export function defaultR2ObjectKey() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `uploads/manual/${stamp}-asset.bin`;
}

export function normalizeEditorValue(value, max = 600) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizeEditorMultiline(value, max = 1200) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

export function normalizeOwnerUri(value, max = 320) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "/";
  let safe = raw
    .replace(/\s+/g, "")
    .replace(/\/{2,}/g, "/");
  if (!safe.startsWith("/")) safe = `/${safe}`;
  if (safe.length > 1) safe = safe.replace(/\/+$/, "");
  return safe.slice(0, max) || "/";
}

export function normalizeAssetSlug(value, max = 120) {
  const raw = normalizeEditorValue(value, max).toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, max);
}

export function toEditorState(item) {
  const metadata = item?.metadata || {};
  const rights = item?.rights || {};
  const asset = item?.asset || {};
  return {
    title: normalizeEditorValue(metadata.title || item?.title || "", 200),
    caption: normalizeEditorValue(metadata.caption || "", 300),
    description: normalizeEditorValue(metadata.description || "", 600),
    altText: normalizeEditorValue(metadata.altText || "", 300),
    tooltip: normalizeEditorValue(metadata.tooltip || "", 300),
    usageNotes: normalizeEditorMultiline(metadata.usageNotes || "", 1200),
    structuredMeta: normalizeEditorMultiline(metadata.structuredMeta || "", 1800),
    schemaRef: normalizeEditorValue(metadata.schemaRef || "", 400),
    ownerUri: normalizeOwnerUri(asset.ownerUri || "/"),
    assetUri: normalizeEditorValue(asset.uri || "", 400),
    assetSlug: normalizeAssetSlug(asset.slug || "", 120),
    assetId: normalizeEditorValue(asset.assetId || "", 96),
    copyrightHolder: normalizeEditorValue(rights.copyrightHolder || "", 180),
    license: normalizeEditorValue(rights.license || "", 180),
  };
}

/**
 * Record "now" as the current open time and return the *previous* open time.
 * The NEW badge compares asset.updatedAt against that previous time so that
 * anything uploaded since the last visit shows as new.
 * Returns null on first visit or if localStorage is unavailable.
 */
export function stampOpenAndGetPrevious() {
  if (typeof localStorage === "undefined") return null;
  try {
    const prev = localStorage.getItem(LS_LAST_OPENED_KEY);
    localStorage.setItem(LS_LAST_OPENED_KEY, new Date().toISOString());
    return prev || null;
  } catch {
    return null;
  }
}

/** Return true when an asset was uploaded/modified after the last library open. */
export function isNewAsset(updatedAt, lastOpenedAt) {
  if (!updatedAt || !lastOpenedAt) return false;
  try {
    return new Date(updatedAt) > new Date(lastOpenedAt);
  } catch {
    return false;
  }
}

// ─── S3/R2 client helpers (CyberDuck bookmark) ────────────────────────────────

export function escXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function normalizeEndpointHost(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .trim();
}

export function buildR2ServerHost(accountId) {
  const safeAccountId = String(accountId || "").trim();
  if (!safeAccountId) return "";
  return `${safeAccountId}.r2.cloudflarestorage.com`;
}

export function resolveStorageServerHost(details = {}) {
  const directHost = normalizeEndpointHost(details.server || details.endpoint || "");
  if (directHost) return directHost;
  return buildR2ServerHost(details.accountId);
}

export function resolveBucketRemotePath(details = {}) {
  if (details.remotePath) return String(details.remotePath).trim();
  const bucket = String(details.bucket || "").trim();
  return bucket ? `/${bucket}` : "";
}

function normalizePathForComparison(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const singleSlashes = withLeadingSlash.replace(/\/{2,}/g, "/");
  if (singleSlashes.length <= 1) return "/";
  return singleSlashes.replace(/\/+$/, "");
}

export function resolveBucketPathDisplayValue(details = {}) {
  const bucket = String(details.bucket || "").trim();
  const remotePath = resolveBucketRemotePath(details);
  const normalizedBucketPath = bucket
    ? normalizePathForComparison(`/${bucket}`)
    : "";
  const normalizedRemotePath = normalizePathForComparison(remotePath);

  if (normalizedRemotePath && normalizedRemotePath === normalizedBucketPath) {
    return normalizedRemotePath;
  }
  if (bucket && normalizedRemotePath) {
    return `${bucket} / ${normalizedRemotePath}`;
  }
  if (normalizedRemotePath) return normalizedRemotePath;
  if (bucket) return `/${bucket}`;
  return "";
}

function parseAttachmentFilename(header) {
  const raw = String(header || "");
  if (!raw) return "";
  const encodedMatch = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].trim());
    } catch {
      return encodedMatch[1].trim();
    }
  }
  const plainMatch = raw.match(/filename="?([^\";]+)"?/i);
  return plainMatch?.[1]?.trim() || "";
}

export async function downloadCyberduckBookmarkFromServer({
  backend = "r2",
  fileNameHint = "r2-bucket.duck",
} = {}) {
  const params = new URLSearchParams();
  if (backend) params.set("backend", backend);
  const response = await fetch(`/api/admin/upload-info/cyberduck-bookmark?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(
      json?.error || `Bookmark download failed (${response.status}).`,
    );
  }
  const blob = await response.blob();
  const headerFileName = parseAttachmentFilename(
    response.headers.get("content-disposition") || "",
  );
  const fileName = headerFileName || String(fileNameHint || "r2-bucket.duck");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
