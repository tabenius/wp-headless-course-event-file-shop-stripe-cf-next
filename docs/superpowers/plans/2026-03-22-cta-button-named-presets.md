# CTA Button Style & Named Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CTA button visual style settings with four built-in presets, a named-preset library persisted in KV, typography preset saving, and "upstream" passthrough support across the style system.

**Architecture:** `normalizeCtaStyle()` in `shopSettings.js` handles server-side normalization and is the single source of truth for field validation. A new `stylePresetsStore.js` lib handles KV CRUD for the `style-presets` key. A thin Route Handler at `/api/admin/style-presets` exposes GET/POST/DELETE. `globals.css` adds a zero-specificity `:where()` button rule with `var()` fallbacks. The inline runtime script in `layout.js` is extended to resolve `ctaStyle` → `--btn-*` CSS variables. `AdminDashboard.js` gains a Button Style section and typography preset saving.

**Tech Stack:** Next.js 16 App Router, Cloudflare KV (via `cloudflareKv.js`), React `useState`, `node:test` + `node:assert/strict` for tests, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-03-22-cta-button-named-presets-design.md`

**Prerequisite:** The font browser plan (`docs/superpowers/plans/2026-03-22-font-browser.md`) must be implemented first. After that plan, `shopSettings.js` has `normalizeFontRole`, `normalizeSiteStyle` includes all five font role fields, and `areSiteStylesEqual` compares them with `JSON.stringify`. The inline script in `layout.js` handles font roles and `typographyPalette`. `AdminDashboard.js` has a themes strip with five built-in themes. This plan only adds the ctaStyle layer on top.

---

## File Map

**New files:**

- `src/lib/stylePresetsStore.js` — KV CRUD + validation for the `style-presets` key
- `src/app/api/admin/style-presets/route.js` — GET/POST/DELETE HTTP handler
- `tests/stylePresets.test.js` — unit tests for store validation helpers

**Modified files:**

- `src/lib/shopSettings.js` — add `normalizeCtaStyle()`, extend `normalizeSiteStyle()` and `areSiteStylesEqual()`
- `src/app/globals.css` — add `:where()` button rule with ten `--btn-*` fallback bindings
- `src/app/layout.js` — extend inline runtime script to apply `--btn-*` CSS vars from ctaStyle and skip upstream color fields
- `src/components/admin/AdminDashboard.js` — add ctaStyle state, Button Style section, typography preset saving

---

## Task 1: `normalizeCtaStyle()` in shopSettings.js

**Files:**

- Modify: `src/lib/shopSettings.js`
- Create: `tests/shopSettingsCtaStyle.test.js`

The function validates and normalizes a raw `ctaStyle` value. It must return objects in a **fixed key order** so that `JSON.stringify` comparisons are stable in `areSiteStylesEqual`.

- [ ] **Step 1: Write the failing tests**

Create `tests/shopSettingsCtaStyle.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCtaStyle } from "../src/lib/shopSettings.js";

