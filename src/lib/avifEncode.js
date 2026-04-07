/**
 * avifEncode.js — AVIF encoding and decoding via @jsquash/avif
 *
 * Environment behaviour:
 *
 *   Node.js (next dev):
 *     Works fully.  The @jsquash/avif codec and WASM are loaded lazily on
 *     first call via a webpackIgnore dynamic import so that Turbopack never
 *     adds them to the server module graph at build time.
 *
 *   CF Workers (production):
 *     @jsquash/avif is NOT in the worker bundle — the dynamic import fails at
 *     runtime.  Both encodeAvif() and decodeAvif() throw a clear
 *     "AVIF not available" error which the apply route streams back as
 *     { type: "error" }.  Admins see the message and can switch to WebP/JPEG.
 *
 * Why lazy imports?
 *   Static top-level `import { encode } from "@jsquash/avif"` causes Turbopack
 *   to trace the whole emscripten module graph and emit the codec WASM files
 *   (avif_enc.wasm ×2 + avif_dec.wasm = 8 MB) as worker assets.  A
 *   webpackIgnore dynamic import is invisible to the bundler, so nothing is
 *   emitted and the 8 MB disappears from the CF Workers bundle.
 */

const AVIF_QUALITY = 60;
const AVIF_SPEED = 6; // 0 (slowest/best) – 10 (fastest/worst)

const UNAVAILABLE =
  "AVIF is not available in this environment. " +
  "Change the output format to WebP or JPEG and try again.";

// ── Encoder ───────────────────────────────────────────────────────────────

let encInitPromise = null;

async function ensureEncInit() {
  if (!encInitPromise) {
    encInitPromise = (async () => {
      // webpackIgnore: true prevents Turbopack from bundling these modules
      // (and their WASM assets) into the CF Workers script.
      const [avif, { init }] = await Promise.all([
        import(/* webpackIgnore: true */ "@jsquash/avif"),
        import(/* webpackIgnore: true */ "@jsquash/avif/encode.js"),
      ]);
      // In Node.js the WASM loads automatically inside the codec.
      // In CF Workers this import throws before we reach init() — that's fine.
      await init();
      return avif;
    })();
  }
  return encInitPromise;
}

/**
 * Encodes raw RGBA pixel data to AVIF.
 *
 * Throws in CF Workers with a clear user-facing message.
 *
 * @param {Uint8Array} rawPixels  Flat RGBA array (from PhotonImage.get_raw_pixels())
 * @param {number}     width
 * @param {number}     height
 * @param {number}     [quality]  0–100, default 60
 * @returns {Promise<Uint8Array>}
 */
export async function encodeAvif(
  rawPixels,
  width,
  height,
  quality = AVIF_QUALITY,
) {
  let avif;
  try {
    avif = await ensureEncInit();
  } catch {
    throw new Error(UNAVAILABLE);
  }
  const imageData = {
    width,
    height,
    data: new Uint8ClampedArray(
      rawPixels.buffer,
      rawPixels.byteOffset,
      rawPixels.byteLength,
    ),
  };
  const buf = await avif.encode(imageData, { quality, speed: AVIF_SPEED });
  return new Uint8Array(buf);
}

// ── Decoder ───────────────────────────────────────────────────────────────

let decInitPromise = null;

async function ensureDecInit() {
  if (!decInitPromise) {
    decInitPromise = (async () => {
      const [avif, { init }] = await Promise.all([
        import(/* webpackIgnore: true */ "@jsquash/avif"),
        import(/* webpackIgnore: true */ "@jsquash/avif/decode.js"),
      ]);
      await init();
      return avif;
    })();
  }
  return decInitPromise;
}

/**
 * Decodes an AVIF byte buffer to raw RGBA ImageData.
 *
 * Throws in CF Workers with a clear user-facing message.
 *
 * @param {Uint8Array|ArrayBuffer} buffer
 * @returns {Promise<{width:number, height:number, data:Uint8ClampedArray}>}
 */
export async function decodeAvif(buffer) {
  let avif;
  try {
    avif = await ensureDecInit();
  } catch {
    throw new Error(UNAVAILABLE);
  }
  return avif.decode(
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer),
  );
}
