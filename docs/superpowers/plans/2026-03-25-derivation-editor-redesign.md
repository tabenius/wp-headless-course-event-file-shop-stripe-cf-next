# Derivation Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat dropdown derivation editor with a categorized visual grid picker, slider controls, and drag-and-drop pipeline — exposing all 22 photon operations in the admin GUI.

**Architecture:** Extract derivation editor from AdminMediaLibraryTab.js into a `DerivationEditor/` component tree (7 files). Add 12 missing operation schemas to a new `operationRegistry.js`. Update photonPipeline.js for brightness scaling and sepia/grayscale/invert intensity blending.

**Tech Stack:** React (Next.js App Router), HTML5 Drag and Drop API, HTML range inputs, existing Tailwind/admin CSS patterns.

**Spec:** `docs/superpowers/specs/2026-03-25-derivation-editor-redesign-design.md`

---

### Task 1: Create operationRegistry.js — all 22 operation schemas + categories

**Files:**
- Create: `src/components/admin/DerivationEditor/operationRegistry.js`
- Modify: `src/lib/derivationEngine.js` (re-export from registry)

This is the data foundation. All 22 user-facing operations with their parameter schemas, category assignments, and icon mappings. Pure data, no JSX.

- [ ] **Step 1: Create operationRegistry.js**

