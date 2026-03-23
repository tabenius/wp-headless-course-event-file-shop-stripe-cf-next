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
import { encodeAvif, decodeAvif } from "@/lib/avifEncode";
import { getPhoton } from "@/lib/photonLoader";

function buildAllowedHosts(request) {
  const hosts = new Set();
  const toHost = (value) => {
    try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
  };
  const originHost = toHost(request?.nextUrl?.origin || "");
  if (originHost) hosts.add(originHost);
  const wpHost = toHost(process.env.NEXT_PUBLIC_WORDPRESS_URL || process.env.WORDPRESS_API_URL || "");
  if (wpHost) hosts.add(wpHost);
  const r2Host = toHost(process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || "");
  if (r2Host) hosts.add(r2Host);
  return hosts;
}

function validateAssetUrl(rawUrl, request) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch {
    return "Invalid asset URL.";
  }
  if (parsed.protocol !== "https:") {
    return "Asset URL must use HTTPS.";
  }
  const allowed = buildAllowedHosts(request);
  if (allowed.size > 0 && !allowed.has(parsed.hostname.toLowerCase())) {
    return `Asset host '${parsed.hostname}' is not in the allowed list.`;
  }
  return null;
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Encode a Uint8Array to base64 without hitting call-stack limits. */
function toBase64(bytes) {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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
  const urlError = validateAssetUrl(asset.url, request);
  if (urlError) return jsonError(urlError);

  const derivation = await getDerivationById(derivationId);
  if (!derivation) {
    return jsonError("Derivation not found.", 404);
  }

  const baseOperations =
    Array.isArray(operations) && operations.length > 0
      ? operations
      : derivation.operations;
  const finalOperations = bindOperationsToAsset(baseOperations, asset.id);

  const format = resolveOutputFormat(finalOperations, requestedFormat);
  const contentType =
    format === "avif"
      ? "image/avif"
      : format === "png"
        ? "image/png"
        : format === "webp"
          ? "image/webp"
          : "image/jpeg";

  // ── Streaming NDJSON response ──────────────────────────────────────────────
  // Each line is a JSON object: { type: "progress"|"done"|"error", … }
  // progress: { pct: 0-99, label: string }
  // done:     { contentType, data: base64 }
  // error:    { message }

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (obj) => ctrl.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        // ── Fetch source ────────────────────────────────────────────────────
        send({ type: "progress", pct: 5, label: "fetch" });
        const sourceResponse = await fetch(asset.url);
        if (!sourceResponse.ok) throw new Error(`Could not fetch source image (HTTP ${sourceResponse.status}).`);
        const sourceContentType = sourceResponse.headers.get("content-type") || "";
        const sourceIsAvif = isAvifSource(sourceContentType);
        const buffer = await sourceResponse.arrayBuffer();
        guardSourceSize(buffer.byteLength);
        const sourceBytes = new Uint8Array(buffer);

        // ── Load into Photon ───────────────────────────────────────────────
        if (sourceIsAvif) {
          send({ type: "progress", pct: 12, label: "decode_avif" });
        } else {
          send({ type: "progress", pct: 12, label: "load" });
        }

        const photon = await getPhoton();

        let img;
        if (sourceIsAvif) {
          const imageData = await decodeAvif(sourceBytes);
          const raw = new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
          img = new photon.PhotonImage(raw, imageData.width, imageData.height);
        } else {
          img = photon.PhotonImage.new_from_byteslice(sourceBytes);
        }

        // ── Pipeline ────────────────────────────────────────────────────────
        // WASM ops are synchronous — per-op events arrive in a burst after
        // all ops complete, but still animate smoothly via CSS transitions.
        const nonSourceOps = finalOperations.filter((op) => op.type !== "source");
        const opCount = nonSourceOps.length;
        // Operations occupy 12 %→80 % of the bar (68 ppts).
        const PCT_OPS_START = 12;
        const PCT_OPS_END = 80;

        send({ type: "progress", pct: PCT_OPS_START, label: "pipeline" });

        let processed = img;
        try {
          processed = executeOperations(photon, img, finalOperations, (done, total, opType) => {
            const pct = opCount > 0
              ? Math.round(PCT_OPS_START + (done / total) * (PCT_OPS_END - PCT_OPS_START))
              : PCT_OPS_END;
            send({ type: "progress", pct, label: opType });
          });

          // ── Encode output ───────────────────────────────────────────────
          let outputBytes;
          if (format === "avif") {
            send({ type: "progress", pct: 82, label: "encode_avif" });
            outputBytes = await encodeAvif(
              processed.get_raw_pixels(),
              processed.get_width(),
              processed.get_height(),
            );
          } else {
            send({ type: "progress", pct: 82, label: "encode" });
            outputBytes = serializeImage(processed, format);
          }

          send({
            type: "done",
            contentType,
            derivationId: String(derivationId),
            derivationFormat: format,
            data: toBase64(outputBytes),
          });
        } finally {
          if (processed !== img) processed.free();
          img.free();
        }
      } catch (err) {
        send({ type: "error", message: err?.message || "Image processing failed." });
      }

      ctrl.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
