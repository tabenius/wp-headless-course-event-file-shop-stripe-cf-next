// photonPipeline.js — edge-compatible image operator pipeline using @cf-wasm/photon
// Pure helpers (resolveOutputFormat, parsePresetCrop, guardSourceSize, clampSaturation,
// isAvifSource) are unit-testable without WASM.
// executeOperations() requires a live PhotonImage instance.

const MAX_SOURCE_BYTES = 20 * 1024 * 1024; // 20 MB — matches upload limit
const JPEG_QUALITY = 85;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves the output image format.
 * - cropCircle requires transparency → always PNG regardless of requestedFormat
 * - "avif", "webp", and "png" are accepted as requestedFormat overrides
 * - anything else falls back to "jpeg"
 *
 * @param {Array}  operations
 * @param {string} [requestedFormat]  optional caller override: "avif"|"webp"|"png"|"jpeg"
 * @returns {"jpeg"|"png"|"webp"|"avif"}
 */
export function resolveOutputFormat(operations, requestedFormat) {
  if (Array.isArray(operations) && operations.some((op) => op.type === "cropCircle")) {
    return "png";
  }
  if (requestedFormat === "avif") return "avif";
  if (requestedFormat === "webp") return "webp";
  if (requestedFormat === "png") return "png";
  return "jpeg";
}

/**
 * Parses a preset aspect-ratio string ("16:9", "1:1", etc.) and returns
 * pixel crop coordinates {x1, y1, x2, y2} centered within the source.
 * Returns null when the preset string is not a valid "W:H" ratio.
 *
 * @param {string} preset        e.g. "16:9"
 * @param {number} scale         0.1–1.0 shrink factor applied after aspect fit
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @returns {{x1:number,y1:number,x2:number,y2:number}|null}
 */
export function parsePresetCrop(preset, scale, sourceWidth, sourceHeight) {
  const match = String(preset || "").match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const ratioW = Number(match[1]);
  const ratioH = Number(match[2]);
  if (ratioW <= 0 || ratioH <= 0) return null;

  // Largest rectangle with target ratio that fits inside source
  let cropW, cropH;
  if (sourceWidth / sourceHeight > ratioW / ratioH) {
    cropH = sourceHeight;
    cropW = Math.round((ratioW / ratioH) * cropH);
  } else {
    cropW = sourceWidth;
    cropH = Math.round((ratioH / ratioW) * cropW);
  }

  const clampedScale = Math.min(1, Math.max(0.1, Number(scale) || 1));
  cropW = Math.max(1, Math.round(cropW * clampedScale));
  cropH = Math.max(1, Math.round(cropH * clampedScale));

  const x1 = Math.round((sourceWidth - cropW) / 2);
  const y1 = Math.round((sourceHeight - cropH) / 2);
  return { x1, y1, x2: x1 + cropW, y2: y1 + cropH };
}

/**
 * Throws if byteLength exceeds maxBytes.
 * @param {number} byteLength
 * @param {number} [maxBytes]
 */
export function guardSourceSize(byteLength, maxBytes = MAX_SOURCE_BYTES) {
  if (byteLength > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024);
    throw new Error(`Source image too large (limit ${mb} MB).`);
  }
}

/**
 * Maps a signed saturation amount [-1, 1] to a {fn, amount} descriptor.
 * Positive → saturate_hsl, negative → desaturate_hsl (amount always positive).
 *
 * @param {number} amount
 * @returns {{fn:string, amount:number}}
 */
export function clampSaturation(amount) {
  const clamped = Math.min(1, Math.max(-1, Number(amount) || 0));
  if (clamped >= 0) return { fn: "saturate_hsl", amount: clamped };
  return { fn: "desaturate_hsl", amount: -clamped };
}

/**
 * Returns true when the content-type header indicates an AVIF image.
 * @param {string|null|undefined} contentType
 * @returns {boolean}
 */
export function isAvifSource(contentType) {
  return String(contentType || "").toLowerCase().includes("avif");
}

/**
 * Computes radial tilt-shift blend factor for a single pixel distance.
 * Returns 0 in the focus region and approaches `intensity` outside the falloff band.
 *
 * @param {number} normalizedDistance distance from center normalized by half min dimension
 * @param {number} focusRadius         0..1 sharp center radius
 * @param {number} variance            0.01..1 transition width
 * @param {number} intensity           0..1 max blur blend
 * @returns {number}
 */
