# Photon Image Processing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub derivation apply route with a real `@cf-wasm/photon` image processing pipeline that returns processed image bytes for browser-side preview, with a separate save-to-library flow using the existing upload API.

**Architecture:** The apply route (edge runtime) fetches source bytes → runs Photon operators → returns raw `image/jpeg` or `image/png` bytes. The browser creates a blob URL for preview. "Save to library" POSTs the blob to the existing `/api/admin/upload` endpoint. Pure helper functions are extracted to `photonPipeline.js` and unit-tested without WASM.

**Tech Stack:** `@cf-wasm/photon` (WASM, edge-compatible), Web Crypto (edge), `node:test` + `node:assert` (tests), React state + blob URLs (UI).

---

## File Map

| File                                           | Action     | Responsibility                                                                                      |
| ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `src/lib/photonPipeline.js`                    | **Create** | Pure helpers (format resolution, preset crop math, size guard) + `executeOperations()` orchestrator |
| `src/app/api/admin/derivations/apply/route.js` | **Modify** | Wire pipeline: fetch → load → execute → serialize → return binary response                          |
| `src/components/admin/AdminMediaLibraryTab.js` | **Modify** | Handle binary response, blob URL preview, save-to-library upload, remove localStorage pattern       |
| `tests/photon-pipeline.test.js`                | **Create** | Unit tests for pure helper functions (no WASM required)                                             |

---

## Task 1: Install @cf-wasm/photon

**Files:**

- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the package**

```bash
cd /home/xyzzy/articulate-universe/main
npm install @cf-wasm/photon
```

Expected: package added to `dependencies` in `package.json`, no peer-dep errors.

- [ ] **Step 2: Verify it resolves**

```bash
node -e "import('@cf-wasm/photon').then(m => console.log(Object.keys(m).slice(0,8)))"
```

Expected: prints an array of exported names (PhotonImage, resize, crop, etc.).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @cf-wasm/photon for edge image processing"
```

---

## Task 2: Create photonPipeline.js — pure helpers + tests

**Files:**

- Create: `src/lib/photonPipeline.js`
- Create: `tests/photon-pipeline.test.js`

These are the testable, pure (no WASM) functions. `executeOperations` is also here but cannot be unit-tested without WASM — only the helpers are tested.

- [ ] **Step 1: Write the failing tests**

Create `tests/photon-pipeline.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOutputFormat,
  parsePresetCrop,
  guardSourceSize,
  clampSaturation,
} from "../src/lib/photonPipeline.js";

describe("resolveOutputFormat", () => {
  it("returns jpeg when no cropCircle operation", () => {
    const ops = [
      { type: "source" },
      { type: "resize", params: { width: 800, height: 600 } },
    ];
    assert.equal(resolveOutputFormat(ops), "jpeg");
  });

  it("returns png when cropCircle is present", () => {
    const ops = [
      { type: "source" },
      { type: "cropCircle", params: { diameter: 200 } },
    ];
    assert.equal(resolveOutputFormat(ops), "png");
  });

  it("returns jpeg for empty operations", () => {
    assert.equal(resolveOutputFormat([]), "jpeg");
  });
});

describe("parsePresetCrop", () => {
  it("parses 1:1 from a landscape source and centers the crop", () => {
    // source 1000x500, 1:1 at scale 1.0 → 500x500 centered
    const result = parsePresetCrop("1:1", 1.0, 1000, 500);
    assert.equal(result.x2 - result.x1, 500);
    assert.equal(result.y2 - result.y1, 500);
    assert.equal(result.x1, 250); // centered horizontally
    assert.equal(result.y1, 0);
  });

  it("applies scale to output dimensions", () => {
    // source 1000x1000, 1:1 at scale 0.5 → 500x500 centered
    const result = parsePresetCrop("1:1", 0.5, 1000, 1000);
    assert.equal(result.x2 - result.x1, 500);
    assert.equal(result.y2 - result.y1, 500);
  });

  it("parses 16:9 from a portrait source", () => {
    // source 900x1600, 16:9 → widest 16:9 that fits: 900x506
    const result = parsePresetCrop("16:9", 1.0, 900, 1600);
    assert.equal(result.x2 - result.x1, 900);
    assert.ok(result.y2 - result.y1 <= 1600);
  });

  it("returns null for invalid preset string", () => {
    assert.equal(parsePresetCrop("notaratio", 1.0, 800, 600), null);
  });
});

