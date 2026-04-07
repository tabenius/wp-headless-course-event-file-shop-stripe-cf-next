import { putBucketObject, headBucketObject } from "./s3upload.js";

const GOOGLE_FONTS_CSS_URL = "https://fonts.googleapis.com/css2";
// Modern Chrome UA → returns woff2 format
const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Converts a font family name to a URL-safe slug.
 * "Playfair Display" → "playfair-display"
 */
export function familyToSlug(family) {
  return String(family || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Builds @font-face CSS block(s) for the given font files.
 * @param {string}   family
 * @param {string}   slug
 * @param {boolean}  isVariable
 * @param {number[]|null} weightRange  e.g. [100, 900] — only for variable
 * @param {Array}    files  [{ r2Url, weight?, unicodeRange? }]
 * @returns {string}  one or more @font-face blocks
 */
export function buildFontFaceCss(family, slug, isVariable, weightRange, files) {
  return files
    .map(({ r2Url, weight, unicodeRange }) => {
      const weightDecl = isVariable
        ? `${weightRange[0]} ${weightRange[1]}`
        : String(weight || 400);
      const rangeDecl = unicodeRange
        ? `\n  unicode-range: ${unicodeRange};`
        : "";
      return `@font-face {\n  font-family: '${family}';\n  src: url('${r2Url}') format('woff2');\n  font-weight: ${weightDecl};\n  font-style: normal;\n  font-display: swap;${rangeDecl}\n}`;
    })
    .join("\n");
}

/**
 * Fetches Google Fonts CSS2 for a family and parses @font-face src + unicodeRange entries.
 * Returns [{ woff2Url, weight, unicodeRange }] — one per @font-face block.
 */
async function parseGoogleFontsCss(family, isVariable, weights) {
  const encoded = encodeURIComponent(family);
  let query;
  if (isVariable) {
    query = `family=${encoded}:wght@100..900&display=swap`;
  } else {
    query = `family=${encoded}:wght@${weights.join(";")}`;
  }
  const url = `${GOOGLE_FONTS_CSS_URL}?${query}`;
  const res = await fetch(url, {
    headers: { "User-Agent": FETCH_UA },
  });
  if (!res.ok)
    throw new Error(`Google Fonts CSS fetch failed (${res.status}): ${family}`);
  const css = await res.text();

  // Parse @font-face blocks
  const entries = [];
  const blockRe = /@font-face\s*\{([^}]+)\}/g;
  const srcRe = /src:\s*[^;]*url\(([^)]+)\)[^;]*format\(['"]woff2['"]\)/;
  const weightRe = /font-weight:\s*([^;]+);/;
  const rangeRe = /unicode-range:\s*([^;]+);/;

  let blockMatch;
  while ((blockMatch = blockRe.exec(css)) !== null) {
    const block = blockMatch[1];
    const srcMatch = srcRe.exec(block);
    if (!srcMatch) continue;
    const woff2Url = srcMatch[1].replace(/['"]/g, "").trim();
    const weightMatch = weightRe.exec(block);
    const rangeMatch = rangeRe.exec(block);
    const rawWeight = weightMatch ? weightMatch[1].trim() : "400";
    const weight = parseInt(rawWeight, 10) || 400;
    const unicodeRange = rangeMatch ? rangeMatch[1].trim() : null;
    entries.push({ woff2Url, weight, unicodeRange });
  }

  if (entries.length === 0) {
    throw new Error(
      `No woff2 entries found in Google Fonts CSS for: ${family}`,
    );
  }
  return entries;
}

/**
 * Downloads a Google Font to R2 and returns the complete @font-face CSS
 * with src URLs pointing to R2.
 *
 * @param {string}   family       e.g. "Inter"
 * @param {boolean}  isVariable
 * @param {number[]} weights      used only when !isVariable
 * @returns {Promise<{ fontFaceCss: string, slug: string, isVariable: boolean, weights?: number[], weightRange?: number[] }>}
 */
export async function downloadFontToR2(
  family,
  isVariable,
  weights = [400, 700],
) {
  const slug = familyToSlug(family);
  const r2BaseUrl =
    process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || "";

  const entries = await parseGoogleFontsCss(family, isVariable, weights);

  const r2Files = [];
  // Deduplicate by woff2Url (Google sometimes returns the same file for multiple unicode ranges)
  const uploadedUrls = new Map();

  for (let i = 0; i < entries.length; i++) {
    const { woff2Url, weight, unicodeRange } = entries[i];

    let r2Key;
    if (uploadedUrls.has(woff2Url)) {
      r2Key = uploadedUrls.get(woff2Url);
    } else {
      if (isVariable) {
        r2Key = `fonts/${slug}/${slug}-variable.woff2`;
      } else {
        r2Key = `fonts/${slug}/${weight}${entries.length > weights.length ? `-${i}` : ""}.woff2`;
      }

      // Check if file already exists in R2 (skip re-upload)
      let exists = false;
      try {
        await headBucketObject({ key: r2Key, backend: "r2" });
        exists = true;
      } catch {
        // Not found — upload
      }

      if (!exists) {
        const fontRes = await fetch(woff2Url);
        if (!fontRes.ok)
          throw new Error(`Failed to download font file: ${woff2Url}`);
        const fontBytes = Buffer.from(await fontRes.arrayBuffer());
        await putBucketObject({
          key: r2Key,
          body: fontBytes,
          contentType: "font/woff2",
          backend: "r2",
        });
      }

      uploadedUrls.set(woff2Url, r2Key);
    }

    r2Files.push({
      r2Url: `${r2BaseUrl}/${r2Key}`,
      weight,
      unicodeRange,
    });
  }

  // Build @font-face CSS
  const weightRange = isVariable ? [100, 900] : null;
  const fontFaceCss = buildFontFaceCss(
    family,
    slug,
    isVariable,
    weightRange,
    r2Files,
  );

  const uniqueWeights = isVariable
    ? undefined
    : [...new Set(r2Files.map((f) => f.weight))].sort((a, b) => a - b);

  return {
    family,
    slug,
    isVariable,
    ...(isVariable ? { weightRange: [100, 900] } : { weights: uniqueWeights }),
    fontFaceCss,
  };
}