describe("normalizeCtaStyle", () => {
  it("returns upstream for null", () => {
    assert.deepEqual(normalizeCtaStyle(null), { type: "upstream" });
  });

  it("returns upstream for undefined", () => {
    assert.deepEqual(normalizeCtaStyle(undefined), { type: "upstream" });
  });

  it("returns upstream for explicit upstream type", () => {
    assert.deepEqual(normalizeCtaStyle({ type: "upstream" }), {
      type: "upstream",
    });
  });

  it("returns upstream for missing bgColor", () => {
    assert.deepEqual(normalizeCtaStyle({ textColor: "background" }), {
      type: "upstream",
    });
  });

  it("returns upstream for invalid bgColor", () => {
    assert.deepEqual(normalizeCtaStyle({ bgColor: "hotpink" }), {
      type: "upstream",
    });
  });

  it("normalizes a minimal valid ctaStyle", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      borderRadius: "md",
      border: "none",
      shadow: "none",
      fontWeight: "semibold",
      textTransform: "none",
      paddingSize: "md",
    });
    assert.deepEqual(result, {
      bgColor: "primary",
      textColor: "background",
      borderRadius: "md",
      border: "none",
      shadow: "none",
      fontWeight: "semibold",
      textTransform: "none",
      paddingSize: "md",
    });
  });

  it("clamps invalid textColor to background", () => {
    const result = normalizeCtaStyle({ bgColor: "primary", textColor: "neon" });
    assert.equal(result.textColor, "background");
  });

  it("clamps invalid borderRadius to md", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      borderRadius: "xxl",
    });
    assert.equal(result.borderRadius, "md");
  });

  it("includes bgCustom only when bgColor is custom", () => {
    const result = normalizeCtaStyle({
      bgColor: "custom",
      bgCustom: "#ff0000",
      textColor: "background",
    });
    assert.equal(result.bgCustom, "#ff0000");
    const noCustom = normalizeCtaStyle({
      bgColor: "primary",
      bgCustom: "#ff0000",
      textColor: "background",
    });
    assert.equal(noCustom.bgCustom, undefined);
  });

  it("includes borderColor when border is solid, defaults to primary", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      border: "solid",
    });
    assert.equal(result.borderColor, "primary");
  });

  it("does not include borderColor when border is none", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      border: "none",
      borderColor: "secondary",
    });
    assert.equal(result.borderColor, undefined);
  });

  it("produces identical JSON.stringify for same logical input", () => {
    const a = normalizeCtaStyle({
      bgColor: "secondary",
      textColor: "foreground",
      border: "solid",
      borderColor: "secondary",
    });
    const b = normalizeCtaStyle({
      bgColor: "secondary",
      textColor: "foreground",
      border: "solid",
      borderColor: "secondary",
    });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/shopSettingsCtaStyle.test.js
```

Expected: FAIL — `normalizeCtaStyle is not exported`

- [ ] **Step 3: Add constants and `normalizeCtaStyle` to shopSettings.js**

In `src/lib/shopSettings.js`, add these **before** the existing `normalizeSiteStyle` function (around line 90, after the `normalizeSiteFont` function):

```js
const CTA_BG_COLORS = new Set([
  "primary",
  "secondary",
  "foreground",
  "background",
  "custom",
]);
const CTA_TEXT_COLORS = new Set([
  "background",
  "foreground",
  "primary",
  "secondary",
  "custom",
]);
const CTA_BORDER_RADII = new Set(["none", "sm", "md", "lg", "full"]);
const CTA_BORDERS = new Set(["none", "solid"]);
const CTA_BORDER_COLORS = new Set([
  "primary",
  "secondary",
  "foreground",
  "custom",
]);
const CTA_SHADOWS = new Set(["none", "sm", "md"]);
const CTA_FONT_WEIGHTS = new Set(["normal", "medium", "semibold", "bold"]);
const CTA_TEXT_TRANSFORMS = new Set(["none", "uppercase", "capitalize"]);
const CTA_PADDING_SIZES = new Set(["sm", "md", "lg"]);

export function normalizeCtaStyle(source) {
  if (!source || typeof source !== "object") return { type: "upstream" };
  if (source.type === "upstream") return { type: "upstream" };
  if (!CTA_BG_COLORS.has(source.bgColor)) return { type: "upstream" };

  const bgColor = source.bgColor;
  const textColor = CTA_TEXT_COLORS.has(source.textColor)
    ? source.textColor
    : "background";
  const borderRadius = CTA_BORDER_RADII.has(source.borderRadius)
    ? source.borderRadius
    : "md";
  const border = CTA_BORDERS.has(source.border) ? source.border : "none";
  const shadow = CTA_SHADOWS.has(source.shadow) ? source.shadow : "none";
  const fontWeight = CTA_FONT_WEIGHTS.has(source.fontWeight)
    ? source.fontWeight
    : "semibold";
  const textTransform = CTA_TEXT_TRANSFORMS.has(source.textTransform)
    ? source.textTransform
    : "none";
  const paddingSize = CTA_PADDING_SIZES.has(source.paddingSize)
    ? source.paddingSize
    : "md";

  // Fixed key order for stable JSON.stringify in areSiteStylesEqual
  const result = {
    bgColor,
    textColor,
    borderRadius,
    border,
    shadow,
    fontWeight,
    textTransform,
    paddingSize,
  };

  if (bgColor === "custom") {
    result.bgCustom = normalizeHexColor(source.bgCustom, "#000000");
  }
  if (textColor === "custom") {
    result.textCustom = normalizeHexColor(source.textCustom, "#ffffff");
  }
  if (border === "solid") {
    result.borderColor = CTA_BORDER_COLORS.has(source.borderColor)
      ? source.borderColor
      : "primary";
    if (result.borderColor === "custom") {
      result.borderCustom = normalizeHexColor(source.borderCustom, "#000000");
    }
  }

  return result;
}
```

- [ ] **Step 4: Update `normalizeSiteStyle` to include ctaStyle**

Find the `normalizeSiteStyle` function (after the font browser plan it already includes all five font role fields). Add `ctaStyle` as the last field:

```js
// Add this line at the end of the returned object in normalizeSiteStyle:
ctaStyle: normalizeCtaStyle(source.ctaStyle),
```

The function return should end with:

```js
return {
  // ... all existing fields (colors, font roles, typographyPalette, linkStyle) ...
  ctaStyle: normalizeCtaStyle(source.ctaStyle),
};
```

- [ ] **Step 5: Update `areSiteStylesEqual` to compare ctaStyle**

Find the `areSiteStylesEqual` function. After the font browser plan it already has JSON.stringify comparisons for font roles. Add one more condition:

```js
// Add at the end of the && chain in areSiteStylesEqual:
JSON.stringify(a.ctaStyle) === JSON.stringify(b.ctaStyle);
```

- [ ] **Step 6: Update the export list at the bottom of shopSettings.js**

Find the existing export:

```js
export { ALL_TYPES, DEFAULT_SITE_STYLE, SITE_FONT_STACKS };
```

`normalizeCtaStyle` is already exported with `export function` above, so no change needed here.

- [ ] **Step 7: Run tests to verify they pass**

```bash
node --test tests/shopSettingsCtaStyle.test.js
```

Expected: all tests PASS

- [ ] **Step 8: Run the full test suite to verify no regressions**

```bash
node --test tests/**/*.test.js
```

Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/shopSettings.js tests/shopSettingsCtaStyle.test.js
git commit -m "feat: add normalizeCtaStyle() and extend normalizeSiteStyle/areSiteStylesEqual"
```

---

## Task 2: stylePresetsStore — KV CRUD + validation helpers

**Files:**

- Create: `src/lib/stylePresetsStore.js`
- Create: `tests/stylePresets.test.js`

This module owns all logic for the `style-presets` KV key. The HTTP route calls these functions.

- [ ] **Step 1: Write the failing tests**

Create `tests/stylePresets.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePresets,
  validatePresetInput,
  applyAddPreset,
  applyRemovePreset,
} from "../src/lib/stylePresetsStore.js";

describe("normalizePresets", () => {
  it("returns empty arrays for null", () => {
    assert.deepEqual(normalizePresets(null), { cta: [], typography: [] });
  });

  it("returns empty arrays for missing keys", () => {
    assert.deepEqual(normalizePresets({}), { cta: [], typography: [] });
  });

  it("filters non-array cta to empty", () => {
    assert.deepEqual(normalizePresets({ cta: "bad", typography: [] }), {
      cta: [],
      typography: [],
    });
  });

  it("filters preset entries without id or name", () => {
    const raw = {
      cta: [
        { id: "abc", name: "Good", style: { bgColor: "primary" } },
        { id: "", name: "Bad", style: {} },
        { name: "NoId", style: {} },
      ],
      typography: [],
    };
    const result = normalizePresets(raw);
    assert.equal(result.cta.length, 1);
    assert.equal(result.cta[0].id, "abc");
  });
});

describe("validatePresetInput", () => {
  it("rejects missing type", () => {
    const err = validatePresetInput(null, "My preset", {});
    assert.ok(err);
  });

  it("rejects invalid type", () => {
    const err = validatePresetInput("button", "My preset", {});
    assert.ok(err);
  });

  it("rejects empty name", () => {
    const err = validatePresetInput("cta", "", {});
    assert.ok(err);
  });

  it("rejects name over 80 chars", () => {
    const err = validatePresetInput("cta", "a".repeat(81), {});
    assert.ok(err);
  });

  it("rejects missing style", () => {
    const err = validatePresetInput("cta", "My preset", null);
    assert.ok(err);
  });

  it("accepts valid cta input", () => {
    const err = validatePresetInput("cta", "My Dark", { bgColor: "primary" });
    assert.equal(err, null);
  });

  it("accepts valid typography input", () => {
    const err = validatePresetInput("typography", "Elegant Sofia", {
      fontDisplay: {},
    });
    assert.equal(err, null);
  });
});

describe("applyAddPreset", () => {
  it("appends to the correct array", () => {
    const presets = { cta: [], typography: [] };
    const result = applyAddPreset(presets, "cta", {
      id: "x1",
      name: "Dark",
      style: {},
    });
    assert.equal(result.cta.length, 1);
    assert.equal(result.cta[0].id, "x1");
    assert.equal(result.typography.length, 0);
  });

  it("appends to typography array", () => {
    const presets = { cta: [], typography: [] };
    const result = applyAddPreset(presets, "typography", {
      id: "y1",
      name: "Elegant",
      style: {},
    });
    assert.equal(result.typography.length, 1);
    assert.equal(result.cta.length, 0);
  });
});

describe("applyRemovePreset", () => {
  it("removes matching entry by id", () => {
    const presets = {
      cta: [{ id: "abc", name: "Dark", style: {} }],
      typography: [],
    };
    const result = applyRemovePreset(presets, "cta", "abc");
    assert.equal(result.cta.length, 0);
  });

  it("is idempotent — no error if id not found", () => {
    const presets = { cta: [], typography: [] };
    const result = applyRemovePreset(presets, "cta", "nonexistent");
    assert.deepEqual(result, { cta: [], typography: [] });
  });

  it("only removes from the specified type", () => {
    const presets = {
      cta: [{ id: "abc", name: "Dark", style: {} }],
      typography: [{ id: "abc", name: "Shared id", style: {} }],
    };
    const result = applyRemovePreset(presets, "cta", "abc");
    assert.equal(result.cta.length, 0);
    assert.equal(result.typography.length, 1); // untouched
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/stylePresets.test.js
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/lib/stylePresetsStore.js`**

```js
import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { normalizeCtaStyle } from "@/lib/shopSettings";

const KV_KEY = "style-presets";
const VALID_TYPES = new Set(["cta", "typography"]);

/** Normalize raw KV value → { cta: [], typography: [] } */
export function normalizePresets(raw) {
  if (!raw || typeof raw !== "object") return { cta: [], typography: [] };
  const normalize = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        entry.id.trim() &&
        typeof entry.name === "string" &&
        entry.name.trim(),
    );
  };
  return {
    cta: normalize(raw.cta),
    typography: normalize(raw.typography),
  };
}

/**
 * Validate POST body fields. Returns an error string or null.
 */
export function validatePresetInput(type, name, style) {
  if (!VALID_TYPES.has(type)) return "type must be 'cta' or 'typography'";
  if (!name || typeof name !== "string" || !name.trim())
    return "name is required";
  if (name.trim().length > 80) return "name must be 80 characters or fewer";
  if (!style || typeof style !== "object") return "style is required";
  return null;
}

/** Pure: return new presets with entry appended to the correct array. */
export function applyAddPreset(presets, type, entry) {
  return {
    ...presets,
    [type]: [...presets[type], entry],
  };
}

/** Pure: return new presets with matching entry removed from the correct array. */
export function applyRemovePreset(presets, type, id) {
  return {
    ...presets,
    [type]: presets[type].filter((entry) => entry.id !== id),
  };
}

/** Read style-presets from KV, normalize, return { cta, typography }. */
export async function getStylePresets() {
  const raw = await readCloudflareKvJson(KV_KEY);
  return normalizePresets(raw);
}

/**
 * Add a preset. For CTA type, normalizes style through normalizeCtaStyle.
 * Returns { ok: true, preset } or { ok: false, error }.
 */
export async function addStylePreset(type, name, style) {
  const validationError = validatePresetInput(type, name, style);
  if (validationError) return { ok: false, error: validationError };

  let normalizedStyle = style;
  if (type === "cta") {
    const normalized = normalizeCtaStyle(style);
    if (normalized.type === "upstream") {
      return { ok: false, error: "Cannot save upstream as a named CTA preset" };
    }
    normalizedStyle = normalized;
  }

  const id = crypto.randomUUID();
  const preset = { id, name: name.trim(), style: normalizedStyle };

  const presets = await getStylePresets();
  const next = applyAddPreset(presets, type, preset);
  await writeCloudflareKvJson(KV_KEY, next);

  return { ok: true, preset };
}

/**
 * Remove a preset by id and type. Idempotent.
 * Returns { ok: true }.
 */
export async function removeStylePreset(type, id) {
  if (!VALID_TYPES.has(type)) return { ok: false, error: "Invalid type" };
  const presets = await getStylePresets();
  const next = applyRemovePreset(presets, type, id);
  await writeCloudflareKvJson(KV_KEY, next);
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/stylePresets.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Run the full suite**

```bash
node --test tests/**/*.test.js
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/stylePresetsStore.js tests/stylePresets.test.js
git commit -m "feat: add stylePresetsStore with KV CRUD and validation helpers"
```

---

## Task 3: `/api/admin/style-presets` Route Handler

**Files:**

- Create: `src/app/api/admin/style-presets/route.js`

Thin HTTP handler — all logic lives in `stylePresetsStore.js`.

- [ ] **Step 1: Create the route file**

Create `src/app/api/admin/style-presets/route.js`:

```js
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  getStylePresets,
  addStylePreset,
  removeStylePreset,
} from "@/lib/stylePresetsStore";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const presets = await getStylePresets();
    return NextResponse.json({ ok: true, ...presets });
  } catch (error) {
    console.error("style-presets GET failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load presets" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { type, name, style } = body || {};
  const result = await addStylePreset(type, name, style);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, preset: result.preset });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const rawId = String(body?.id || "").trim();
  const type = body?.type;

  if (!rawId || rawId.length > 64) {
    return NextResponse.json(
      { ok: false, error: "id must be a non-empty string, max 64 chars" },
      { status: 400 },
    );
  }

  const result = await removeStylePreset(type, rawId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify the route file exists at the correct path**

```bash
ls src/app/api/admin/style-presets/route.js
```

Expected: file listed

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/style-presets/route.js
git commit -m "feat: add /api/admin/style-presets GET/POST/DELETE route"
```

---

## Task 4: CSS — `:where()` button rule in globals.css

**Files:**

- Modify: `src/app/globals.css`

Adds zero-specificity CSS bindings for `--btn-*` variables so any WordPress theme rule (even a plain `button {}`) overrides them. When all `--btn-*` variables are unset (upstream ctaStyle) and the color fallbacks are also unset (upstream colors), the declarations drop silently and WP theme styles win.

- [ ] **Step 1: Add the rule at the end of globals.css**

Open `src/app/globals.css` and append at the very end:

```css
/* CTA button style — zero specificity so WP theme rules always win */
:where(button, .btn, [role="button"], input[type="submit"]) {
  background-color: var(--btn-bg, var(--color-primary));
  color: var(--btn-color, var(--color-background));
  border-radius: var(--btn-radius, 8px);
  border: var(--btn-border-width, 0px) solid
    var(--btn-border-color, transparent);
  box-shadow: var(--btn-shadow, none);
  font-weight: var(--btn-font-weight, 600);
  text-transform: var(--btn-text-transform, none);
  padding: var(--btn-padding-y, 0.625rem) var(--btn-padding-x, 1.25rem);
}
```

- [ ] **Step 2: Verify the existing WP button rules are unaffected**

Check that `.wp-block-button__link` rules (around line 167) still exist and still have higher specificity. Those class-based selectors (specificity 0,1,0) always win over `:where()` (specificity 0,0,0).

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add zero-specificity :where() CTA button CSS var bindings"
```

---

## Task 5: Extend layout.js inline script for ctaStyle

**Files:**

- Modify: `src/app/layout.js`

The inline script (line ~111) after the font browser plan applies colors, font roles, palette colors, and link style data-attributes. We extend it to:

1. Skip setting CSS vars when a color field value is `"upstream"`
2. Apply ten `--btn-*` CSS variables from `ctaStyle`

- [ ] **Step 1: Read the current inline script in layout.js**

Read `src/app/layout.js` and locate the second `<script dangerouslySetInnerHTML>` (the longer one). After the font browser plan it contains an expanded `apply()` function. Understand the current structure before editing.

- [ ] **Step 2: Update the inline script**

The `apply()` function inside the inline script needs two changes:

**Change A — skip upstream color values:**

Find the color loop (iterates `colorMap`):

```js
var v = style[k];
if (typeof v === "string" && v.trim())
  root.style.setProperty(colorMap[k], v.trim());
```

Change to:

```js
var v = style[k];
if (typeof v === "string" && v.trim() && v !== "upstream")
  root.style.setProperty(colorMap[k], v.trim());
```

**Change B — add ctaStyle → --btn-\* resolution:**

Add this block at the end of the `apply()` function, after the link-style block:

```js
// ctaStyle → --btn-* CSS variables
var cta = style.ctaStyle;
if (cta && typeof cta === "object" && cta.type !== "upstream" && cta.bgColor) {
  var clr = {
    primary: "var(--color-primary)",
    secondary: "var(--color-secondary)",
    foreground: "var(--color-foreground)",
    background: "var(--color-background)",
  };
  var rc = function (slot, custom) {
    return slot === "custom" ? custom || "" : clr[slot] || "";
  };
  var radMap = {
    none: "0px",
    sm: "4px",
    md: "8px",
    lg: "16px",
    full: "9999px",
  };
  var padMap = {
    sm: ["0.375rem", "0.875rem"],
    md: ["0.625rem", "1.25rem"],
    lg: ["0.875rem", "1.75rem"],
  };
  var shdMap = {
    none: "none",
    sm: "0 1px 2px rgba(0,0,0,.08)",
    md: "0 4px 6px rgba(0,0,0,.10)",
  };
  var fwMap = { normal: 400, medium: 500, semibold: 600, bold: 700 };
  root.style.setProperty("--btn-bg", rc(cta.bgColor, cta.bgCustom));
  root.style.setProperty("--btn-color", rc(cta.textColor, cta.textCustom));
  root.style.setProperty("--btn-radius", radMap[cta.borderRadius] || "8px");
  root.style.setProperty(
    "--btn-border-width",
    cta.border === "solid" ? "1px" : "0px",
  );
  root.style.setProperty(
    "--btn-border-color",
    cta.border === "solid"
      ? rc(cta.borderColor, cta.borderCustom)
      : "transparent",
  );
  root.style.setProperty("--btn-shadow", shdMap[cta.shadow] || "none");
  root.style.setProperty(
    "--btn-font-weight",
    String(fwMap[cta.fontWeight] || 600),
  );
  root.style.setProperty("--btn-text-transform", cta.textTransform || "none");
  var pad = padMap[cta.paddingSize] || padMap.md;
  root.style.setProperty("--btn-padding-x", pad[1]);
  root.style.setProperty("--btn-padding-y", pad[0]);
}
```

**Important:** The inline script must be kept as a single-line string in JSX. After editing the expanded version, minify it:

```bash
node -e "
const s = \`
// paste the full expanded script here
\`;
console.log(s.replace(/\\/\\/.*/g,'').replace(/\\s+/g,' ').trim());
"
```

Or use:

```bash
npx terser --compress --mangle -- /tmp/inline-script.js
```

Then update the `__html` value in the `dangerouslySetInnerHTML` of the second `<script>` tag.

- [ ] **Step 3: Verify the page still loads**

```bash
npm run dev
```

Open the site in a browser. Check that no console errors appear related to the inline script.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.js
git commit -m "feat: extend runtime script to apply --btn-* CSS vars and skip upstream color fields"
```

---

## Task 6: AdminDashboard — ctaStyle state + Button Style section

**Files:**

- Modify: `src/components/admin/AdminDashboard.js`

This is the largest task. It adds:

1. Client-side `normalizeCtaStyle` (mirrors server version, avoids server import)
2. CTA style constants (built-in presets)
3. `ctaStyle` state in `siteStyleTokens`
4. `applySiteStyleTokensToDom` extended to set `--btn-*` vars
5. Loading user CTA presets from the new API
6. Button Style section UI: preset strip + live preview + 8 controls + Save current…

- [ ] **Step 1: Add client-side CTA normalization constants and function**

Near the top of `AdminDashboard.js`, after the existing `SITE_STYLE_DEFAULTS` block, add:

```js
// ── CTA button style ──────────────────────────────────────────────────────────

const CTA_BG_COLORS = [
  "primary",
  "secondary",
  "foreground",
  "background",
  "custom",
];
const CTA_TEXT_COLORS = [
  "background",
  "foreground",
  "primary",
  "secondary",
  "custom",
];
const CTA_BORDER_RADII = ["none", "sm", "md", "lg", "full"];
const CTA_BORDERS = ["none", "solid"];
const CTA_BORDER_COLORS = ["primary", "secondary", "foreground", "custom"];
const CTA_SHADOWS = ["none", "sm", "md"];
const CTA_FONT_WEIGHTS = ["normal", "medium", "semibold", "bold"];
const CTA_TEXT_TRANSFORMS = ["none", "uppercase", "capitalize"];
const CTA_PADDING_SIZES = ["sm", "md", "lg"];

const CTA_RADIUS_MAP = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "16px",
  full: "9999px",
};
const CTA_PADDING_MAP = {
  sm: { x: "0.875rem", y: "0.375rem" },
  md: { x: "1.25rem", y: "0.625rem" },
  lg: { x: "1.75rem", y: "0.875rem" },
};
const CTA_SHADOW_MAP = {
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,.08)",
  md: "0 4px 6px rgba(0,0,0,.10)",
};
const CTA_FONT_WEIGHT_MAP = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