describe("guardSourceSize", () => {
  it("does not throw when bytes are within limit", () => {
    assert.doesNotThrow(() => guardSourceSize(1024, 20 * 1024 * 1024));
  });

  it("throws when bytes exceed limit", () => {
    assert.throws(
      () => guardSourceSize(25 * 1024 * 1024, 20 * 1024 * 1024),
      /too large/i,
    );
  });
});

describe("clampSaturation", () => {
  it("returns positive amount unchanged when >= 0", () => {
    assert.deepEqual(clampSaturation(0.5), { fn: "saturate_hsl", amount: 0.5 });
  });

  it("returns desaturate fn with positive amount when input is negative", () => {
    assert.deepEqual(clampSaturation(-0.3), {
      fn: "desaturate_hsl",
      amount: 0.3,
    });
  });

  it("clamps amount to [0, 1]", () => {
    assert.deepEqual(clampSaturation(2.5), { fn: "saturate_hsl", amount: 1 });
    assert.deepEqual(clampSaturation(-3), { fn: "desaturate_hsl", amount: 1 });
  });
});
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

```bash
cd /home/xyzzy/articulate-universe/main
npm test -- --test-name-pattern="resolveOutputFormat|parsePresetCrop|guardSourceSize|clampSaturation" 2>&1 | tail -20
```

Expected: fails with `Cannot find module '../src/lib/photonPipeline.js'`.

- [ ] **Step 3: Create src/lib/photonPipeline.js**