export function computeTiltShiftBlendFactor(
  normalizedDistance,
  focusRadius,
  variance,
  intensity,
) {
  const d = Math.max(0, Number(normalizedDistance) || 0);
  const focus = Math.min(1, Math.max(0, Number(focusRadius) || 0));
  const spread = Math.min(1, Math.max(0.01, Number(variance) || 0.25));
  const maxBlur = Math.min(1, Math.max(0, Number(intensity) || 0));
  if (maxBlur <= 0) return 0;
  if (d <= focus) return 0;
  const t = Math.min(1, Math.max(0, (d - focus) / spread));
  // smoothstep easing for softer transition edges
  const smooth = t * t * (3 - 2 * t);
  return smooth * maxBlur;
}

// ─── Pixel helpers ────────────────────────────────────────────────────────────

/**
 * Applies a circular alpha mask to raw RGBA pixel data in place.
 * Pixels outside (centerX, centerY, radius) get alpha = 0.
 *
 * @param {Uint8Array} rawPixels  RGBA flat array from PhotonImage.get_raw_pixels()
 * @param {number} width
 * @param {number} height
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} radius
 * @returns {Uint8Array}
 */
function applyCircleMask(rawPixels, width, height, centerX, centerY, radius) {
  const data = new Uint8Array(rawPixels);
  const r2 = radius * radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > r2) {
        data[(y * width + x) * 4 + 3] = 0;
      }
    }
  }
  return data;
}

// ─── Blend helper ─────────────────────────────────────────────────────────────

function blendWithOriginal(current, effectFn, amount, photon) {
  if (amount >= 1) { effectFn(current); return; }
  if (amount <= 0) return;
  const origPixels = new Uint8Array(current.get_raw_pixels());
  effectFn(current);
  const effPixels = current.get_raw_pixels();
  const w = current.get_width();
  const h = current.get_height();
  const blended = new Uint8Array(origPixels.length);
  const inv = 1 - amount;
  for (let i = 0; i < origPixels.length; i++) {
    blended[i] = Math.round(origPixels[i] * inv + effPixels[i] * amount);
  }
  const next = new photon.PhotonImage(blended, w, h);
  current.free();
  return next;
}

// ─── Operator executor ────────────────────────────────────────────────────────

/**
 * Executes derivation operations sequentially against a PhotonImage.
 * Where Photon returns a new instance (resize, crop) the old one is freed.
 *
 * @param {object}   photon      The @cf-wasm/photon module
 * @param {object}   img         PhotonImage instance
 * @param {Array}    operations  Derivation operation list
 * @param {Function} [onProgress]  Called after each op: (doneCount, totalCount, opType)
 * @returns {object}             PhotonImage (may differ from input)
 */