const CTA_UPSTREAM = { type: "upstream" };
const CTA_DEFAULT_STYLE = {
  bgColor: "primary",
  textColor: "background",
  borderRadius: "md",
  border: "none",
  shadow: "none",
  fontWeight: "semibold",
  textTransform: "none",
  paddingSize: "md",
};

const CTA_BUILTIN_PRESETS = [
  { id: "upstream", name: "Upstream", style: CTA_UPSTREAM },
  { id: "filled", name: "Filled", style: { ...CTA_DEFAULT_STYLE } },
  {
    id: "outline",
    name: "Outline",
    style: {
      bgColor: "background",
      textColor: "primary",
      borderRadius: "md",
      border: "solid",
      borderColor: "primary",
      shadow: "none",
      fontWeight: "semibold",
      textTransform: "none",
      paddingSize: "md",
    },
  },
  {
    id: "pill",
    name: "Pill",
    style: {
      bgColor: "primary",
      textColor: "background",
      borderRadius: "full",
      border: "none",
      shadow: "none",
      fontWeight: "semibold",
      textTransform: "none",
      paddingSize: "md",
    },
  },
  {
    id: "secondary",
    name: "Secondary",
    style: {
      bgColor: "secondary",
      textColor: "foreground",
      borderRadius: "md",
      border: "none",
      shadow: "none",
      fontWeight: "semibold",
      textTransform: "none",
      paddingSize: "md",
    },
  },
];