```js
// photonPipeline.js — edge-compatible image operator pipeline using @cf-wasm/photon
// Pure helpers are at the top and unit-testable without WASM.
// executeOperations() requires a live PhotonImage and is tested via integration only.

const MAX_SOURCE_BYTES = 20 * 1024 * 1024; // 20 MB, matches upload limit
const JPEG_QUALITY = 85;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Returns "png" if any operation requires transparency (cropCircle),
 * otherwise "jpeg".
 */
export function resolveOutputFormat(operations) {
  if (!Array.isArray(operations)) return "jpeg";
  return operations.some((op) => op.type === "cropCircle") ? "png" : "jpeg";
}

/**
 * Parses a preset aspect ratio string ("16:9", "1:1", etc.) and returns
 * pixel crop coordinates {x1, y1, x2, y2} centered within the source.
 * Returns null if the preset string is not a valid ratio.
 *
 * @param {string} preset  e.g. "16:9"
 * @param {number} scale   0.5–1.0 shrink factor applied after aspect fit
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 */
export function parsePresetCrop(preset, scale, sourceWidth, sourceHeight) {
  const match = String(preset || "").match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const ratioW = Number(match[1]);
  const ratioH = Number(match[2]);
  if (ratioW <= 0 || ratioH <= 0) return null;

  // Largest rectangle with the target ratio that fits inside the source
  let cropW, cropH;
  if (sourceWidth / sourceHeight > ratioW / ratioH) {
    // Source is wider than target ratio — constrain by height
    cropH = sourceHeight;
    cropW = Math.round((ratioW / ratioH) * cropH);
  } else {
    // Source is taller — constrain by width
    cropW = sourceWidth;
    cropH = Math.round((ratioH / ratioW) * cropW);
  }

  // Apply scale (scale=1 → full fit, scale=0.5 → half)
  const clampedScale = Math.min(1, Math.max(0.1, Number(scale) || 1));
  cropW = Math.max(1, Math.round(cropW * clampedScale));
  cropH = Math.max(1, Math.round(cropH * clampedScale));

  const x1 = Math.round((sourceWidth - cropW) / 2);
  const y1 = Math.round((sourceHeight - cropH) / 2);
  return { x1, y1, x2: x1 + cropW, y2: y1 + cropH };
}

/**
 * Throws if bytes exceeds the allowed limit.
 */
export function guardSourceSize(bytes, maxBytes = MAX_SOURCE_BYTES) {
  if (bytes > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024);
    throw new Error(`Source image too large (limit ${mb} MB).`);
  }
}

/**
 * Maps a signed saturation amount to a {fn, amount} descriptor used by
 * executeOperations to pick saturate_hsl vs desaturate_hsl.
 */
export function clampSaturation(amount) {
  const clamped = Math.min(1, Math.max(-1, Number(amount) || 0));
  if (clamped >= 0) {
    return { fn: "saturate_hsl", amount: clamped };
  }
  return { fn: "desaturate_hsl", amount: -clamped };
}

// ─── Pixel helpers ────────────────────────────────────────────────────────────

/**
 * Applies a circular mask to raw RGBA pixel data in place.
 * Pixels outside the circle defined by (centerX, centerY, radius) are set to
 * fully transparent (alpha = 0). Returns the modified Uint8Array.
 */
function applyCircleMask(rawPixels, width, height, centerX, centerY, radius) {
  const data = new Uint8Array(rawPixels);
  const r2 = radius * radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > r2) {
        const idx = (y * width + x) * 4;
        data[idx + 3] = 0; // alpha = 0
      }
    }
  }
  return data;
}

// ─── Operator executor ───────────────────────────────────────────────────────

/**
 * Executes a list of derivation operations against a PhotonImage.
 * Mutates the image in place where possible; replaces it where Photon
 * returns a new instance (resize, crop).
 *
 * @param {object} photon   The @cf-wasm/photon module (passed in to allow mocking)
 * @param {object} img      PhotonImage instance
 * @param {Array}  operations
 * @returns {object} PhotonImage (may be a different instance than the input)
 */
export function executeOperations(photon, img, operations) {
  if (!Array.isArray(operations)) return img;

  let current = img;

  for (const op of operations) {
    const p = op.params || {};
    switch (op.type) {
      case "source":
        // No-op — asset binding only, handled before this call
        break;

      case "resize": {
        const w = Math.max(1, Math.round(Number(p.width) || 1));
        const h = Math.max(1, Math.round(Number(p.height) || 1));
        // SamplingFilter: 1=Nearest 2=Triangle 3=CatmullRom 4=Gaussian 5=Lanczos3
        const next = photon.resize(current, w, h, 5);
        if (next !== current) {
          current.free();
          current = next;
        }
        break;
      }

      case "crop": {
        const w = Math.max(1, Math.round(Number(p.width) || 1));
        const h = Math.max(1, Math.round(Number(p.height) || 1));
        const srcW = current.get_width();
        const srcH = current.get_height();
        const x1 = Math.round((srcW - w) / 2);
        const y1 = Math.round((srcH - h) / 2);
        const x2 = Math.min(srcW, x1 + w);
        const y2 = Math.min(srcH, y1 + h);
        const next = photon.crop(current, x1, y1, x2, y2);
        if (next !== current) {
          current.free();
          current = next;
        }
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

      case "sepia":
        photon.sepia(current);
        break;

      case "colorBoost": {
        const contrast = Math.min(
          100,
          Math.max(-100, Number(p.contrast || 0) * 100),
        );
        photon.adjust_contrast(current, contrast);
        // Approximate vibrance with a saturation nudge
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
          const next = photon.crop(
            current,
            coords.x1,
            coords.y1,
            coords.x2,
            coords.y2,
          );
          if (next !== current) {
            current.free();
            current = next;
          }
        }
        break;
      }

      case "cropCircle": {
        const srcW = current.get_width();
        const srcH = current.get_height();
        const diameter = Math.max(
          1,
          Math.round(Number(p.diameter) || Math.min(srcW, srcH)),
        );
        const radius = diameter / 2;
        const cx =
          p.centerX != null ? (Number(p.centerX) / 100) * srcW : srcW / 2;
        const cy =
          p.centerY != null ? (Number(p.centerY) / 100) * srcH : srcH / 2;
        // Photon exposes get_raw_pixels() → Uint8Array (RGBA) and a constructor
        // that takes raw pixels + dimensions
        const raw = current.get_raw_pixels();
        const masked = applyCircleMask(raw, srcW, srcH, cx, cy, radius);
        const next = new photon.PhotonImage(masked, srcW, srcH);
        current.free();
        current = next;
        break;
      }

      case "textOverlay": {
        // typeface param is accepted but ignored — only Roboto is available
        const text = String(p.text || "");
        if (!text) break;
        const srcW = current.get_width();
        const srcH = current.get_height();
        const xPx = Math.round((Number(p.x) || 0) * srcW);
        const yPx = Math.round((Number(p.y) || 0) * srcH);
        const size = Math.max(6, Math.min(200, Number(p.size) || 24));
        photon.draw_text(current, text, xPx, yPx, size);
        break;
      }

      default:
        // Unknown operator — skip silently (no error, keeps pipeline resilient)
        break;
    }
  }

  return current;
}

/**
 * Serialize a PhotonImage to bytes.
 * @param {object} img    PhotonImage
 * @param {"jpeg"|"png"} format
 * @returns {Uint8Array}
 */
export function serializeImage(img, format) {
  if (format === "png") {
    return img.get_bytes();
  }
  return img.get_bytes_jpeg(JPEG_QUALITY);
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/xyzzy/articulate-universe/main
npm test -- --test-name-pattern="resolveOutputFormat|parsePresetCrop|guardSourceSize|clampSaturation" 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
npm test 2>&1 | tail -10
```

