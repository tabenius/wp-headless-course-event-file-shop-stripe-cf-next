import { requireAdmin } from "@/lib/adminRoute";
import { getDerivationById } from "@/lib/derivationsStore";
import { bindOperationsToAsset } from "@/lib/derivationEngine";
import {
  resolveOutputFormat,
  guardSourceSize,
  isAvifSource,
  executeOperations,
  serializeImage,
} from "@/lib/photonPipeline";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const { derivationId, asset, operations, format: requestedFormat } = payload || {};
  if (!derivationId || !asset?.url) {
    return jsonError("derivationId and asset (with url) are required.");
  }

  const derivation = await getDerivationById(derivationId);
  if (!derivation) {
    return jsonError("Derivation not found.", 404);
  }

  // Caller-supplied operations override derivation defaults
  const baseOperations =
    Array.isArray(operations) && operations.length > 0
      ? operations
      : derivation.operations;
  const finalOperations = bindOperationsToAsset(baseOperations, asset.id);

  // Determine output format (cropCircle → PNG; webp if requested; else JPEG)
  const format = resolveOutputFormat(finalOperations, requestedFormat);
  const contentType =
    format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";

  // Fetch source image
  let sourceBytes;
  try {
    const sourceResponse = await fetch(asset.url);
    if (!sourceResponse.ok) {
      return jsonError(`Could not fetch source image (HTTP ${sourceResponse.status}).`);
    }
    const sourceContentType = sourceResponse.headers.get("content-type") || "";
    if (isAvifSource(sourceContentType)) {
      return jsonError(
        "AVIF source images are not supported — convert to JPEG, PNG, or WebP first.",
      );
    }
    const buffer = await sourceResponse.arrayBuffer();
    guardSourceSize(buffer.byteLength, MAX_SOURCE_BYTES);
    sourceBytes = new Uint8Array(buffer);
  } catch (fetchError) {
    return jsonError(fetchError?.message || "Failed to fetch source image.");
  }

  // Run Photon pipeline
  let outputBytes;
  try {
    const photon = await import("@cf-wasm/photon");
    const img = photon.PhotonImage.new_from_byteslice(sourceBytes);
    let processed = img;
    try {
      processed = executeOperations(photon, img, finalOperations);
      outputBytes = serializeImage(processed, format);
    } finally {
      if (processed !== img) processed.free();
      img.free();
    }
  } catch (photonError) {
    return jsonError(photonError?.message || "Image processing failed.");
  }

  return new Response(outputBytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Derivation-Id": String(derivationId),
      "X-Derivation-Format": format,
    },
  });
}