/** Client-side mirror of normalizeCtaStyle from shopSettings.js */
function normalizeCtaStyleClient(source) {
  if (!source || typeof source !== "object") return { type: "upstream" };
  if (source.type === "upstream") return { type: "upstream" };
  const validBg = new Set(CTA_BG_COLORS);
  const validText = new Set(CTA_TEXT_COLORS);
  const validRadius = new Set(CTA_BORDER_RADII);
  const validBorder = new Set(CTA_BORDERS);
  const validBorderColor = new Set(CTA_BORDER_COLORS);
  const validShadow = new Set(CTA_SHADOWS);
  const validWeight = new Set(CTA_FONT_WEIGHTS);
  const validTransform = new Set(CTA_TEXT_TRANSFORMS);
  const validPadding = new Set(CTA_PADDING_SIZES);
  if (!validBg.has(source.bgColor)) return { type: "upstream" };
  const bgColor = source.bgColor;
  const textColor = validText.has(source.textColor)
    ? source.textColor
    : "background";
  const borderRadius = validRadius.has(source.borderRadius)
    ? source.borderRadius
    : "md";
  const border = validBorder.has(source.border) ? source.border : "none";
  const shadow = validShadow.has(source.shadow) ? source.shadow : "none";
  const fontWeight = validWeight.has(source.fontWeight)
    ? source.fontWeight
    : "semibold";
  const textTransform = validTransform.has(source.textTransform)
    ? source.textTransform
    : "none";
  const paddingSize = validPadding.has(source.paddingSize)
    ? source.paddingSize
    : "md";
  const result = {
    bgColor,
    textColor,
    borderRadius,
    border,
    shadow,
    fontWeight,
    textTransform,
    paddingSize,
  };
  if (bgColor === "custom") result.bgCustom = source.bgCustom || "#000000";
  if (textColor === "custom")
    result.textCustom = source.textCustom || "#ffffff";
  if (border === "solid") {
    result.borderColor = validBorderColor.has(source.borderColor)
      ? source.borderColor
      : "primary";
    if (result.borderColor === "custom")
      result.borderCustom = source.borderCustom || "#000000";
  }
  return result;
}