Expected: same pass count as before + new tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/photonPipeline.js tests/photon-pipeline.test.js
git commit -m "feat: add photon pipeline helpers (resolveOutputFormat, parsePresetCrop, guardSourceSize, clampSaturation, executeOperations)"
```

---

## Task 3: Rewrite apply route to return image bytes

**Files:**

- Modify: `src/app/api/admin/derivations/apply/route.js`

The route stays edge runtime (no `export const runtime` change). It now fetches source bytes, runs the pipeline, and returns a binary image response instead of JSON.

- [ ] **Step 1: Rewrite the route**

Replace the entire content of `src/app/api/admin/derivations/apply/route.js`:

```js
import { requireAdmin } from "@/lib/adminRoute";
import { getDerivationById } from "@/lib/derivationsStore";
import { bindOperationsToAsset } from "@/lib/derivationEngine";
import {
  resolveOutputFormat,
  guardSourceSize,
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

  const { derivationId, asset, operations } = payload || {};
  if (!derivationId || !asset?.url) {
    return jsonError("derivationId and asset (with url) are required.");
  }

  const derivation = await getDerivationById(derivationId);
  if (!derivation) {
    return jsonError("Derivation not found.", 404);
  }

  // Resolve operations: caller-supplied overrides derivation defaults
  const baseOperations =
    Array.isArray(operations) && operations.length > 0
      ? operations
      : derivation.operations;
  const finalOperations = bindOperationsToAsset(baseOperations, asset.id);

  // Determine output format before fetching (cropCircle → PNG)
  const format = resolveOutputFormat(finalOperations);
  const contentType = format === "png" ? "image/png" : "image/jpeg";

  // Fetch source image
  let sourceBytes;
  try {
    const sourceResponse = await fetch(asset.url);
    if (!sourceResponse.ok) {
      return jsonError(
        `Could not fetch source image (HTTP ${sourceResponse.status}).`,
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
    let processed;
    try {
      processed = executeOperations(photon, img, finalOperations);
      outputBytes = serializeImage(processed, format);
    } finally {
      // Always free — processed may === img if no resize/crop was done
      if (processed && processed !== img) processed.free();
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
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /home/xyzzy/articulate-universe/main
npm run lint 2>&1 | grep -E "error|Error" | head -20
```

Expected: no new errors (existing 3 `@next/next/no-img-element` warnings are pre-existing and can be ignored).

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/derivations/apply/route.js
git commit -m "feat: rewrite derivations apply route to execute photon pipeline and return image bytes"
```

---

## Task 4: Update AdminMediaLibraryTab.js — preview + save

**Files:**

- Modify: `src/components/admin/AdminMediaLibraryTab.js`

Replace the JSON-response + localStorage pattern with:

1. Blob URL preview rendered in the derivation panel
2. "Save to library" that POSTs the blob to `/api/admin/upload`

The file is ~2650 lines. All changes are surgical — no restructuring.

- [ ] **Step 1: Replace state declarations**

Find and replace these state declarations (around line 309–310):

```js
// REMOVE these two lines:
const [lastDerivedAsset, setLastDerivedAsset] = useState(null);
const [savedDerivedAssets, setSavedDerivedAssets] = useState([]);
```

Replace with:

```js
const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
const [previewBlob, setPreviewBlob] = useState(null);
const [savingPreview, setSavingPreview] = useState(false);
const [savePreviewError, setSavePreviewError] = useState("");
```

- [ ] **Step 2: Remove the localStorage effects**

Find and remove both localStorage effects (around lines 419–434):

```js
// REMOVE this entire block:
useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem("savedDerivedAssets");
    if (stored) {
      setSavedDerivedAssets(JSON.parse(stored));
    }
  } catch {
    // ignore
  }
}, []);

useEffect(() => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    "savedDerivedAssets",
    JSON.stringify(savedDerivedAssets),
  );
}, [savedDerivedAssets]);
```

- [ ] **Step 3: Add blob URL cleanup effect**

After the existing `useEffect` that loads derivations (around line 417), add:

```js
// Revoke blob URL when component unmounts or a new preview replaces it
useEffect(() => {
  return () => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
  };
}, [previewBlobUrl]);
```

- [ ] **Step 4: Replace handleSaveDerivedAsset with savePreviewToLibrary**

Find and replace the entire `handleSaveDerivedAsset` function (around lines 1126–1139):

```js
// REMOVE:
function handleSaveDerivedAsset() {
  if (!lastDerivedAsset) return;
  const entry = {
    id:
      lastDerivedAsset.id ||
      `${selectedDerivationId || "derived"}-${Date.now()}`,
    title:
      lastDerivedAsset.title || selectedDerivation?.name || "Derived asset",
    url: lastDerivedAsset.url || "",
    operations: Array.isArray(lastDerivedAsset.operations)
      ? lastDerivedAsset.operations
      : [],
    timestamp: Date.now(),
  };
  setSavedDerivedAssets((current) => {
    const filtered = current.filter((item) => item.id !== entry.id);
    return [entry, ...filtered].slice(0, 20);
  });
}
```

Replace with:

```js
async function savePreviewToLibrary() {
  if (!previewBlob) return;
  setSavingPreview(true);
  setSavePreviewError("");
  try {
    const ext = previewBlob.type === "image/png" ? "png" : "jpg";
    const filename = `derived-${selectedDerivationId || "asset"}-${Date.now()}.${ext}`;
    const formData = new FormData();
    formData.append("file", previewBlob, filename);
    formData.append("backend", selectedUploadBackend);
    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) {
      throw new Error(
        json?.error ||
          t("admin.mediaDerivationSaveFailed", "Could not save derived asset."),
      );
    }
    const entry = buildUploadHistoryEntry({
      name: filename,
      status: "uploaded",
      detail: t(
        "admin.mediaDerivationApplied",
        "Derived asset saved to library",
      ),
      url: json.url || "",
      backend: selectedUploadBackend,
    });
    setUploadHistory((prev) => [entry, ...prev].slice(0, HISTORY_MAX_ENTRIES));
    setRefreshToken((n) => n + 1); // reload media library
  } catch (saveError) {
    setSavePreviewError(
      saveError instanceof Error
        ? saveError.message
        : t("admin.mediaDerivationSaveFailed", "Could not save derived asset."),
    );
  } finally {
    setSavingPreview(false);
  }
}
```

- [ ] **Step 5: Rewrite applySelectedDerivation to handle binary response**

Find and replace the entire `applySelectedDerivation` function (around lines 1141–1191):

```js
async function applySelectedDerivation() {
  if (!selectedDerivation || !focusedItem) {
    setDerivationError(
      t(
        "admin.mediaDerivationRequiresSelection",
        "Select a derivation and an asset first.",
      ),
    );
    return;
  }
  if (derivationUnboundParameters.length > 0) {
    setDerivationError(
      t(
        "admin.mediaDerivationFillParameters",
        "Fill all operation parameters before applying the derivation.",
      ),
    );
    return;
  }
  const operationsToApply = bindOperationsToAsset(
    customOperations,
    focusedItem?.id,
  );
  setApplyingDerivation(true);
  setDerivationError("");
  setSavePreviewError("");

  // Revoke previous blob URL before creating a new one
  if (previewBlobUrl) {
    URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl(null);
    setPreviewBlob(null);
  }

  try {
    const response = await fetch("/api/admin/derivations/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        derivationId: selectedDerivation.id,
        asset: focusedItem,
        operations: operationsToApply,
      }),
    });

    if (!response.ok) {
      // Error responses are JSON
      const json = await response.json().catch(() => ({}));
      throw new Error(
        json?.error ||
          t("admin.mediaDerivationFailed", "Could not apply derivation."),
      );
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    setPreviewBlob(blob);
    setPreviewBlobUrl(blobUrl);
  } catch (applyError) {
    setDerivationError(
      applyError instanceof Error
        ? applyError.message
        : t("admin.mediaDerivationFailed", "Could not apply derivation."),
    );
  } finally {
    setApplyingDerivation(false);
  }
}
```

- [ ] **Step 6: Update the derivation panel UI**

Find and replace the save button + savedDerivedAssets block using these exact strings as anchors.

**Remove** (exact text, lines ~2121–2189):

```jsx
<button
  type="button"
  onClick={handleSaveDerivedAsset}
  disabled={!lastDerivedAsset}
  className="px-3 py-1.5 rounded border text-[11px] bg-white disabled:opacity-50"
>
  {t("admin.mediaSaveDerivedAsset", "Save derived asset")}
</button>
```

**Replace with:**

```jsx
<button
  type="button"
  onClick={savePreviewToLibrary}
  disabled={!previewBlob || savingPreview}
  className="px-3 py-1.5 rounded border text-[11px] bg-white disabled:opacity-50"
>
  {savingPreview
    ? t("admin.mediaSavingDerivedAsset", "Saving…")
    : t("admin.mediaSaveDerivedAsset", "Save to library")}
</button>
```

Then find and remove the entire `savedDerivedAssets` block (exact anchor: starts with `{savedDerivedAssets.length > 0 && (`):

```jsx
{
  savedDerivedAssets.length > 0 && (
    <div className="rounded border border-indigo-100 bg-white p-3 space-y-2 text-[11px] text-gray-700">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-indigo-800">
          {t("admin.mediaDerivedAssetsHeading", "Saved derived assets")}
        </p>
      </div>
      <div className="space-y-2">
        {savedDerivedAssets.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-2 border rounded p-2 bg-indigo-50"
          >
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-indigo-800 truncate">
                {entry.title}
              </p>
              <p className="text-[11px] text-gray-600">
                {t("admin.mediaDerivedAssetSavedOn", "Saved on {time}", {
                  time: new Date(entry.timestamp).toLocaleString("sv-SE"),
                })}
              </p>
              <p className="text-[11px] text-gray-500">
                {t("admin.mediaDerivedAssetOperations", "Operations: {count}", {
                  count: entry.operations?.length || 0,
                })}
              </p>
            </div>
            {entry.url && (
              <a
                href={entry.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-purple-700 hover:underline"
              >
                {t("admin.mediaDerivedAssetOpen", "Open")}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Replace the removed block with** (inline blob preview — insert just before the closing `</div>` of the derivations section, i.e. the `</div>` on line ~2190):

```jsx
{
  previewBlobUrl && (
    <div className="rounded border border-indigo-100 bg-white p-3 space-y-2">
      <p className="text-[11px] font-semibold text-indigo-800">
        {t("admin.mediaDerivationPreview", "Preview")}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewBlobUrl}
        alt={t("admin.mediaDerivationPreviewAlt", "Derived image preview")}
        className="max-w-full rounded border"
        style={{ maxHeight: "260px", objectFit: "contain" }}
      />
      {savePreviewError && (
        <p className="text-[11px] text-red-600">{savePreviewError}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add missing i18n keys**

In `src/lib/i18n/en.json`, `sv.json`, `es.json` — add these keys after the existing `"mediaSaveDerivedAsset"` key (line ~392 in en.json) as an anchor:

**en.json** (insert after `"mediaSaveDerivedAsset": "Save derived asset",`):

```json
"mediaDerivationPreview": "Preview",
"mediaDerivationPreviewAlt": "Derived image preview",
"mediaSavingDerivedAsset": "Saving…",
```

**sv.json** (insert after the same key):

```json
"mediaDerivationPreview": "Förhandsvisning",
"mediaDerivationPreviewAlt": "Förhandsgranskning av härledd bild",
"mediaSavingDerivedAsset": "Sparar…",
```

**es.json** (insert after the same key):

```json
"mediaDerivationPreview": "Vista previa",
"mediaDerivationPreviewAlt": "Vista previa de imagen derivada",
"mediaSavingDerivedAsset": "Guardando…",
```

- [ ] **Step 8: Verify lint passes**

```bash
cd /home/xyzzy/articulate-universe/main
npm run lint 2>&1 | grep -E " error " | head -20
```

Expected: no new errors.

- [ ] **Step 9: Run full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/components/admin/AdminMediaLibraryTab.js src/lib/i18n/en.json src/lib/i18n/sv.json src/lib/i18n/es.json
git commit -m "feat: wire photon preview + save-to-library flow in media library derivations panel"
```

---

## Task 5: WebP output + AVIF source rejection

**Files:**

- Modify: `src/lib/photonPipeline.js` — add `webp` to `serializeImage`, export `isAvifSource`
- Modify: `src/app/api/admin/derivations/apply/route.js` — accept `format` body param, reject AVIF source early
- Modify: `tests/photon-pipeline.test.js` — add WebP and AVIF tests

- [ ] **Step 1: Add tests for the new helpers**

Append to `tests/photon-pipeline.test.js`:

```js
describe("resolveOutputFormat with explicit format override", () => {
  it("returns webp when caller requests it explicitly", () => {
    assert.equal(resolveOutputFormat([], "webp"), "webp");
  });

  it("still returns png for cropCircle even if webp requested", () => {
    // cropCircle requires transparency — png wins
    assert.equal(resolveOutputFormat([{ type: "cropCircle" }], "webp"), "png");
  });

  it("falls back to jpeg when override is unknown", () => {
    assert.equal(resolveOutputFormat([], "avif"), "jpeg");
  });
});

describe("isAvifSource", () => {
  it("returns true for image/avif content type", () => {
    const { isAvifSource } = await import("../src/lib/photonPipeline.js");
    assert.equal(isAvifSource("image/avif"), true);
  });

  it("returns false for image/jpeg", () => {
    const { isAvifSource } = await import("../src/lib/photonPipeline.js");
    assert.equal(isAvifSource("image/jpeg"), false);
  });

  it("returns false for empty string", () => {
    const { isAvifSource } = await import("../src/lib/photonPipeline.js");
    assert.equal(isAvifSource(""), false);
  });
});
```

Note: the `isAvifSource` tests use dynamic import because the function will be added in Step 2. Update the static import at the top of the test file to also include `isAvifSource`:

```js
import {
  resolveOutputFormat,
  parsePresetCrop,
  guardSourceSize,
  clampSaturation,
  isAvifSource,
} from "../src/lib/photonPipeline.js";
```

Then remove the three dynamic `import()` calls inside the `isAvifSource` describe block and use the statically imported `isAvifSource` directly.

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/xyzzy/articulate-universe/main
npm test 2>&1 | tail -15
```

Expected: new tests fail (`isAvifSource is not a function`, `resolveOutputFormat` with 2 args returns wrong value).

- [ ] **Step 3: Update photonPipeline.js**

Update `resolveOutputFormat` to accept an optional second `requestedFormat` parameter:

```js
export function resolveOutputFormat(operations, requestedFormat) {
  // cropCircle requires transparency — PNG always wins
  if (
    Array.isArray(operations) &&
    operations.some((op) => op.type === "cropCircle")
  ) {
    return "png";
  }
  if (requestedFormat === "webp") return "webp";
  if (requestedFormat === "png") return "png";
  return "jpeg";
}
```

Add `isAvifSource` as a new export after `guardSourceSize`:

```js
export function isAvifSource(contentType) {
  return String(contentType || "")
    .toLowerCase()
    .includes("avif");
}
```

Update `serializeImage` to handle `webp`:

```js
export function serializeImage(img, format) {
  if (format === "png") return img.get_bytes();
  if (format === "webp") return img.get_bytes_webp();
  return img.get_bytes_jpeg(JPEG_QUALITY);
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Update apply route to accept `format` param and reject AVIF source**

In `src/app/api/admin/derivations/apply/route.js`:

1. Add `isAvifSource` to the import from `@/lib/photonPipeline`:

```js
import {
  resolveOutputFormat,
  guardSourceSize,
  executeOperations,
  serializeImage,
  isAvifSource,
} from "@/lib/photonPipeline";
```

2. Destructure `format` from payload:

```js
const {
  derivationId,
  asset,
  operations,
  format: requestedFormat,
} = payload || {};
```

3. Pass `requestedFormat` to `resolveOutputFormat`:

```js
const format = resolveOutputFormat(finalOperations, requestedFormat);
```

4. After fetching source bytes and before loading into Photon, add the AVIF guard. Insert this block right after `guardSourceSize(buffer.byteLength, MAX_SOURCE_BYTES);`:

```js
const sourceContentType = sourceResponse.headers.get("content-type") || "";
if (isAvifSource(sourceContentType)) {
  return jsonError(
    "AVIF source images are not supported — convert to JPEG, PNG, or WebP first.",
  );
}
```

- [ ] **Step 6: Run lint and tests**

```bash
cd /home/xyzzy/articulate-universe/main
npm run lint 2>&1 | grep " error " | head -10
npm test 2>&1 | tail -10
```

Expected: no lint errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/photonPipeline.js src/app/api/admin/derivations/apply/route.js tests/photon-pipeline.test.js
git commit -m "feat: add WebP output format and AVIF source rejection to photon pipeline"
```

---

## Final verification

- [ ] **Build check**

```bash
cd /home/xyzzy/articulate-universe/main
npm run build 2>&1 | tail -20
```

Expected: build succeeds. (Note: intermittent WordPress/GraphQL fetch noise during static generation is pre-existing and not a failure.)

- [ ] **Final commit if build required any fixes**

Only if the build produced fixable errors. Otherwise skip.
