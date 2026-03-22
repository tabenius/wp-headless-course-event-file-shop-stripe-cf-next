/**
 * avifEncode.js — AVIF encoding and decoding via @jsquash/avif
 *
 * Works in two environments:
 *  - Node.js (next dev): loads the WASM binaries from the filesystem
 *  - CF Workers / wrangler: the `import(…avif_enc/dec.wasm)` calls are bundled
 *    at build time by wrangler/esbuild into compiled WebAssembly.Module objects
 *
 * The `webpackIgnore` comments prevent webpack from analysing the .wasm
 * dynamic imports (they are never reached in Node.js anyway).
 */

import { encode } from "@jsquash/avif";
import { init as initEnc } from "@jsquash/avif/encode.js";
import { decode } from "@jsquash/avif";
import { init as initDec } from "@jsquash/avif/decode.js";

const AVIF_QUALITY = 60;
const AVIF_SPEED = 6; // 0 (slowest/best) – 10 (fastest/worst); 6 is a good middle

// ── WASM loading helper ────────────────────────────────────────────────────

async function loadWasm(nodeModulePath, cfWorkersPath) {
  if (typeof process !== "undefined" && process.versions?.node) {
    // Node.js (local dev): read from filesystem
    const { readFileSync } = await import("node:fs");
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const binary = readFileSync(req.resolve(nodeModulePath));
    return new WebAssembly.Module(binary);
  }
  // CF Workers: wrangler bundles the .wasm as a compiled WebAssembly.Module.
  // webpackIgnore tells webpack to leave these imports alone — they are never
  // reached in Node.js, so webpack never needs to process them.
  const { default: wasm } = await import(/* webpackIgnore: true */ cfWorkersPath);
  return wasm instanceof WebAssembly.Module ? wasm : new WebAssembly.Module(wasm);
}

// ── Encoder ───────────────────────────────────────────────────────────────

let encInitPromise = null;

async function ensureEncInit() {
  if (!encInitPromise) {
    encInitPromise = loadWasm(
      "@jsquash/avif/codec/enc/avif_enc.wasm",
      "@jsquash/avif/codec/enc/avif_enc.wasm",
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
    decInitPromise = loadWasm(
      "@jsquash/avif/codec/dec/avif_dec.wasm",
      "@jsquash/avif/codec/dec/avif_dec.wasm",
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