/** Resolve a color slot to a hex string using current siteStyleTokens. */
function resolveCtaColor(slot, customValue, tokens) {
  if (slot === "custom") return customValue || "#000000";
  return tokens[slot] || "";
}

/** Compute inline style for the Button Style live preview button. */
function ctaPreviewStyle(cta, tokens) {
  if (!cta || cta.type === "upstream") return {};
  const bg = resolveCtaColor(cta.bgColor, cta.bgCustom, tokens);
  const color = resolveCtaColor(cta.textColor, cta.textCustom, tokens);
  const borderColor =
    cta.border === "solid"
      ? resolveCtaColor(cta.borderColor, cta.borderCustom, tokens)
      : "transparent";
  const pad = CTA_PADDING_MAP[cta.paddingSize] || CTA_PADDING_MAP.md;
  return {
    backgroundColor: bg,
    color,
    borderRadius: CTA_RADIUS_MAP[cta.borderRadius] || "8px",
    border: `${cta.border === "solid" ? "1px" : "0px"} solid ${borderColor}`,
    boxShadow: CTA_SHADOW_MAP[cta.shadow] || "none",
    fontWeight: CTA_FONT_WEIGHT_MAP[cta.fontWeight] || 600,
    textTransform: cta.textTransform || "none",
    padding: `${pad.y} ${pad.x}`,
    cursor: "default",
    fontSize: "0.875rem",
    display: "inline-block",
  };
}
```

- [ ] **Step 2: Add ctaStyle to sanitizeSiteStyleTokens**

Find `sanitizeSiteStyleTokens` function. Add `ctaStyle` as the last field:

```js
function sanitizeSiteStyleTokens(input, fallback = SITE_STYLE_DEFAULTS) {
  const source = input && typeof input === "object" ? input : {};
  return {
    // ... all existing fields ...
    ctaStyle: normalizeCtaStyleClient(source.ctaStyle),
  };
}
```

- [ ] **Step 3: Extend applySiteStyleTokensToDom to set --btn-\* vars**

Find `applySiteStyleTokensToDom`. After the existing `root.style.setProperty` calls, add:

```js
// Apply --btn-* CSS vars for CTA button style
const cta = safe.ctaStyle;
if (cta && cta.type !== "upstream" && cta.bgColor) {
  const resolve = (slot, custom) => {
    if (slot === "custom") return custom || "";
    const varMap = {
      primary: "var(--color-primary)",
      secondary: "var(--color-secondary)",
      foreground: "var(--color-foreground)",
      background: "var(--color-background)",
    };
    return varMap[slot] || "";
  };
  root.style.setProperty("--btn-bg", resolve(cta.bgColor, cta.bgCustom));
  root.style.setProperty("--btn-color", resolve(cta.textColor, cta.textCustom));
  root.style.setProperty(
    "--btn-radius",
    CTA_RADIUS_MAP[cta.borderRadius] || "8px",
  );
  root.style.setProperty(
    "--btn-border-width",
    cta.border === "solid" ? "1px" : "0px",
  );
  root.style.setProperty(
    "--btn-border-color",
    cta.border === "solid"
      ? resolve(cta.borderColor, cta.borderCustom)
      : "transparent",
  );
  root.style.setProperty("--btn-shadow", CTA_SHADOW_MAP[cta.shadow] || "none");
  root.style.setProperty(
    "--btn-font-weight",
    String(CTA_FONT_WEIGHT_MAP[cta.fontWeight] || 600),
  );
  root.style.setProperty("--btn-text-transform", cta.textTransform || "none");
  const pad = CTA_PADDING_MAP[cta.paddingSize] || CTA_PADDING_MAP.md;
  root.style.setProperty("--btn-padding-x", pad.x);
  root.style.setProperty("--btn-padding-y", pad.y);
} else {
  // Upstream — remove overrides so WP theme styles apply
  [
    "--btn-bg",
    "--btn-color",
    "--btn-radius",
    "--btn-border-width",
    "--btn-border-color",
    "--btn-shadow",
    "--btn-font-weight",
    "--btn-text-transform",
    "--btn-padding-x",
    "--btn-padding-y",
  ].forEach((v) => root.style.removeProperty(v));
}
```

- [ ] **Step 4: Add `userCtaPresets` state and load from API**

Find the existing `useState` hooks (around line 686). Add new state:

```js
const [userCtaPresets, setUserCtaPresets] = useState([]);
const [ctaSaveName, setCtaSaveName] = useState("");
const [ctaSaveExpanded, setCtaSaveExpanded] = useState(false);
```

In the `useEffect` that loads settings (the one calling `adminFetch` for the settings), also load presets:

```js
// Load style presets
adminFetch("/api/admin/style-presets")
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (data?.ok && Array.isArray(data.cta)) {
      setUserCtaPresets(data.cta);
    }
  })
  .catch(() => {});
