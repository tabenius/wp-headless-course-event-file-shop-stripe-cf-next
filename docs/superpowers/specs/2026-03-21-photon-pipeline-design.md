# Photon Image Processing Pipeline — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Summary

Replace the stub `buildDerivedAsset()` descriptor in `/api/admin/derivations/apply` with a real image transformation pipeline powered by `@cf-wasm/photon`. The route stays edge-runtime (WASM runs in V8 isolates). Output is returned as raw image bytes for browser-side preview; saving to R2 reuses the existing upload API.

---

## Architecture

### Two-step flow

1. **Preview** — `POST /api/admin/derivations/apply`
   - Fetch source image bytes (via `fetch(asset.url)`)
   - Load into Photon (`PhotonImage.new_from_byteslice`)
   - Execute operations sequentially via `photonPipeline.js`
   - Serialize to JPEG (default) or PNG (if `cropCircle` used — needs transparency)
   - Call `.free()` on the PhotonImage
   - Return `Response` with `Content-Type: image/jpeg` (or `image/png`) body
   - Client creates `URL.createObjectURL(blob)` and renders in `<img>` — no R2 write

2. **Save** — existing `POST /api/admin/upload`
   - User clicks "Save to library" in the Media tab
   - Browser POSTs the preview blob to the upload API (backend: R2)
   - Appears in media library with `source: "r2"`; no reprocessing

---

## New file: `src/lib/photonPipeline.js`

Pure edge-compatible operator executor. Exports one function:

```js
executeOperations(photonImage, operations) -> void  // mutates in place
```

Operator mapping:

| Operator | Photon call | Notes |
|---|---|---|
| `source` | skip | Asset selection only |
| `resize` | `resize(img, w, h, SamplingFilter.Lanczos3)` | |
| `crop` | `crop(img, x1, y1, x2, y2)` | x2=x1+w, y2=y1+h |
| `sharpen` | `sharpen(img)` | |
| `saturation` | `saturate_hsl` / `desaturate_hsl` | sign of `amount` param |
| `sepia` | `sepia(img)` | |
| `colorBoost` | `adjust_contrast(img, contrast*100)` + `saturate_hsl` for vibrance | vibrance → saturation approximation |
| `presetCrop` | parse ratio → calculate px dims → `crop()` | `scale` param shrinks result |
| `cropCircle` | manual pixel loop on `get_raw_pixels()` | forces PNG output |
| `textOverlay` | `draw_text(img, text, x_px, y_px, size)` | typeface ignored (Roboto only) |

---

## Modified: `src/app/api/admin/derivations/apply/route.js`

- `npm install @cf-wasm/photon`
- Stays edge runtime (no `export const runtime` change needed)
- Replaces `buildDerivedAsset()` call with full fetch → pipeline → serialize
- Size guard: reject source images over 20 MB (match existing upload limit)
- Returns `new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } })`
- Error cases: source fetch failure, OOM/WASM error, unknown operator → JSON error response

---

## Modified: `AdminMediaLibraryTab.js`

- `applySelectedDerivation()`: response is now an image blob, not JSON
  - Store blob URL via `URL.createObjectURL`
  - Render preview `<img>` in the derivations panel
  - "Save to library" POSTs the blob to `/api/admin/upload` (backend: R2)
  - Revoke blob URL on component unmount / next apply
- Remove `lastDerivedAsset` / `savedDerivedAssets` localStorage pattern (replaced by real upload)

---

## Constraints

- 128 MB CF Workers memory limit — source images over ~3 MB uncompressed may OOM; size guard + clear error message
- `cropCircle` forces PNG output (transparency); all other operators default to JPEG quality 85
- `textOverlay` `typeface` param is accepted but silently ignored (Roboto only); no error
- `DERIVATIONS` KV namespace missing from `wrangler.jsonc` — out of scope for this change, noted as separate TODO

---

## Out of scope

- Saving derivation output to R2 server-side (client-initiated upload reuses existing path)
- Adding/removing operators from the schema
- DERIVATIONS KV wiring