export function executeOperations(photon, img, operations, onProgress) {
  if (!Array.isArray(operations)) return img;

  let current = img;

  const total = Array.isArray(operations) ? operations.filter((op) => op.type !== "source").length : 0;
  let done = 0;

  try {
  for (const op of operations) {
    const p = op.params || {};

    switch (op.type) {
      case "source":
        // No-op — asset binding only, resolved before this call
        break;

      case "resize": {
        const w = Math.max(1, Math.round(Number(p.width) || 1));
        const h = Math.max(1, Math.round(Number(p.height) || 1));
        // SamplingFilter values: 1=Nearest 2=Triangle 3=CatmullRom 4=Gaussian 5=Lanczos3
        const next = photon.resize(current, w, h, 5);
        if (next !== current) { current.free(); current = next; }
        break;
      }

      case "crop": {
        const w = Math.max(1, Math.round(Number(p.width) || 1));
        const h = Math.max(1, Math.round(Number(p.height) || 1));
        const srcW = current.get_width();
        const srcH = current.get_height();
        // Use explicit x1/y1 if provided, otherwise center-crop
        const x1 = p.x1 != null
          ? Math.max(0, Math.min(srcW - 1, Math.round(Number(p.x1))))
          : Math.max(0, Math.round((srcW - w) / 2));
        const y1 = p.y1 != null
          ? Math.max(0, Math.min(srcH - 1, Math.round(Number(p.y1))))
          : Math.max(0, Math.round((srcH - h) / 2));
        const x2 = Math.min(srcW, x1 + w);
        const y2 = Math.min(srcH, y1 + h);
        const next = photon.crop(current, x1, y1, x2, y2);
        if (next !== current) { current.free(); current = next; }
        break;
      }

      case "sharpen":
        photon.sharpen(current);
        break;

      case "saturation": {
        const { fn, amount } = clampSaturation(p.amount);
        photon[fn](current, amount);
        break;
      }

      case "sepia": {
        const amount = Number(p.amount ?? 1);
        const result = blendWithOriginal(
          current, (img) => photon.sepia(img), amount, photon
        );
        if (result) current = result;
        break;
      }

      case "colorBoost": {
        const contrast = Math.min(100, Math.max(-100, Number(p.contrast || 0) * 100));
        photon.adjust_contrast(current, contrast);
        if (p.vibrance != null) {
          const { fn, amount } = clampSaturation(Number(p.vibrance) * 0.5);
          photon[fn](current, amount);
        }
        break;
      }

      case "presetCrop": {
        const srcW = current.get_width();
        const srcH = current.get_height();
        const coords = parsePresetCrop(p.preset, p.scale, srcW, srcH);
        if (coords) {
          const next = photon.crop(current, coords.x1, coords.y1, coords.x2, coords.y2);
          if (next !== current) { current.free(); current = next; }
        }
        break;
      }

      case "cropCircle": {
        const srcW = current.get_width();
        const srcH = current.get_height();
        const diameter = Math.min(
          Math.min(srcW, srcH),
          Math.max(1, Math.round(Number(p.diameter) || Math.min(srcW, srcH))),
        );
        const radius = diameter / 2;
        const cx = p.centerX != null ? (Number(p.centerX) / 100) * srcW : srcW / 2;
        const cy = p.centerY != null ? (Number(p.centerY) / 100) * srcH : srcH / 2;
        const raw = current.get_raw_pixels();
        const masked = applyCircleMask(raw, srcW, srcH, cx, cy, radius);
        const next = new photon.PhotonImage(masked, srcW, srcH);
        current.free();
        current = next;
        break;
      }

      case "textOverlay": {
        const text = String(p.text || "");
        if (!text) break;
        const srcW = current.get_width();
        const srcH = current.get_height();
        const xPx = Math.round((Number(p.x) || 0) * srcW);
        const yPx = Math.round((Number(p.y) || 0) * srcH);
        const size = Math.max(6, Math.min(200, Number(p.size) || 24));
        // typeface param accepted but ignored — only Roboto is bundled in photon WASM
        photon.draw_text(current, text, xPx, yPx, size);
        break;
      }

      case "brightness": {
        let raw = Number(p.amount) || 0;
        if (Math.abs(raw) <= 1) raw = raw * 255;
        const amount = Math.round(Math.min(255, Math.max(-255, raw)));
        photon.adjust_brightness(current, amount);
        break;
      }

      case "grayscale": {
        const amount = Number(p.amount ?? 1);
        const result = blendWithOriginal(
          current, (img) => photon.grayscale_human_corrected(img), amount, photon
        );
        if (result) current = result;
        break;
      }

      case "flip": {
        const dir = String(p.direction || "h").toLowerCase();
        if (dir === "v") {
          photon.flipv(current);
        } else {
          photon.fliph(current);
        }
        break;
      }

      case "rotate": {
        const degrees = Number(p.degrees) || 0;
        const next = photon.rotate(current, degrees);
        if (next !== current) { current.free(); current = next; }
        break;
      }

      case "blur": {
        const radius = Math.max(1, Math.round(Number(p.radius) || 1));
        photon.gaussian_blur(current, radius);
        break;
      }

      case "tiltShift": {
        const srcW = current.get_width();
        const srcH = current.get_height();
        const halfMin = Math.max(1, Math.min(srcW, srcH) / 2);
        const mode = String(p.mode || "radial").toLowerCase();
        const centerX = Math.min(1, Math.max(0, Number(p.centerX) || 0.5));
        const centerY = Math.min(1, Math.max(0, Number(p.centerY) || 0.5));
        const cx = centerX * (srcW - 1);
        const cy = centerY * (srcH - 1);
        const focusRadius = Math.min(1, Math.max(0, Number(p.focusRadius) || 0.35));
        const variance = Math.min(1, Math.max(0.01, Number(p.variance) || 0.25));
        const intensity = Math.min(1, Math.max(0, Number(p.intensity) || 0.85));
        const blurRadius = Math.max(1, Math.min(32, Math.round(Number(p.blurRadius) || 10)));
        if (intensity <= 0) break;

        const original = new Uint8Array(current.get_raw_pixels());
        const blurImage = new photon.PhotonImage(new Uint8Array(original), srcW, srcH);
        try {
          photon.gaussian_blur(blurImage, blurRadius);
          const blurred = blurImage.get_raw_pixels();
          const result = new Uint8Array(original.length);
          for (let y = 0; y < srcH; y++) {
            const dy = (y - cy) / halfMin;
            for (let x = 0; x < srcW; x++) {
              const dx = (x - cx) / halfMin;
              const distance = mode === "linear" ? Math.abs(dy) : Math.hypot(dx, dy);
              const blend = computeTiltShiftBlendFactor(
                distance,
                focusRadius,
                variance,
                intensity,
              );
              const keep = 1 - blend;
              const offset = (y * srcW + x) * 4;
              result[offset] = Math.round(original[offset] * keep + blurred[offset] * blend);
              result[offset + 1] = Math.round(original[offset + 1] * keep + blurred[offset + 1] * blend);
              result[offset + 2] = Math.round(original[offset + 2] * keep + blurred[offset + 2] * blend);
              result[offset + 3] = Math.round(original[offset + 3] * keep + blurred[offset + 3] * blend);
            }
          }
          const next = new photon.PhotonImage(result, srcW, srcH);
          current.free();
          current = next;
        } finally {
          blurImage.free();
        }
        break;
      }

      case "padding": {
        const pad = Math.max(0, Math.round(Number(p.padding) || 0));
        if (pad === 0) break;
        const r = Math.round(Math.min(255, Math.max(0, Number(p.r ?? 255))));
        const g = Math.round(Math.min(255, Math.max(0, Number(p.g ?? 255))));
        const b = Math.round(Math.min(255, Math.max(0, Number(p.b ?? 255))));
        const a = Math.round(Math.min(255, Math.max(0, Number(p.a ?? 255))));
        const rgba = new photon.Rgba(r, g, b, a);
        const next = photon.padding_uniform(current, pad, rgba);
        if (next !== current) { current.free(); current = next; }
        break;
      }

      case "tint": {
        const r = Math.round(Math.min(255, Math.max(-255, Number(p.r) || 0)));
        const g = Math.round(Math.min(255, Math.max(-255, Number(p.g) || 0)));
        const b = Math.round(Math.min(255, Math.max(-255, Number(p.b) || 0)));
        photon.tint(current, r, g, b);
        break;
      }

      case "hueRotate": {
        const degrees = Number(p.degrees) || 0;
        photon.hue_rotate_hsl(current, degrees);
        break;
      }

      case "invert": {
        const amount = Number(p.amount ?? 1);
        const result = blendWithOriginal(
          current, (img) => photon.invert(img), amount, photon
        );
        if (result) current = result;
        break;
      }

      case "solarize": {
        photon.solarize(current);
        break;
      }

      case "pixelize": {
        const size = Math.max(2, Math.round(Number(p.size) || 8));
        photon.pixelize(current, size);
        break;
      }

      case "duotone": {
        // color1/color2: {r, g, b} each 0–255
        const c1 = p.color1 || {};
        const c2 = p.color2 || {};
        const rgb1 = new photon.Rgb(
          Math.round(Math.min(255, Math.max(0, Number(c1.r) || 0))),
          Math.round(Math.min(255, Math.max(0, Number(c1.g) || 0))),
          Math.round(Math.min(255, Math.max(0, Number(c1.b) || 0))),
        );
        const rgb2 = new photon.Rgb(
          Math.round(Math.min(255, Math.max(0, Number(c2.r) || 0))),
          Math.round(Math.min(255, Math.max(0, Number(c2.g) || 0))),
          Math.round(Math.min(255, Math.max(0, Number(c2.b) || 0))),
        );
        photon.duotone(current, rgb1, rgb2);
        break;
      }

      case "oil": {
        const radius = Math.max(1, Math.min(5, Math.round(Number(p.radius) || 2)));
        const intensity = Math.min(60, Math.max(10, Number(p.intensity) || 30));
        photon.oil(current, radius, intensity);
        break;
      }

      default:
        // Unknown operator — skip silently to keep pipeline resilient
        break;
    }
    if (op.type !== "source" && onProgress) {
      onProgress(++done, total, op.type);
    }
  }
  } catch (err) {
    // Free intermediate image if it diverged from the original before re-throwing
    if (current !== img) current.free();
    throw err;
  }

  return current;
}

/**
 * Serializes a PhotonImage to bytes in the requested format.
 *
 * @param {object}             img
 * @param {"jpeg"|"png"|"webp"} format
 * @returns {Uint8Array}
 */
export function serializeImage(img, format) {
  if (format === "png") return img.get_bytes();
  if (format === "webp") return img.get_bytes_webp();
  return img.get_bytes_jpeg(JPEG_QUALITY);
}
