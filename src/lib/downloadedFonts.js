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

/**
 * Concatenates fontFaceCss from all downloaded font records.
 * @param {Array} fonts  Result of getDownloadedFonts()
 * @returns {string}
 */
export function getAllFontFaceCss(fonts) {
  if (!Array.isArray(fonts) || fonts.length === 0) return "";
  return fonts
    .map((f) => f.fontFaceCss || "")
    .filter(Boolean)
    .join("\n");
}