```js
// src/components/admin/DerivationEditor/operationRegistry.js

/**
 * All 22 user-facing photon pipeline operations with full parameter schemas,
 * category assignments, icon mappings, and dual-level descriptions.
 *
 * Each operation has:
 *   - `tip`: friendly description for non-technical users
 *   - `techTip`: technical description for developers / power users
 * Both are shown as tooltips in the grid picker.
 *
 * `source` is an internal binding mechanism — not included here.
 * It remains in derivationEngine.js for pipeline use.
 */

export const CATEGORIES = {
  transform: { label: "Transform", color: "blue" },
  colorTone: { label: "Color & Tone", color: "amber" },
  effects: { label: "Effects", color: "purple" },
  artistic: { label: "Artistic", color: "rose" },
};

export const PRESET_CROP_PRESETS = [
  { value: "4:5", label: "4:5 portrait" },
  { value: "1:1", label: "Instagram square" },
  { value: "9:16", label: "Stories (9:16)" },
  { value: "3:4", label: "Tower" },
  { value: "16:9", label: "Banner" },
  { value: "2:1", label: "Hero (2:1)" },
  { value: "21:9", label: "Ultra-wide (21:9)" },
];

export const OPERATION_REGISTRY = {
  // ── Transform ──────────────────────────────────────────────
  crop: {
    label: "Crop",
    category: "transform",
    icon: "\u2702",
    tip: "Cut away the edges to keep only the part you want",
    techTip: "Center-crop to exact pixel dimensions",
    parameters: [
      { key: "width", label: "Width", type: "number", min: 32, max: 4000, step: 1 },
      { key: "height", label: "Height", type: "number", min: 32, max: 4000, step: 1 },
    ],
  },
  resize: {
    label: "Resize",
    category: "transform",
    icon: "\u21F2",
    tip: "Make the image bigger or smaller",
    techTip: "Scale to target dimensions using Lanczos3 resampling",
    parameters: [
      { key: "width", label: "Width", type: "number", min: 64, max: 4000, step: 1 },
      { key: "height", label: "Height", type: "number", min: 64, max: 4000, step: 1 },
    ],
  },
  presetCrop: {
    label: "Preset crop",
    category: "transform",
    icon: "\u25A3",
    tip: "Crop to a standard shape like square, banner, or portrait",
    techTip: "Crop to aspect ratio preset with optional scale factor",
    parameters: [
      { key: "preset", label: "Aspect", type: "select", options: PRESET_CROP_PRESETS },
      { key: "scale", label: "Scale", type: "number", min: 0.5, max: 1, step: 0.05 },
    ],
  },
  flip: {
    label: "Flip",
    category: "transform",
    icon: "\u21C4",
    tip: "Flip the image like a mirror — left-to-right or top-to-bottom",
    techTip: "Mirror along horizontal or vertical axis",
    parameters: [
      { key: "direction", label: "Direction", type: "select", options: [
        { value: "h", label: "Horizontal" },
        { value: "v", label: "Vertical" },
      ]},
    ],
  },
  rotate: {
    label: "Rotate",
    category: "transform",
    icon: "\u21BB",
    tip: "Turn the image — quarter turn, half turn, or any angle",
    techTip: "Rotate by arbitrary degrees (90/180/270 shortcuts available)",
    parameters: [
      { key: "degrees", label: "Degrees", type: "number", min: 0, max: 360, step: 1,
        shortcuts: [90, 180, 270] },
    ],
  },
  padding: {
    label: "Padding",
    category: "transform",
    icon: "\u25A1",
    tip: "Add a colored border around the whole image — like a picture frame",
    techTip: "Add uniform pixel padding with RGBA fill color",
    parameters: [
      { key: "padding", label: "Size (px)", type: "number", min: 0, max: 500, step: 1 },
      { key: "r", label: "Red", type: "number", min: 0, max: 255, step: 1 },
      { key: "g", label: "Green", type: "number", min: 0, max: 255, step: 1 },
      { key: "b", label: "Blue", type: "number", min: 0, max: 255, step: 1 },
      { key: "a", label: "Alpha", type: "number", min: 0, max: 255, step: 1 },
    ],
  },

  // ── Color & Tone ───────────────────────────────────────────
  brightness: {
    label: "Brightness",
    category: "colorTone",
    icon: "\u2600",
    tip: "Make the image lighter or darker",
    techTip: "Adjust brightness (normalized -1..1, scaled to 0-255 in pipeline)",
    parameters: [
      { key: "amount", label: "Amount", type: "number", min: -1, max: 1, step: 0.05 },
    ],
  },
  saturation: {
    label: "Saturation",
    category: "colorTone",
    icon: "\uD83C\uDF08",
    tip: "Make colors more vivid or more muted",
    techTip: "Adjust color saturation (-1 = fully desaturated, +1 = maximum saturation)",
    parameters: [
      { key: "amount", label: "Amount", type: "number", min: -1, max: 1, step: 0.05 },
    ],
  },
  colorBoost: {
    label: "Color boost",
    category: "colorTone",
    icon: "\uD83C\uDFA8",
    tip: "Make colors pop — boosts color richness and contrast together",
    techTip: "Combined vibrance (selective saturation) + contrast adjustment",
    parameters: [
      { key: "vibrance", label: "Vibrance", type: "number", min: -1, max: 1, step: 0.05 },
      { key: "contrast", label: "Contrast", type: "number", min: -1, max: 1, step: 0.05 },
    ],
  },
  hueRotate: {
    label: "Hue rotate",
    category: "colorTone",
    icon: "\uD83D\uDD04",
    tip: "Shift all colors around the color wheel — red becomes blue, blue becomes green, etc.",
    techTip: "Rotate hue in HSL color space (0-360 degrees)",
    parameters: [
      { key: "degrees", label: "Degrees", type: "number", min: 0, max: 360, step: 1 },
    ],
  },
  tint: {
    label: "Tint",
    category: "colorTone",
    icon: "\uD83D\uDCA7",
    tip: "Add a subtle color wash over the whole image — like looking through tinted glass",
    techTip: "Apply per-channel RGB tint offset (-255..+255 per channel)",
    parameters: [
      { key: "r", label: "Red", type: "number", min: -255, max: 255, step: 1 },
      { key: "g", label: "Green", type: "number", min: -255, max: 255, step: 1 },
      { key: "b", label: "Blue", type: "number", min: -255, max: 255, step: 1 },
    ],
  },
  grayscale: {
    label: "Grayscale",
    category: "colorTone",
    icon: "\u25D1",
    tip: "Turn the image black and white — slide to control how much color remains",
    techTip: "Human-corrected grayscale conversion with variable intensity blend",
    parameters: [
      { key: "amount", label: "Intensity", type: "number", min: 0, max: 1, step: 0.05 },
    ],
  },
  invert: {
    label: "Invert",
    category: "colorTone",
    icon: "\u25D0",
    tip: "Swap all colors to their opposite — like a photo negative",
    techTip: "Invert RGB channels with variable intensity blend",
    parameters: [
      { key: "amount", label: "Intensity", type: "number", min: 0, max: 1, step: 0.05 },
    ],
  },

  // ── Effects ────────────────────────────────────────────────
  sharpen: {
    label: "Sharpen",
    category: "effects",
    icon: "\u25C8",
    tip: "Make the image crisper and more detailed",
    techTip: "Unsharp mask sharpening filter",
    parameters: [],
  },
  blur: {
    label: "Blur",
    category: "effects",
    icon: "\uD83C\uDF2B",
    tip: "Soften the image — great for backgrounds or dreamy effects",
    techTip: "Gaussian blur with configurable pixel radius",
    parameters: [
      { key: "radius", label: "Radius", type: "number", min: 1, max: 20, step: 1 },
    ],
  },
  sepia: {
    label: "Sepia",
    category: "effects",
    icon: "\uD83D\uDCDC",
    tip: "Give the image a warm, old-fashioned brownish look — like an antique photo",
    techTip: "Sepia tone filter with variable intensity blend (0-1)",
    parameters: [
      { key: "amount", label: "Intensity", type: "number", min: 0, max: 1, step: 0.05 },
    ],
  },
  solarize: {
    label: "Solarize",
    category: "effects",
    icon: "\u26A1",
    tip: "Create a surreal, overexposed look — like staring at the sun",
    techTip: "Solarize: invert tones above a threshold for Sabattier effect",
    parameters: [],
  },
  pixelize: {
    label: "Pixelize",
    category: "effects",
    icon: "\u25A6",
    tip: "Turn the image into chunky blocks — like a retro video game",
    techTip: "Pixelation: average color per NxN block (block size 2-50px)",
    parameters: [
      { key: "size", label: "Block size", type: "number", min: 2, max: 50, step: 1 },
    ],
  },

  // ── Artistic ───────────────────────────────────────────────
  duotone: {
    label: "Duotone",
    category: "artistic",
    icon: "\u25D3",
    tip: "Recolor the image using just two colors — pick a highlight and a shadow color",
    techTip: "Duotone: map luminance to two RGB endpoints via linear interpolation",
    parameters: [
      { key: "color1", label: "Highlight", type: "color", defaultValue: { r: 255, g: 255, b: 255 } },
      { key: "color2", label: "Shadow", type: "color", defaultValue: { r: 0, g: 0, b: 0 } },
    ],
  },
  oil: {
    label: "Oil painting",
    category: "artistic",
    icon: "\uD83D\uDD8C",
    tip: "Make the photo look like a painting with thick, swirly brush strokes",
    techTip: "Oil painting simulation: radius (1-5) and intensity (10-60) control brush size and smoothing",
    parameters: [
      { key: "radius", label: "Radius", type: "number", min: 1, max: 5, step: 1 },
      { key: "intensity", label: "Intensity", type: "number", min: 10, max: 60, step: 1 },
    ],
  },
  cropCircle: {
    label: "Circle crop",
    category: "artistic",
    icon: "\u25EF",
    tip: "Cut the image into a circle — perfect for profile pictures",
    techTip: "Circular mask crop with configurable diameter and center offset, outputs PNG with alpha",
    parameters: [
      { key: "diameter", label: "Diameter", type: "number", min: 32, max: 4000, step: 1 },
      { key: "centerX", label: "Center X (%)", type: "number", min: 0, max: 100, step: 1 },
      { key: "centerY", label: "Center Y (%)", type: "number", min: 0, max: 100, step: 1 },
    ],
  },
  textOverlay: {
    label: "Text overlay",
    category: "artistic",
    icon: "\uD83D\uDD24",
    tip: "Write text on the image — add a caption, watermark, or title",
    techTip: "Rasterize text at (x,y) normalized coordinates, configurable size in pt",
    parameters: [
      { key: "text", label: "Text", type: "text" },
      { key: "x", label: "X (0-1)", type: "number", min: 0, max: 1, step: 0.01 },
      { key: "y", label: "Y (0-1)", type: "number", min: 0, max: 1, step: 0.01 },
      { key: "typeface", label: "Typeface", type: "text" },
      { key: "size", label: "Size (pt)", type: "number", min: 6, max: 200, step: 1 },
    ],
  },
};

/** Get operations grouped by category, in display order. */
export function getOperationsByCategory() {
  const groups = {};
  for (const [type, schema] of Object.entries(OPERATION_REGISTRY)) {
    const cat = schema.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ type, ...schema });
  }
  // Return in fixed order
  return ["transform", "colorTone", "effects", "artistic"].map((cat) => ({
    ...CATEGORIES[cat],
    key: cat,
    operations: groups[cat] || [],
  }));
}

/** Build default params for an operation type. */
export function buildDefaultParams(type) {
  const schema = OPERATION_REGISTRY[type];
  if (!schema) return {};
  const params = {};
  for (const p of schema.parameters) {
    if (p.type === "number") {
      // Sensible defaults: midpoint for sliders, or specific overrides
      if (p.key === "x" || p.key === "y") params[p.key] = 0.5;
      else if (p.key === "size" && p.min === 6) params[p.key] = 24; // text size
      else if (p.key === "amount" && p.min === 0) params[p.key] = 1; // intensity defaults to full
      else if (p.key === "amount" && p.min < 0) params[p.key] = 0; // brightness default neutral
      else if (p.key === "degrees" && p.max === 360) params[p.key] = 90;
      else params[p.key] = p.min ?? 0;
    } else if (p.type === "select") {
      params[p.key] = p.options?.[0]?.value ?? "";
    } else if (p.type === "color") {
      params[p.key] = p.defaultValue ?? { r: 0, g: 0, b: 0 };
    } else if (p.type === "text") {
      if (p.key === "typeface") params[p.key] = "Inter";
      else if (p.key === "text") params[p.key] = "Caption";
      else params[p.key] = "";
    }
  }
  return params;
}
```

