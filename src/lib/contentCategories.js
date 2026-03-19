import { decodeEntities } from "./decodeEntities.js";

function normalizeCategoryName(value) {
  if (typeof value !== "string") return "";
  const decoded = decodeEntities(value);
  if (typeof decoded !== "string") return "";
  return decoded.replace(/\s+/g, " ").trim();
}

function appendCategoryNames(source, out) {
  if (!source) return;
  if (typeof source === "string") {
    const normalized = normalizeCategoryName(source);
    if (normalized) out.push(normalized);
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) appendCategoryNames(item, out);
    return;
  }
  if (typeof source !== "object") return;

  if (Array.isArray(source.edges)) {
    for (const edge of source.edges) appendCategoryNames(edge?.node, out);
    return;
  }
  if (Array.isArray(source.nodes)) {
    for (const node of source.nodes) appendCategoryNames(node, out);
    return;
  }

  const normalized = normalizeCategoryName(
    source.name || source.title || source.slug || "",
  );
  if (normalized) out.push(normalized);
}

export function extractCategoryNames(...sources) {
  const names = [];
  for (const source of sources) appendCategoryNames(source, names);

  const deduped = [];
  const seen = new Set();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(name);
  }
  return deduped;
}

function slugifyCategory(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toCategorySlugs(categories) {
  const names = extractCategoryNames(categories);
  const out = [];
  const seen = new Set();
  for (const name of names) {
    const slug = slugifyCategory(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

const FILE_EXTENSION_CATEGORY_MAP = {
  pdf: ["Document", "PDF"],
  epub: ["Book", "Ebook"],
  mobi: ["Book", "Ebook"],
  azw3: ["Book", "Ebook"],
  doc: ["Document"],
  docx: ["Document"],
  odt: ["Document"],
  rtf: ["Document"],
  txt: ["Text"],
  md: ["Text"],
  csv: ["Spreadsheet", "Data"],
  xls: ["Spreadsheet", "Data"],
  xlsx: ["Spreadsheet", "Data"],
  ods: ["Spreadsheet", "Data"],
  ppt: ["Presentation"],
  pptx: ["Presentation"],
  odp: ["Presentation"],
  mp3: ["Audio"],
  wav: ["Audio"],
  flac: ["Audio"],
  aac: ["Audio"],
  m4a: ["Audio"],
  ogg: ["Audio"],
  mp4: ["Video"],
  mov: ["Video"],
  webm: ["Video"],
  mkv: ["Video"],
  jpg: ["Image", "Graphics"],
  jpeg: ["Image", "Graphics"],
  png: ["Image", "Graphics"],
  webp: ["Image", "Graphics"],
  gif: ["Image", "Graphics"],
  svg: ["Image", "Graphics"],
  avif: ["Image", "Graphics"],
  zip: ["Archive"],
  rar: ["Archive"],
  "7z": ["Archive"],
  tar: ["Archive"],
  gz: ["Archive"],
};

const MIME_CATEGORY_MAP = {
  "application/pdf": ["Document", "PDF"],
  "application/epub+zip": ["Book", "Ebook"],
  "application/zip": ["Archive"],
  "application/x-7z-compressed": ["Archive"],
  "application/x-rar-compressed": ["Archive"],
  "application/msword": ["Document"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "Document",
  ],
  "application/vnd.ms-excel": ["Spreadsheet", "Data"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    "Spreadsheet",
    "Data",
  ],
  "application/vnd.ms-powerpoint": ["Presentation"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    "Presentation",
  ],
  "text/csv": ["Spreadsheet", "Data"],
  "text/plain": ["Text"],
  "text/markdown": ["Text"],
};

function categoryFromMimePrefix(mimeType) {
  if (mimeType.startsWith("image/")) return ["Image", "Graphics"];
  if (mimeType.startsWith("audio/")) return ["Audio"];
  if (mimeType.startsWith("video/")) return ["Video"];
  if (mimeType.startsWith("text/")) return ["Text"];
  return [];
}

function fileExtensionFromUrl(fileUrl) {
  if (typeof fileUrl !== "string" || !fileUrl.trim()) return "";
  let path = fileUrl.trim();
  try {
    path = new URL(path).pathname;
  } catch {
    // keep raw path, fileUrl may be relative
  }
  const fileName = path.split("/").pop() || "";
  const index = fileName.lastIndexOf(".");
  if (index <= 0 || index === fileName.length - 1) return "";
  return fileName.slice(index + 1).toLowerCase();
}

export function inferDigitalFileHeuristicCategories({
  fileUrl = "",
  mimeType = "",
} = {}) {
  const extension = fileExtensionFromUrl(fileUrl);
  const normalizedMimeType =
    typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";

  return extractCategoryNames(
    FILE_EXTENSION_CATEGORY_MAP[extension],
    MIME_CATEGORY_MAP[normalizedMimeType],
    categoryFromMimePrefix(normalizedMimeType),
  );
}

export function deriveDigitalProductCategories(product = {}) {
  const normalizedType = String(product?.type || "").toLowerCase();
  if (normalizedType === "course" || normalizedType === "digital_course") {
    return deriveCategories({
      explicit: product?.categories,
      implied: ["Digital course", "Course"],
    });
  }
  const heuristics = inferDigitalFileHeuristicCategories({
    fileUrl: product?.fileUrl,
    mimeType: product?.mimeType,
  });
  return deriveCategories({
    explicit: product?.categories,
    implied: ["Digital file", "Download", ...heuristics],
  });
}

export function deriveCategories({ explicit = [], implied = [] } = {}) {
  const categories = extractCategoryNames(explicit, implied);
  return {
    categories,
    categorySlugs: toCategorySlugs(categories),
  };
}
