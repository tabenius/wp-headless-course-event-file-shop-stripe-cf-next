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

export async function runUploadPipeline({
  arrayBuffer,
  mimeType,
  originalUrl,
  assetId,
  ownerUri = "/",
  uploadVariant,
}) {
  // Dynamic imports — keeps pure helpers testable without WASM/Next.js resolver
  const { getPhoton } = await import("@/lib/photonLoader");
  const { executeOperations, serializeImage } = await import(
    "@/lib/photonPipeline"
  );
  const { registerUploadedAsset } = await import("@/lib/avatarFeedStore");

  const photon = await getPhoton();
  const sourceBytes = new Uint8Array(arrayBuffer);
  const sourceImage = photon.PhotonImage.new_from_byteslice(sourceBytes);

  const sourceWidth = sourceImage.get_width();
  const sourceHeight = sourceImage.get_height();

  if (shouldSkipPipeline(mimeType, sourceWidth, sourceHeight)) {
    sourceImage.free();
    return [];
  }

  const variantDefs = buildVariantDefs(mimeType, sourceWidth, sourceHeight);
  const variants = [];

  // Process variants sequentially to avoid memory pressure
  for (const def of variantDefs) {
    try {
      // Clone source for each variant (resize mutates)
      const cloned = photon.PhotonImage.new_from_byteslice(sourceBytes);
      let processed = cloned;

      // Resize if dimensions differ from source
      if (def.width !== sourceWidth || def.height !== sourceHeight) {
        processed = executeOperations(photon, cloned, [
          { type: "resize", params: { width: def.width, height: def.height } },
        ]);
      }

      // Serialize to WebP
      const webpBytes = serializeImage(processed, "webp");
      processed.free();

      // Upload the variant
      const variantFilename = buildVariantFilename(
        originalUrl,
        def.variantKind,
      );
      const uploadResult = await uploadVariant(
        webpBytes,
        variantFilename,
        "image/webp",
      );

      // Register the variant in the asset registry
      await registerUploadedAsset({
        asset: {
          assetId,
          ownerUri,
          assetRole: "variant",
          assetFormat: "webp",
          variantKind: def.variantKind,
          mimeType: "image/webp",
          sizeBytes: webpBytes.byteLength,
          width: def.width,
          height: def.height,
          originalUrl,
          uri: `/asset/${encodeURIComponent(assetId)}`,
        },
        uploadResult: {
          url: uploadResult.url,
          id: uploadResult.id || null,
        },
      });

      variants.push({
        url: uploadResult.url,
        width: def.width,
        height: def.height,
        format: "webp",
        variantKind: def.variantKind,
      });
    } catch (err) {
      // Variant generation is best-effort — log and continue
      console.error(
        `[upload-pipeline] Failed to generate ${def.variantKind} variant:`,
        err,
      );
    }
  }

  sourceImage.free();
  return variants;
}