- [ ] **Step 2: Update derivationEngine.js to re-export from registry**

In `src/lib/derivationEngine.js`, replace the inline `OPERATION_SCHEMAS` with a re-export that maps the registry back to the original shape (so existing code that imports `OPERATION_SCHEMAS` from derivationEngine keeps working):

```js
// At top of derivationEngine.js, replace lines 1-83:
import { OPERATION_REGISTRY } from "@/components/admin/DerivationEditor/operationRegistry";

// Re-export in the legacy shape for backward compat (route.js, helpers, etc.)
// The registry adds category/icon/tip/techTip; OPERATION_SCHEMAS strips those.
// Note: presetCrop.preset changes from type:"text" to type:"select" — no existing
// code branches on param.type for this field (verified via grep).
export const OPERATION_SCHEMAS = Object.fromEntries(
  Object.entries(OPERATION_REGISTRY).map(([type, { label, parameters }]) => [
    type, { label, parameters },
  ])
);
// Also include source (internal, not in registry)
OPERATION_SCHEMAS.source = {
  label: "Source asset",
  parameters: [{ key: "assetId", label: "Asset ID", type: "text" }],
};
```

Keep all other exports (`cloneOperations`, `bindOperationsToAsset`, `validateDerivationPayload`, `buildDerivedAsset`) unchanged.

