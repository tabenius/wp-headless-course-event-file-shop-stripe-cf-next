/**
 * avifEncode.js — AVIF encoding and decoding via @jsquash/avif
 *
 * Works in two environments:
 *  - Node.js (next dev): reads the WASM binaries from node_modules via the
 *    filesystem (same pattern as photonLoader).
 *  - CF Workers: fetches avif_enc.wasm / avif_dec.wasm from the R2 public URL
 *    (S3_PUBLIC_URL).  The WASM files must be pre-uploaded; see
 *    scripts/upload-wasm-to-r2.sh.  Compiled modules are cached at module
 *    scope for the lifetime of the worker instance.
 *
 * The MT (multi-threaded) encoder is intentionally excluded — CF Workers does
 * not support SharedArrayBuffer-based WASM threads, and including avif_enc_mt
 * added a redundant 3.4 MB to the bundle for no benefit.
 */

import { encode } from "@jsquash/avif";
import { init as initEnc } from "@jsquash/avif/encode.js";
import { decode } from "@jsquash/avif";
import { init as initDec } from "@jsquash/avif/decode.js";

const AVIF_QUALITY = 60;
const AVIF_SPEED = 6; // 0 (slowest/best) – 10 (fastest/worst)

// ── WASM loading helper ────────────────────────────────────────────────────

/**
 * Returns a compiled WebAssembly.Module for the given @jsquash/avif codec.
 *
 * @param {string} cwdRelPath  Path relative to process.cwd() (Node.js)
 * @param {string} r2Key       Key under S3_PUBLIC_URL/_wasm/ (CF Workers)
 */
async function loadAvifWasm(cwdRelPath, r2Key) {
  const isNode =
    typeof process !== "undefined" && Boolean(process.versions?.node);

  if (isNode) {
    // Use process.cwd()-based path construction rather than req.resolve() with
    // a string literal — Turbopack statically analyzes require.resolve() args
    // and would try to bundle .wasm files found that way.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const binary = readFileSync(join(process.cwd(), cwdRelPath));
    return new WebAssembly.Module(binary);
  }

  // CF Workers: fetch from R2 and compile via streaming.
  const base = (process.env.S3_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "avifEncode: S3_PUBLIC_URL is not set — cannot fetch avif WASM from R2.",
    );
  }
  return WebAssembly.compileStreaming(fetch(`${base}/_wasm/${r2Key}`));
}

// ── Encoder ───────────────────────────────────────────────────────────────

let encInitPromise = null;

async function ensureEncInit() {
  if (!encInitPromise) {
    encInitPromise = loadAvifWasm(
      "node_modules/@jsquash/avif/codec/enc/avif_enc.wasm",
      "avif_enc.wasm",
    ).then((wasm) => initEnc(wasm));
  }
  return encInitPromise;
}

/**
 * Encodes raw RGBA pixel data (from PhotonImage.get_raw_pixels()) to AVIF.
 *
 * @param {Uint8Array} rawPixels  Flat RGBA array
 * @param {number}     width
 * @param {number}     height
 * @param {number}     [quality]  0–100, default 60
 * @returns {Promise<Uint8Array>}
 */
export async function encodeAvif(rawPixels, width, height, quality = AVIF_QUALITY) {
  await ensureEncInit();
  const imageData = {
    width,
    height,
    data: new Uint8ClampedArray(
      rawPixels.buffer,
      rawPixels.byteOffset,
      rawPixels.byteLength,
    ),
  };
  const buf = await encode(imageData, { quality, speed: AVIF_SPEED });
  return new Uint8Array(buf);
}

// ── Decoder ───────────────────────────────────────────────────────────────

let decInitPromise = null;

async function ensureDecInit() {
  if (!decInitPromise) {
    decInitPromise = loadAvifWasm(
      "node_modules/@jsquash/avif/codec/dec/avif_dec.wasm",
      "avif_dec.wasm",
    ).then((wasm) => initDec(wasm));
  }
  return decInitPromise;
}

/**
 * Decodes an AVIF byte buffer to raw RGBA ImageData.
 *
 * @param {Uint8Array|ArrayBuffer} buffer  AVIF file bytes
 * @returns {Promise<{width:number, height:number, data:Uint8ClampedArray}>}
 */
export async function decodeAvif(buffer) {
  await ensureDecInit();
  return decode(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
}