```

- [ ] **Step 5: Add Button Style section UI**

Find the style tab section in AdminDashboard (look for `activeTab === "style"` check). The font browser plan added font role cards and a themes strip. Below the themes strip, add the Button Style section:

```jsx
{
  /* ── Button Style ─────────────────────────────────────────────── */
}
<div className="space-y-4">
  <div className="text-sm font-semibold text-gray-800">Button Style</div>

  {/* Preset strip */}
  <div className="flex flex-wrap gap-2 items-center">
    {CTA_BUILTIN_PRESETS.map((preset) => {
      const isActive =
        preset.id === "upstream"
          ? siteStyleTokens.ctaStyle?.type === "upstream"
          : JSON.stringify(
              normalizeCtaStyleClient(siteStyleTokens.ctaStyle),
            ) === JSON.stringify(preset.style);
      return (
        <button
          key={preset.id}
          onClick={() => {
            const next = { ...siteStyleTokens, ctaStyle: preset.style };
            setSiteStyleTokens(next);
            applySiteStyleTokensToDom(next);
          }}
          className={`px-3 py-1 text-xs rounded border ${isActive ? "bg-purple-100 border-purple-400 text-purple-700 font-semibold" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}
        >
          {preset.name}
          {preset.id === "upstream" && isActive ? " ●" : ""}
        </button>
      );
    })}

    {userCtaPresets.map((preset) => (
      <div key={preset.id} className="flex items-center gap-1">
        <button
          onClick={() => {
            const next = { ...siteStyleTokens, ctaStyle: preset.style };
            setSiteStyleTokens(next);
            applySiteStyleTokensToDom(next);
          }}
          className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:border-gray-400"
        >
          {preset.name}
        </button>
        <button
          onClick={async () => {
            await adminFetch("/api/admin/style-presets", {
              method: "DELETE",
              body: JSON.stringify({ id: preset.id, type: "cta" }),
            });
            setUserCtaPresets((prev) => prev.filter((p) => p.id !== preset.id));
          }}
          className="text-gray-400 hover:text-red-500 text-xs leading-none"
          title="Delete preset"
        >
          ×
        </button>
      </div>
    ))}

    {/* Save current… */}
    {!ctaSaveExpanded ? (
      <button
        onClick={() => setCtaSaveExpanded(true)}
        className="px-3 py-1 text-xs rounded border border-dashed border-gray-300 text-gray-500 hover:border-gray-400"
      >
        Save current…
      </button>
    ) : (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={ctaSaveName}
          onChange={(e) => setCtaSaveName(e.target.value)}
          placeholder="Preset name"
          className="text-xs border border-gray-300 rounded px-2 py-1 w-36"
          autoFocus
        />
        <button
          onClick={async () => {
            if (!ctaSaveName.trim()) return;
            const res = await adminFetch("/api/admin/style-presets", {
              method: "POST",
              body: JSON.stringify({
                type: "cta",
                name: ctaSaveName.trim(),
                style: siteStyleTokens.ctaStyle,
              }),
            });
            const data = await res.json();
            if (data?.ok && data.preset) {
              setUserCtaPresets((prev) => [data.preset, ...prev]);
              setCtaSaveName("");
              setCtaSaveExpanded(false);
            }
          }}
          className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700"
        >
          Save
        </button>
        <button
          onClick={() => {
            setCtaSaveExpanded(false);
            setCtaSaveName("");
          }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
    )}
  </div>

  {/* Live preview */}
  {siteStyleTokens.ctaStyle?.type === "upstream" ? (
    <div className="text-xs text-gray-400 italic">
      Using WordPress default button styles
    </div>
  ) : (
    <div>
      <button
        style={ctaPreviewStyle(siteStyleTokens.ctaStyle, siteStyleTokens)}
      >
        Shop Now →
      </button>
    </div>
  )}

  {/* Controls — disabled when upstream */}
  {siteStyleTokens.ctaStyle?.type !== "upstream" && (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Background", field: "bgColor", options: CTA_BG_COLORS },
        { label: "Text Color", field: "textColor", options: CTA_TEXT_COLORS },
        { label: "Border", field: "border", options: CTA_BORDERS },
        { label: "Shadow", field: "shadow", options: CTA_SHADOWS },
        { label: "Radius", field: "borderRadius", options: CTA_BORDER_RADII },
        {
          label: "Font Weight",
          field: "fontWeight",
          options: CTA_FONT_WEIGHTS,
        },
        {
          label: "Text Case",
          field: "textTransform",
          options: CTA_TEXT_TRANSFORMS,
        },
        { label: "Padding", field: "paddingSize", options: CTA_PADDING_SIZES },
      ].map(({ label, field, options }) => (
        <div key={field} className="flex items-center justify-between gap-2">
          <label className="text-xs text-gray-600 w-24 shrink-0">{label}</label>
          <select
            value={siteStyleTokens.ctaStyle?.[field] || ""}
            onChange={(e) => {
              const next = {
                ...siteStyleTokens,
                ctaStyle: normalizeCtaStyleClient({
                  ...siteStyleTokens.ctaStyle,
                  [field]: e.target.value,
                }),
              };
              setSiteStyleTokens(next);
              applySiteStyleTokensToDom(next);
            }}
            className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      ))}

      {/* Border color — only when border === solid */}
      {siteStyleTokens.ctaStyle?.border === "solid" && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-gray-600 w-24 shrink-0">
            Border Color
          </label>
          <select
            value={siteStyleTokens.ctaStyle?.borderColor || "primary"}
            onChange={(e) => {
              const next = {
                ...siteStyleTokens,
                ctaStyle: normalizeCtaStyleClient({
                  ...siteStyleTokens.ctaStyle,
                  borderColor: e.target.value,
                }),
              };
              setSiteStyleTokens(next);
              applySiteStyleTokensToDom(next);
            }}
            className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
          >
            {CTA_BORDER_COLORS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* bgColor custom hex input */}
      {siteStyleTokens.ctaStyle?.bgColor === "custom" && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-gray-600 w-24 shrink-0">BG Hex</label>
          <input
            type="color"
            value={siteStyleTokens.ctaStyle?.bgCustom || "#000000"}
            onChange={(e) => {
              const next = {
                ...siteStyleTokens,
                ctaStyle: {
                  ...siteStyleTokens.ctaStyle,
                  bgCustom: e.target.value,
                },
              };
              setSiteStyleTokens(next);
              applySiteStyleTokensToDom(next);
            }}
            className="h-7 w-16 border border-gray-300 rounded cursor-pointer"
          />
        </div>
      )}

      {/* textColor custom hex input */}
      {siteStyleTokens.ctaStyle?.textColor === "custom" && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-gray-600 w-24 shrink-0">
            Text Hex
          </label>
          <input
            type="color"
            value={siteStyleTokens.ctaStyle?.textCustom || "#ffffff"}
            onChange={(e) => {
              const next = {
                ...siteStyleTokens,
                ctaStyle: {
                  ...siteStyleTokens.ctaStyle,
                  textCustom: e.target.value,
                },
              };
              setSiteStyleTokens(next);
              applySiteStyleTokensToDom(next);
            }}
            className="h-7 w-16 border border-gray-300 rounded cursor-pointer"
          />
        </div>
      )}
    </div>
  )}
</div>;
```

- [ ] **Step 6: Verify the UI renders without errors**

```bash
npm run dev
```

Open the admin style tab. Verify:

- Preset strip shows Upstream, Filled, Outline, Pill, Secondary
- Clicking a preset updates the preview
- Upstream selection disables controls and shows the "Using WordPress default" message
- Controls update the live preview in real time

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/AdminDashboard.js
git commit -m "feat: add ctaStyle state and Button Style section to admin style tab"
```

---

## Task 7: AdminDashboard — Typography preset saving

**Files:**

- Modify: `src/components/admin/AdminDashboard.js`

Adds `Save current…` inline input to the existing themes strip (added by the font browser plan) and lets users delete user-created typography presets.

- [ ] **Step 1: Add typography preset state**

Add these new state variables near the other preset state from Task 6:

```js
const [userTypographyPresets, setUserTypographyPresets] = useState([]);
const [typographySaveName, setTypographySaveName] = useState("");
const [typographySaveExpanded, setTypographySaveExpanded] = useState(false);
```

- [ ] **Step 2: Load user typography presets from API**

In the same useEffect that loads CTA presets (added in Task 6 Step 4), also populate typography presets:

```js
// Inside the .then() for the style-presets fetch:
if (data?.ok) {
  if (Array.isArray(data.cta)) setUserCtaPresets(data.cta);
  if (Array.isArray(data.typography)) setUserTypographyPresets(data.typography);
}
```

- [ ] **Step 3: Add user preset display and Save current… to the themes strip**

Find the themes strip in the style tab (added by the font browser plan). It currently shows five built-in theme buttons: Clean, Editorial, Technical, Warm, Haute. After the last built-in theme button, add:

```jsx
{
  /* User typography presets */
}
{
  userTypographyPresets.map((preset) => (
    <div key={preset.id} className="flex items-center gap-1">
      <button
        onClick={() => {
          // Apply all fields from the preset — mirrors how built-in themes are applied
          const s = preset.style;
          const next = {
            ...siteStyleTokens,
            fontDisplay: s.fontDisplay || siteStyleTokens.fontDisplay,
            fontHeading: s.fontHeading || siteStyleTokens.fontHeading,
            fontSubheading: s.fontSubheading || siteStyleTokens.fontSubheading,
            fontBody: s.fontBody || siteStyleTokens.fontBody,
            fontButton: s.fontButton || siteStyleTokens.fontButton,
            typographyPalette:
              s.typographyPalette || siteStyleTokens.typographyPalette,
            linkStyle: s.linkStyle || siteStyleTokens.linkStyle,
          };
          setSiteStyleTokens(next);
          applySiteStyleTokensToDom(next);
        }}
        className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:border-gray-400"
      >
        {preset.name}
      </button>
      <button
        onClick={async () => {
          await adminFetch("/api/admin/style-presets", {
            method: "DELETE",
            body: JSON.stringify({ id: preset.id, type: "typography" }),
          });
          setUserTypographyPresets((prev) =>
            prev.filter((p) => p.id !== preset.id),
          );
        }}
        className="text-gray-400 hover:text-red-500 text-xs leading-none"
        title="Delete preset"
      >
        ×
      </button>
    </div>
  ));
}

{
  /* Save current typography preset */
}
{
  !typographySaveExpanded ? (
    <button
      onClick={() => setTypographySaveExpanded(true)}
      className="px-3 py-1 text-xs rounded border border-dashed border-gray-300 text-gray-500 hover:border-gray-400"
    >
      Save current…
    </button>
  ) : (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={typographySaveName}
        onChange={(e) => setTypographySaveName(e.target.value)}
        placeholder="Preset name"
        className="text-xs border border-gray-300 rounded px-2 py-1 w-44"
        autoFocus
      />
      <button
        onClick={async () => {
          if (!typographySaveName.trim()) return;
          const style = {
            fontDisplay: siteStyleTokens.fontDisplay,
            fontHeading: siteStyleTokens.fontHeading,
            fontSubheading: siteStyleTokens.fontSubheading,
            fontBody: siteStyleTokens.fontBody,
            fontButton: siteStyleTokens.fontButton,
            typographyPalette: siteStyleTokens.typographyPalette,
            linkStyle: siteStyleTokens.linkStyle,
          };
          const res = await adminFetch("/api/admin/style-presets", {
            method: "POST",
            body: JSON.stringify({
              type: "typography",
              name: typographySaveName.trim(),
              style,
            }),
          });
          const data = await res.json();
          if (data?.ok && data.preset) {
            setUserTypographyPresets((prev) => [data.preset, ...prev]);
            setTypographySaveName("");
            setTypographySaveExpanded(false);
          }
        }}
        className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700"
      >
        Save
      </button>
      <button
        onClick={() => {
          setTypographySaveExpanded(false);
          setTypographySaveName("");
        }}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify typography preset saving works end-to-end**

```bash
npm run dev
```

Open the admin style tab:

1. Apply any theme (e.g., Clean)
2. Click "Save current…" in the themes strip
3. Type "my-clean-test" and click Save
4. Verify the preset appears in the strip
5. Click the preset to apply it
6. Click × to delete it
7. Verify it disappears

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AdminDashboard.js
git commit -m "feat: add typography preset saving and user preset strip to themes section"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Run all tests**

```bash
node --test tests/**/*.test.js
```

Expected: all PASS

- [ ] **Step 2: Verify ctaStyle is saved and restored correctly**

```bash
npm run dev
```

1. Open admin → Style tab
2. Select "Pill" preset — verify preview shows pill shape
3. Click "Save" (the main style save button)
4. Hard-refresh the browser
5. Verify the Pill preset is still selected and the live site shows the correct button style

- [ ] **Step 3: Verify upstream passthrough**

1. In admin Style tab, select "Upstream" for Button Style
2. Save
3. On the live site, verify WP theme button styles apply (no `--btn-*` override in computed styles)

- [ ] **Step 4: Verify named CTA preset CRUD**

1. Select "Outline" preset, modify the border radius to "lg"
2. Click "Save current…", name it "Outline LG", save
3. Verify it appears after the built-in presets
4. Reload admin — verify it persists
5. Click × — verify it is deleted and doesn't reappear on reload

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: end-to-end verification corrections for CTA button named presets"
```