- [ ] **Step 3: Verify existing imports still work**

Run: `npm run cf:build`
Expected: Build passes — all existing code importing OPERATION_SCHEMAS from derivationEngine.js still works.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/DerivationEditor/operationRegistry.js src/lib/derivationEngine.js
git commit -m "feat: add operationRegistry with all 22 operations + categories"
```

---

### Task 2: Update photonPipeline.js — brightness scaling + intensity blending

**Files:**
- Modify: `src/lib/photonPipeline.js`

Three pipeline changes: (1) brightness amount * 255 scaling with backward compat, (2) sepia intensity blending, (3) grayscale + invert intensity blending.

- [ ] **Step 1: Add brightness scaling**

In `src/lib/photonPipeline.js`, replace the brightness case (lines 254-258):

```js
case "brightness": {
  let raw = Number(p.amount) || 0;
  // New UI sends normalized -1..1; pipeline needs integer -255..255.
  // Backward compat: old derivations stored raw integers (e.g. 50, -100).
  // Heuristic: |value| <= 1 means normalized (multiply by 255).
  // Boundary values (-1, 0, 1) are acceptable either way:
  //   0 * 255 = 0 (no change regardless)
  //   1 * 255 = 255 vs raw 1 ≈ imperceptible difference
  //  -1 * 255 = -255 vs raw -1 ≈ imperceptible difference
  if (Math.abs(raw) <= 1) raw = raw * 255;
  const amount = Math.round(Math.min(255, Math.max(-255, raw)));
  photon.adjust_brightness(current, amount);
  break;
}
```

- [ ] **Step 2: Add blendWithOriginal helper at top of pipeline**

Add this helper function near the top of `photonPipeline.js` (before the main switch block, inside or alongside the existing helper functions). Photon WASM does not expose `blend()` or `replicate()`, so we blend manually via raw pixel data:

```js
/**
 * Blend an effect at partial intensity by interpolating between
 * original and processed pixel data.
 * @param {PhotonImage} current - the image (will be mutated by effectFn)
 * @param {Function} effectFn - function that applies effect to a PhotonImage in-place
 * @param {number} amount - blend factor 0..1 (0 = no effect, 1 = full effect)
 * @param {object} photon - photon module reference
 */
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
  // Return the new image — caller must reassign `current`
  return next;
}
```

Note: this function returns a new `PhotonImage` when blending (amount < 1). The caller must do `current = blendWithOriginal(...)` or handle the return value. When amount >= 1, it mutates in place and returns undefined.

- [ ] **Step 3: Add sepia intensity blending**

Replace the sepia case (lines 198-200):

```js
case "sepia": {
  const amount = Number(p.amount ?? 1);
  const result = blendWithOriginal(
    current, (img) => photon.sepia(img), amount, photon
  );
  if (result) current = result;
  break;
}
```

- [ ] **Step 4: Add grayscale intensity blending**

Replace the grayscale case (lines 260-263):

```js
case "grayscale": {
  const amount = Number(p.amount ?? 1);
  const result = blendWithOriginal(
    current, (img) => photon.grayscale_human_corrected(img), amount, photon
  );
  if (result) current = result;
  break;
}
```

- [ ] **Step 5: Add invert intensity blending**

Replace the invert case (lines 315-317):

```js
case "invert": {
  const amount = Number(p.amount ?? 1);
  const result = blendWithOriginal(
    current, (img) => photon.invert(img), amount, photon
  );
  if (result) current = result;
  break;
}
```

- [ ] **Step 6: Verify build**

Run: `npm run cf:build`
Expected: Build passes. Existing derivations with no `amount` param default to 1.0 (full strength).

- [ ] **Step 7: Commit**

```bash
git add src/lib/photonPipeline.js
git commit -m "feat: brightness scaling + sepia/grayscale/invert intensity blending"
```

---

### Task 3: Create OperationGridPicker component

**Files:**
- Create: `src/components/admin/DerivationEditor/OperationGridPicker.js`

The categorized icon grid that replaces the flat dropdown. Clicking a tile adds the operation.

- [ ] **Step 1: Create OperationGridPicker.js**

```jsx
"use client";
import { getOperationsByCategory, CATEGORIES } from "./operationRegistry";

const categoryGroups = getOperationsByCategory();

// Category border colors for left accent
const borderColors = {
  blue: "border-blue-400",
  amber: "border-amber-400",
  purple: "border-purple-400",
  rose: "border-rose-400",
};

