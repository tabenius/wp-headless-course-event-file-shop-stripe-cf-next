/**
 * uploadPipeline.js — Auto-generate WebP compressed + responsive image variants on upload.
 *
 * Pure helpers (shouldSkipPipeline, buildVariantDefs, buildVariantFilename) are
 * unit-testable without WASM. The main runUploadPipeline() function requires
 * Photon WASM and a live upload backend.
 */

const MIN_DIMENSION = 320;

/**
 * Returns true when the auto-pipeline should be skipped entirely.
 */
export function shouldSkipPipeline(mimeType, width, height) {
  const mime = String(mimeType || "").toLowerCase();
  if (!mime.startsWith("image/")) return true;
  if (mime === "image/gif") return true;
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) return true;
  return false;
}

/**
 * Returns true when the source is already in a modern format (WebP/AVIF).
 */
function isAlreadyModernFormat(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  return mime === "image/webp" || mime === "image/avif";
}

/**
 * Build the list of variants to generate for a given source image.
 */
export function buildVariantDefs(mimeType, originalWidth, originalHeight) {
  const defs = [];
  const alreadyModern = isAlreadyModernFormat(mimeType);

  if (!alreadyModern) {
    defs.push({
      variantKind: "compressed",
      width: originalWidth,
      height: originalHeight,
    });
  }

  const scales = [
    { kind: "responsive-sm", factor: 0.5 },
    { kind: "responsive-md", factor: 1.0 },
    { kind: "responsive-lg", factor: 1.5 },
  ];

  for (const { kind, factor } of scales) {
    defs.push({
      variantKind: kind,
      width: Math.round(originalWidth * factor),
      height: Math.round(originalHeight * factor),
    });
  }

  return defs;
}

/**
 * Build the variant filename from the original upload URL.
 */
export function buildVariantFilename(originalUrl, variantKind) {
  const url = String(originalUrl || "");
  const lastDot = url.lastIndexOf(".");
  const base = lastDot > 0 ? url.slice(0, lastDot) : url;

  const suffixMap = {
    compressed: "",
    "responsive-sm": "-sm",
    "responsive-md": "-md",
    "responsive-lg": "-lg",
  };
  const suffix = suffixMap[variantKind] ?? `-${variantKind}`;
  return `${base}${suffix}.webp`;
}
