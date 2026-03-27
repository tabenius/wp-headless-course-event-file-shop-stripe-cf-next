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
  tiltShift: {
    label: "Tilt shift",
    category: "effects",
    icon: "\uD83D\uDCF7",
    tip: "Keep the center sharp while blurring the edges for Instagram-style focus",
    techTip: "Radial focus mask blending between original and gaussian blur",
    parameters: [
      { key: "centerX", label: "Center X (0-1)", type: "number", min: 0, max: 1, step: 0.01 },
      { key: "centerY", label: "Center Y (0-1)", type: "number", min: 0, max: 1, step: 0.01 },
      { key: "focusRadius", label: "Focus radius", type: "number", min: 0, max: 1, step: 0.01 },
      { key: "variance", label: "Variance/falloff", type: "number", min: 0.01, max: 1, step: 0.01 },
      { key: "intensity", label: "Intensity", type: "number", min: 0, max: 1, step: 0.05 },
      { key: "blurRadius", label: "Blur radius", type: "number", min: 1, max: 32, step: 1 },
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
      else if (p.key === "centerX" || p.key === "centerY") params[p.key] = 0.5;
      else if (p.key === "focusRadius") params[p.key] = 0.35;
      else if (p.key === "variance") params[p.key] = 0.25;
      else if (p.key === "intensity") params[p.key] = 0.85;
      else if (p.key === "blurRadius") params[p.key] = 10;
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