export default function OperationGridPicker({ onAddOperation }) {
  return (
    <div className="space-y-3">
      {categoryGroups.map((group) => (
        <div key={group.key}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
            {group.label}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {group.operations.map((op) => (
              <button
                key={op.type}
                type="button"
                title={`${op.tip}\n\n${op.techTip}`}
                onClick={() => onAddOperation(op.type)}
                className={
                  "flex flex-col items-center justify-center w-16 h-16 rounded-lg border " +
                  "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 " +
                  "hover:scale-105 hover:shadow-md active:scale-95 " +
                  "transition-all duration-150 cursor-pointer select-none " +
                  "border-l-2 " + (borderColors[group.color] || "border-gray-300")
                }
              >
                <span className="text-xl leading-none">{op.icon}</span>
                <span className="text-[10px] mt-0.5 text-gray-600 dark:text-gray-300 truncate max-w-[56px]">
                  {op.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npm run cf:build`
Expected: Build passes (component not yet imported anywhere, but file is valid).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/DerivationEditor/OperationGridPicker.js
git commit -m "feat: add OperationGridPicker — categorized icon grid for 22 operations"
```

---

### Task 4: Create OperationCard component with slider parameters

**Files:**
- Create: `src/components/admin/DerivationEditor/OperationCard.js`

Single pipeline step card: collapsible, drag handle, category accent, slider/select/text/color parameter inputs.

- [ ] **Step 1: Create OperationCard.js**

```jsx
"use client";
import { useState } from "react";
import { OPERATION_REGISTRY, CATEGORIES } from "./operationRegistry";

const borderColors = {
  blue: "border-l-blue-400",
  amber: "border-l-amber-400",
  purple: "border-l-purple-400",
  rose: "border-l-rose-400",
};

/** Convert {r,g,b} → "#rrggbb" */
function rgbToHex({ r, g, b }) {
  const h = (v) => Math.max(0, Math.min(255, v || 0)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Convert "#rrggbb" → {r,g,b} */
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function isInvalid(param, value) {
  if (param.type !== "number") return false;
  const n = Number(value);
  if (isNaN(n)) return true;
  if (param.min != null && n < param.min) return true;
  if (param.max != null && n > param.max) return true;
  return false;
}

function ParamSummary({ schema, params }) {
  if (!schema?.parameters?.length) return <span className="text-gray-400">—</span>;
  return (
    <span className="text-xs text-gray-500 truncate">
      {schema.parameters.slice(0, 3).map((p) => {
        const v = params[p.key];
        if (v == null || v === "") return null;
        const display = typeof v === "object" ? rgbToHex(v) : String(v);
        return `${p.label}: ${display}`;
      }).filter(Boolean).join(", ")}
    </span>
  );
}

export default function OperationCard({
  index,
  operation,
  expanded,
  onToggle,
  onParamChange,
  onRemove,
  dragHandleProps,
}) {
  const schema = OPERATION_REGISTRY[operation.type];
  const cat = schema ? CATEGORIES[schema.category] : null;
  const accent = cat ? borderColors[cat.color] || "" : "";

  return (
    <div className={
      "border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 " +
      "border-l-4 " + accent
    }>
      {/* Header — always visible */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Drag handle */}
        <span
          {...(dragHandleProps || {})}
          className="text-gray-400 cursor-grab active:cursor-grabbing px-0.5"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </span>

        {/* Step number + name */}
        <span className="text-xs font-medium text-gray-500 w-5">{index + 1}.</span>
        <span className="text-sm font-medium">
          {schema?.icon} {schema?.label || operation.type}
        </span>

        {/* Collapsed param summary */}
        {!expanded && <ParamSummary schema={schema} params={operation.params} />}

        {/* Spacer + remove */}
        <span className="flex-1" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-gray-400 hover:text-red-500 text-sm px-1"
          title="Remove step"
        >
          ✕
        </button>
      </div>

      {/* Expanded params */}
      {expanded && schema?.parameters?.length > 0 && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-gray-100 dark:border-gray-700">
          {schema.parameters.map((param) => (
            <ParamInput
              key={param.key}
              param={param}
              value={operation.params[param.key]}
              onChange={(val) => onParamChange(param.key, val)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParamInput({ param, value, onChange }) {
  if (param.type === "select") {
    return (
      <label className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-20 shrink-0">{param.label}</span>
        {param.options?.length <= 3 ? (
          // Segmented toggle for small option sets
          <div className="flex gap-1">
            {param.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={
                  "px-2 py-0.5 text-xs rounded border transition-colors " +
                  (value === opt.value
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-blue-300")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700"
          >
            {param.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </label>
    );
  }

  if (param.type === "color") {
    // Color picker for {r,g,b} objects (duotone)
    const hex = typeof value === "object" ? rgbToHex(value) : "#000000";
    return (
      <label className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-20 shrink-0">{param.label}</span>
        <div
          className="w-6 h-6 rounded border border-gray-300"
          style={{ backgroundColor: hex }}
        />
        <input
          type="text"
          value={hex}
          onChange={(e) => {
            const rgb = hexToRgb(e.target.value);
            onChange(rgb);
          }}
          className="w-20 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5"
          placeholder="#000000"
        />
      </label>
    );
  }

  if (param.type === "text") {
    return (
      <label className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-20 shrink-0">{param.label}</span>
        <input
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-700"
        />
      </label>
    );
  }

  // Number — range slider + editable value
  const numVal = Number(value ?? param.min ?? 0);
  const invalid = isInvalid(param, value);

  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 shrink-0">{param.label}</span>
      {/* Shortcut buttons (e.g. rotate 90/180/270) */}
      {param.shortcuts ? (
        <div className="flex gap-1 mr-1">
          {param.shortcuts.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className={
                "px-1.5 py-0.5 text-xs rounded border transition-colors " +
                (numVal === s
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-blue-300")
              }
            >
              {s}°
            </button>
          ))}
        </div>
      ) : null}
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={numVal}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 accent-blue-500"
      />
      <input
        type="number"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={
          "w-16 text-xs text-right font-mono border rounded px-1 py-0.5 " +
          (invalid
            ? "border-red-400 bg-red-50 dark:bg-red-900/20"
            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700")
        }
      />
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/DerivationEditor/OperationCard.js
git commit -m "feat: add OperationCard — collapsible step card with slider/select/color params"
```

---

### Task 5: Create OperationPipeline with drag-and-drop

**Files:**
- Create: `src/components/admin/DerivationEditor/OperationPipeline.js`

Ordered list of OperationCards with HTML5 drag-and-drop reordering.

- [ ] **Step 1: Create OperationPipeline.js**

```jsx
"use client";
import { useState, useRef, useCallback } from "react";
import OperationCard from "./OperationCard";

export default function OperationPipeline({
  operations,
  expandedIndex,
  onToggleExpand,
  onParamChange,
  onRemove,
  onReorder,
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const containerRef = useRef(null);

  const handleDragStart = useCallback((e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex == null) return;
    setDropTarget(index);
  }, [dragIndex]);

  const handleDrop = useCallback((e, toIndex) => {
    e.preventDefault();
    if (dragIndex != null && dragIndex !== toIndex) {
      onReorder(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDropTarget(null);
  }, [dragIndex, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  if (!operations.length) {
    return (
      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center text-sm text-gray-400">
        Add operations from the grid above
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-1.5">
      {operations.map((op, i) => (
        <div
          key={`${op.type}-${i}`}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={(e) => handleDrop(e, i)}
        >
          {/* Drop indicator line */}
          {dropTarget === i && dragIndex !== i && dragIndex !== i - 1 && (
            <div className="h-0.5 bg-blue-400 rounded-full mb-1 mx-2" />
          )}
          <div className={dragIndex === i ? "opacity-40" : ""}>
            <OperationCard
              index={i}
              operation={op}
              expanded={expandedIndex === i}
              onToggle={() => onToggleExpand(i)}
              onParamChange={(key, val) => onParamChange(i, key, val)}
              onRemove={() => onRemove(i)}
              dragHandleProps={{
                draggable: true,
                onDragStart: (e) => handleDragStart(e, i),
                onDragEnd: handleDragEnd,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/DerivationEditor/OperationPipeline.js
git commit -m "feat: add OperationPipeline — drag-and-drop ordered operation list"
```

---

### Task 6: Create DerivationSelector component

**Files:**
- Create: `src/components/admin/DerivationEditor/DerivationSelector.js`

Derivation dropdown, metadata form, show matching/all toggle. Extracted from AdminMediaLibraryTab lines ~2030-2190.

- [ ] **Step 1: Create DerivationSelector.js**

```jsx
"use client";

const ASSET_TYPE_OPTIONS = ["image", "data", "other"];

export default function DerivationSelector({
  derivations,
  selectedDerivationId,
  onSelect,
  showAll,
  onToggleShowAll,
  focusedAssetType,
  // Editor metadata fields
  editorId,
  editorName,
  editorDescription,
  editorAssetTypes,
  onEditorChange,
}) {
  return (
    <div className="space-y-3">
      {/* Derivation picker row */}
      <div className="flex items-center gap-2">
        <select
          value={selectedDerivationId || ""}
          onChange={(e) => onSelect(e.target.value)}
          className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700"
        >
          <option value="">— Select derivation —</option>
          {derivations.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onToggleShowAll}
          className="text-xs text-blue-500 hover:text-blue-600 whitespace-nowrap"
        >
          {showAll ? "Show matching" : "Show all"}
        </button>
      </div>
      {!showAll && focusedAssetType && (
        <p className="text-xs text-gray-400">
          Showing derivations matching type: <strong>{focusedAssetType}</strong>
        </p>
      )}

      {/* Metadata editor */}
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-1">
          <span className="text-xs text-gray-500">ID</span>
          <input
            type="text"
            value={editorId}
            onChange={(e) => onEditorChange("id", e.target.value)}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700"
          />
        </label>
        <label className="col-span-1">
          <span className="text-xs text-gray-500">Name</span>
          <input
            type="text"
            value={editorName}
            onChange={(e) => onEditorChange("name", e.target.value)}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700"
          />
        </label>
        <label className="col-span-2">
          <span className="text-xs text-gray-500">Description</span>
          <input
            type="text"
            value={editorDescription}
            onChange={(e) => onEditorChange("description", e.target.value)}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700"
          />
        </label>
      </div>

      {/* Asset type checkboxes */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">Asset types:</span>
        {ASSET_TYPE_OPTIONS.map((t) => (
          <label key={t} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={editorAssetTypes.includes(t)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...editorAssetTypes, t]
                  : editorAssetTypes.filter((x) => x !== t);
                onEditorChange("assetTypes", next);
              }}
            />
            {t}
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/DerivationEditor/DerivationSelector.js
git commit -m "feat: add DerivationSelector — derivation picker + metadata form"
```

---

### Task 7: Create DerivationPreview component

**Files:**
- Create: `src/components/admin/DerivationEditor/DerivationPreview.js`

Preview image, apply/save buttons, progress bar, validation status.

- [ ] **Step 1: Create DerivationPreview.js**

```jsx
"use client";

export default function DerivationPreview({
  // Validation state
  hasAsset,
  isConcrete,
  hasInvalidParams,
  unboundParams,
  invalidParams,
  // Apply state
  applying,
  applyProgress,
  applyProgressLabel,
  onApply,
  // Preview state
  previewBlobUrl,
  previewError,
  // Save state
  canSave,
  saving,
  saveError,
  onSaveToLibrary,
  // Derivation save
  onSaveDerivation,
  derivationSaveStatus,
  derivationSaveError,
  savingDerivation,
}) {
  const canApply = hasAsset && isConcrete && !hasInvalidParams && !applying;

  return (
    <div className="space-y-3">
      {/* Validation badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className={
          "text-xs px-2 py-0.5 rounded-full " +
          (isConcrete
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400")
        }>
          {isConcrete ? "Concrete" : "Abstract"}
        </span>
      </div>

      {/* Unbound params */}
      {unboundParams.length > 0 && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Unbound: {unboundParams.map((u) => `${u.operator}: ${u.param}`).join(", ")}
        </div>
      )}

      {/* Invalid params */}
      {invalidParams.length > 0 && (
        <div className="text-xs text-red-600 dark:text-red-400">
          Invalid: {invalidParams.map((u) => `${u.operator}: ${u.param}`).join(", ")}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSaveDerivation}
          disabled={savingDerivation}
          className="px-3 py-1.5 text-sm rounded bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {savingDerivation ? "Saving..." : "Save derivation"}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!canApply}
          className={
            "px-3 py-1.5 text-sm rounded text-white disabled:opacity-50 " +
            "bg-blue-500 hover:bg-blue-600 " +
            (canApply && !applying ? "animate-pulse-once" : "")
          }
        >
          {applying ? "Applying..." : "Apply / Preview"}
        </button>
        {canSave && (
          <button
            type="button"
            onClick={onSaveToLibrary}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save to library"}
          </button>
        )}
      </div>

      {/* Status messages */}
      {!hasAsset && <p className="text-xs text-gray-400">Select an asset to apply derivations.</p>}
      {derivationSaveStatus && <p className="text-xs text-green-600">{derivationSaveStatus}</p>}
      {derivationSaveError && <p className="text-xs text-red-500">{derivationSaveError}</p>}
      {saveError && <p className="text-xs text-red-500">{saveError}</p>}

      {/* Progress bar */}
      {applying && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, applyProgress || 0)}%` }}
          />
        </div>
      )}
      {applying && applyProgressLabel && (
        <p className="text-xs text-gray-500">{applyProgressLabel}</p>
      )}

      {/* Preview image */}
      {previewBlobUrl && (
        <img
          src={previewBlobUrl}
          alt="Derivation preview"
          className="max-h-[300px] rounded border border-gray-200 dark:border-gray-700"
        />
      )}
      {previewError && <p className="text-xs text-red-500">{previewError}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/DerivationEditor/DerivationPreview.js
git commit -m "feat: add DerivationPreview — preview, progress, validation badges"
```

---

### Task 8: Create DerivationEditor container + wire into AdminMediaLibraryTab

**Files:**
- Create: `src/components/admin/DerivationEditor/DerivationEditor.js`
- Create: `src/components/admin/DerivationEditor/index.js`
- Modify: `src/components/admin/AdminMediaLibraryTab.js`

This is the integration task. DerivationEditor owns all derivation state and composes the sub-components. AdminMediaLibraryTab replaces ~600 lines of derivation JSX with a single `<DerivationEditor>`.

- [ ] **Step 1: Create DerivationEditor/index.js barrel**

```js
export { default } from "./DerivationEditor";
```

- [ ] **Step 2: Create DerivationEditor.js**

This component takes over all derivation state and handlers from AdminMediaLibraryTab. It receives from the parent only what it can't own: `focusedAsset`, `focusedAssetType`, `derivations`, `onDerivationsChanged`, `onSaveToLibrary` (to trigger a media library refresh after saving a derived asset).

The internal state includes:
- `selectedDerivationId`, `customOperations`, `expandedCardIndex`
- `editorId`, `editorName`, `editorDescription`, `editorAssetTypes`
- `applyingDerivation`, `applyProgress`, `applyProgressLabel`
- `derivationSaveStatus`, `derivationSaveError`
- `previewBlobUrl`, `previewBlob`, `savingPreview`, `savePreviewError`
- `showAllDerivations`

Key handlers extracted from AdminMediaLibraryTab:
- `handleSelectDerivation` — loads operations from selected derivation
- `handleAddOperation` — uses `buildDefaultParams` from operationRegistry
- `handleRemoveOperation`, `handleParamChange`, `handleReorder`
- `handleSaveDerivation` — POST/PUT to `/api/admin/derivations`
- `handleApplyDerivation` — POST to `/api/admin/derivations/apply`, streams NDJSON progress
- `handleSaveToLibrary` — uploads preview blob

The JSX composes: `DerivationSelector` → `OperationGridPicker` → `OperationPipeline` → `DerivationPreview`.

The complete implementation should follow the exact same API calls and NDJSON streaming logic currently in AdminMediaLibraryTab (lines ~1030-1200 for apply, ~940-1000 for save). Move the logic, don't rewrite it.

- [ ] **Step 3: Replace derivation section in AdminMediaLibraryTab**

In `AdminMediaLibraryTab.js`:
1. Remove all derivation-related state variables (lines ~90-110) EXCEPT `derivations` and `setDerivations` (which remain in the parent for the main useEffect that loads them). Remove: `selectedDerivationId`, `customOperations`, `derivationError`, `applyingDerivation`, `applyProgress`, `applyProgressLabel`, `showAllDerivations`, `editorId`, `editorName`, `editorDescription`, `editorAssetTypes`, `newOperationType`, `derivationSaveStatus`, `derivationSaveError`, `lastDerivedAsset`, `savedDerivedAssets`, `previewBlobUrl`, `previewBlob`, `savingPreview`, `savePreviewError`
2. Remove derivation-related useMemo values: `filteredDerivations`, `availableDerivations`, `derivationUnboundParameters`, `derivationInvalidParameters`, `derivationPseudoName`, `derivationMatrixRows`
3. Remove derivation handler functions: `handleSelectDerivation`, `handleAddOperation`, `handleRemoveOperation`, `handleSaveDerivation`, `handleApplyDerivation`, `handleSaveToLibrary` (the derived-asset version)
4. Replace the derivation JSX section (~lines 2030-2450) with:

```jsx
<DerivationEditor
  focusedAsset={focusedItem}
  focusedAssetType={focusedAssetType}
  derivations={derivations}
  onDerivationsChanged={() => setRefreshToken(Date.now())}
  t={t}
/>
```

Note: `derivations` state stays in the parent (it's loaded in the main useEffect), but is passed as a prop. The `onDerivationsChanged` callback lets the editor trigger a refresh after saving.

- [ ] **Step 4: Verify build**

Run: `npm run cf:build`
Expected: Build passes. The derivation editor should look and function identically to before, but with the new grid picker, sliders, and all 22 operations.

- [ ] **Step 5: Manual smoke test checklist**

Run `npm run dev` and verify in browser:
1. Grid picker shows 4 categories with all 22 operation tiles
2. Clicking a tile adds the operation with correct defaults
3. Operation cards collapse/expand on click
4. Sliders work for numeric params (drag + type exact value)
5. Drag-and-drop reorders operations
6. Select an existing derivation — operations load correctly
7. Apply derivation — preview shows
8. Save derivation — persists
9. Sepia/grayscale/invert with amount < 1 — partial effect visible
10. New operations (blur, brightness, flip, etc.) — all apply correctly

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/DerivationEditor/ src/components/admin/AdminMediaLibraryTab.js
git commit -m "feat: integrate DerivationEditor — grid picker, sliders, drag-and-drop pipeline"
```

---

### Task 9: i18n sync

**Files:**
- Modify: `src/lib/i18n/en.json`
- Modify: `src/lib/i18n/sv.json`
- Modify: `src/lib/i18n/es.json`

If any new user-facing strings were added (button labels, status messages, category names), add them to all three locale files.

- [ ] **Step 1: Run i18n sync check**

Use the `i18n-sync` skill to verify all three files have identical key sets.

- [ ] **Step 2: Add any missing keys**

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/
git commit -m "i18n: add derivation editor strings to all locales"
```

---

### Task 10: Final build verification + cleanup

- [ ] **Step 1: Full build**

Run: `npm run cf:build`
Expected: Build passes cleanly.

- [ ] **Step 2: Verify no unused imports in AdminMediaLibraryTab**

Check that removed derivation state/handlers didn't leave orphaned imports (e.g. `OPERATION_SCHEMAS` import from derivationEngine may no longer be needed in the parent).

- [ ] **Step 3: Commit any cleanup**

```bash
git add -A
git commit -m "chore: remove unused derivation imports from AdminMediaLibraryTab"
```
