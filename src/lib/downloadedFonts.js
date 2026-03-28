import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "./cloudflareKv.js";

const KV_KEY = "fonts:downloaded";

/** Returns all downloaded font records from KV, or [] if none. */
export async function getDownloadedFonts() {
  const data = await readCloudflareKvJson(KV_KEY);
  return Array.isArray(data) ? data : [];
}

/**
 * Upserts a font record by family name.
 * Full replacement of the existing record for that family.
 */
export async function upsertDownloadedFont(record) {
  const fonts = await getDownloadedFonts();
  const idx = fonts.findIndex((f) => f.family === record.family);
  if (idx >= 0) {
    fonts[idx] = record;
  } else {
    fonts.push(record);
  }
  await writeCloudflareKvJson(KV_KEY, fonts);
}

export function parseFontWeightList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => Number.parseInt(String(item), 10)).filter((item) => Number.isFinite(item) && item > 0))];
  }
  return String(value || "")
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function cssHasAllowedWeight(block, allowedWeights) {
  if (!Array.isArray(allowedWeights) || allowedWeights.length === 0) return true;
  const match = String(block || "").match(/font-weight\s*:\s*([^;]+);/i);
  if (!match) return true;
  const raw = match[1].trim();
  const range = raw.match(/^(\d{2,4})\s+(\d{2,4})$/);
  if (range) {
    const start = Number.parseInt(range[1], 10);
    const end = Number.parseInt(range[2], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
    return allowedWeights.some((weight) => weight >= start && weight <= end);
  }
  const fixed = Number.parseInt(raw, 10);
  if (!Number.isFinite(fixed)) return true;
  return allowedWeights.includes(fixed);
}

function trimFontCssByWeights(css, allowedWeights) {
  const safeCss = String(css || "");
  if (!safeCss.trim()) return "";
  if (!Array.isArray(allowedWeights) || allowedWeights.length === 0) return safeCss;

  const blocks = safeCss.match(/@font-face\s*{[\s\S]*?}/g);
  if (!Array.isArray(blocks) || blocks.length === 0) return safeCss;

  const kept = blocks.filter((block) => cssHasAllowedWeight(block, allowedWeights));
  if (kept.length === 0) return safeCss;
  return kept.join("\n");
}

/**
 * Concatenates fontFaceCss from all downloaded font records.
 * @param {Array} fonts  Result of getDownloadedFonts()
 * @param {{ trimToWeights?: number[] }} [options]
 * @returns {string}
 */
export function getAllFontFaceCss(fonts, options = {}) {
  if (!Array.isArray(fonts) || fonts.length === 0) return "";
  const trimToWeights = parseFontWeightList(options?.trimToWeights);
  return fonts
    .map((f) => trimFontCssByWeights(f.fontFaceCss || "", trimToWeights))
    .filter(Boolean)
    .join("\n");
}
