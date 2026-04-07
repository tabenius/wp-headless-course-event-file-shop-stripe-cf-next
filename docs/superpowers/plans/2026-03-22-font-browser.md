# Font Browser & Typography System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full Google Fonts browser to the admin style editor with five named typography roles, per-role heading colors, link hover style variants, and five built-in themes — fonts self-hosted on R2, previewed via Google CDN.

**Architecture:** Site style is stored in Cloudflare KV under `"shop-settings"` and applied at runtime by an inline JS snippet in `layout.js` that fetches `/api/site-style` and sets CSS custom properties. Downloaded fonts are stored in KV under `"fonts:downloaded"` and served as `@font-face` CSS via a new public `/api/site-fonts` route, linked from `<head>`. The admin style tab in `AdminDashboard.js` gains five font role cards, a two-swatch color palette, link hover controls, and a theme strip; a new `AdminFontBrowserModal` component handles Google Fonts browsing.

**Tech Stack:** Next.js App Router, Cloudflare Workers, Cloudflare KV (via HTTP API in `cloudflareKv.js`), Cloudflare R2 (via `s3upload.putBucketObject`), `node:test` + `node:assert/strict` for tests, Tailwind CSS v4, React 19.

**Spec:** `docs/superpowers/specs/2026-03-22-font-browser-design.md`

---

## File Map

**New files:**

- `src/lib/downloadedFonts.js` — KV CRUD for the `fonts:downloaded` array
- `src/lib/googleFontsCatalog.js` — catalog fetch (API key or snapshot) + 24h KV cache
- `src/lib/fontDownload.js` — download font from Google → R2 + generate @font-face CSS
- `src/lib/typographyThemes.js` — five built-in theme presets as siteStyle fragments
- `src/app/api/admin/fonts/catalog/route.js` — GET catalog endpoint
- `src/app/api/admin/fonts/download/route.js` — POST download endpoint
- `src/app/api/site-fonts/route.js` — public @font-face CSS endpoint
- `src/components/admin/AdminFontBrowserModal.js` — font picker modal
- `src/lib/googleFontsSnapshot.json` — bundled font catalog fallback (~1500 entries)
- `tests/downloadedFonts.test.js`
- `tests/googleFontsCatalog.test.js`
- `tests/fontDownload.test.js`
- `tests/shopSettings-fonts.test.js`

**Modified files:**

- `src/lib/shopSettings.js` — add new font role fields + normalization + migration
- `src/app/globals.css` — add 5 font variable bindings, 3 color variables, 7 link hover variants
- `src/app/theme.generated.css` — add 5 new font variables + 3 color variable defaults
- `src/app/layout.js` — add site-fonts `<link>`, extend inline script for new variables
- `src/components/admin/AdminDashboard.js` — replace font UI with role cards + palette + modal
- `src/lib/i18n/en.json`, `sv.json`, `es.json` — new typography keys

---

## Task 1: downloadedFonts KV helper

**Files:**

- Create: `src/lib/downloadedFonts.js`
- Create: `tests/downloadedFonts.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/downloadedFonts.test.js
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// We'll mock cloudflareKv before importing the module under test
const mockRead = mock.fn(async () => null);
const mockWrite = mock.fn(async () => true);

mock.module("../src/lib/cloudflareKv.js", {
  namedExports: {
    readCloudflareKvJson: mockRead,
    writeCloudflareKvJson: mockWrite,
  },
});

const { getDownloadedFonts, upsertDownloadedFont, getAllFontFaceCss } =
  await import("../src/lib/downloadedFonts.js");

describe("getDownloadedFonts", () => {
  beforeEach(() => {
    mockRead.mock.resetCalls();
    mockWrite.mock.resetCalls();
  });

  it("returns [] when KV is empty", async () => {
    mockRead.mock.implementation = async () => null;
    assert.deepEqual(await getDownloadedFonts(), []);
  });

  it("returns stored array", async () => {
    const stored = [
      {
        family: "Inter",
        slug: "inter",
        isVariable: true,
        weightRange: [100, 900],
        fontFaceCss: "@font-face{}",
      },
    ];
    mockRead.mock.implementation = async () => stored;
    assert.deepEqual(await getDownloadedFonts(), stored);
  });
});

describe("upsertDownloadedFont", () => {
  it("inserts a new font record", async () => {
    mockRead.mock.implementation = async () => [];
    const record = {
      family: "Inter",
      slug: "inter",
      isVariable: true,
      weightRange: [100, 900],
      fontFaceCss: "@font-face{}",
    };
    await upsertDownloadedFont(record);
    const writtenData = mockWrite.mock.calls[0].arguments[1];
    assert.equal(writtenData.length, 1);
    assert.equal(writtenData[0].family, "Inter");
  });

  it("replaces existing record by family", async () => {
    const existing = [
      {
        family: "Inter",
        slug: "inter",
        isVariable: false,
        weights: [400],
        fontFaceCss: "old",
      },
    ];
    mockRead.mock.implementation = async () => existing;
    const updated = {
      family: "Inter",
      slug: "inter",
      isVariable: true,
      weightRange: [100, 900],
      fontFaceCss: "new",
    };
    await upsertDownloadedFont(updated);
    const writtenData = mockWrite.mock.calls[0].arguments[1];
    assert.equal(writtenData.length, 1);
    assert.equal(writtenData[0].fontFaceCss, "new");
  });
});

describe("getAllFontFaceCss", () => {
  it("concatenates fontFaceCss from all records", () => {
    const fonts = [
      { fontFaceCss: "@font-face{font-family:'Inter'}" },
      { fontFaceCss: "@font-face{font-family:'Lora'}" },
    ];
    const result = getAllFontFaceCss(fonts);
    assert.ok(result.includes("Inter"));
    assert.ok(result.includes("Lora"));
  });

  it("returns empty string for empty array", () => {
    assert.equal(getAllFontFaceCss([]), "");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/xyzzy/articulate-universe/main
node --experimental-test-module-mocks --test tests/downloadedFonts.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement downloadedFonts.js**

```js
// src/lib/downloadedFonts.js
import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const KV_KEY = "fonts:downloaded";

/** Returns all downloaded font records from KV, or [] if none. */
export async function getDownloadedFonts() {
  const data = await readCloudflareKvJson(KV_KEY);
  return Array.isArray(data) ? data : [];
}

/**
 * Upserts a font record by family name.
 * Full replacement of the existing record for that family.
 */
export async function upsertDownloadedFont(record) {
  const fonts = await getDownloadedFonts();
  const idx = fonts.findIndex((f) => f.family === record.family);
  if (idx >= 0) {
    fonts[idx] = record;
  } else {
    fonts.push(record);
  }
  await writeCloudflareKvJson(KV_KEY, fonts);
}

/**
 * Concatenates fontFaceCss from all downloaded font records.
 * @param {Array} fonts  Result of getDownloadedFonts()
 * @returns {string}
 */
export function getAllFontFaceCss(fonts) {
  if (!Array.isArray(fonts) || fonts.length === 0) return "";
  return fonts
    .map((f) => f.fontFaceCss || "")
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --experimental-test-module-mocks --test tests/downloadedFonts.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/downloadedFonts.js tests/downloadedFonts.test.js
git commit -m "feat: add downloadedFonts KV helper"
```

---

## Task 2: Google Fonts catalog helper

**Files:**

- Create: `src/lib/googleFontsCatalog.js`
- Create: `src/lib/googleFontsSnapshot.json`
- Create: `scripts/fetch-fonts-snapshot.mjs`
- Create: `tests/googleFontsCatalog.test.js`

### 2a: Create the bundled snapshot

- [ ] **Step 1: Create fetch script**

```js
// scripts/fetch-fonts-snapshot.mjs
// Run once: node scripts/fetch-fonts-snapshot.mjs
// Requires GOOGLE_FONTS_API_KEY env var. Writes to src/lib/googleFontsSnapshot.json.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const key = process.env.GOOGLE_FONTS_API_KEY;
if (!key) {
  console.error("Set GOOGLE_FONTS_API_KEY first.");
  process.exit(1);
}

const res = await fetch(
  `https://www.googleapis.com/webfonts/v1/webfonts?key=${key}&sort=popularity`,
);
if (!res.ok) throw new Error(`Failed: ${res.status}`);
const { items } = await res.json();

const fonts = items.map(({ family, category, axes, variants }) => ({
  family,
  category,
  axes: axes || [],
  variants: variants || [],
}));

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/googleFontsSnapshot.json",
);
writeFileSync(outPath, JSON.stringify({ fonts }, null, 2));
console.log(`Wrote ${fonts.length} fonts to googleFontsSnapshot.json`);
```

- [ ] **Step 2: Run the script to populate snapshot**

If you have a Google Fonts API key:

```bash
GOOGLE_FONTS_API_KEY=your_key node scripts/fetch-fonts-snapshot.mjs
```

If not, create a minimal snapshot with the most common fonts:

```bash
cat > src/lib/googleFontsSnapshot.json << 'EOF'
{
  "fonts": [
    {"family":"Roboto","category":"sans-serif","axes":[{"tag":"wght","start":100,"end":900}],"variants":["100","300","regular","500","700","900"]},
    {"family":"Open Sans","category":"sans-serif","axes":[{"tag":"wdth","start":75,"end":100},{"tag":"wght","start":300,"end":800}],"variants":["300","regular","500","600","700","800"]},
    {"family":"Lato","category":"sans-serif","axes":[],"variants":["100","300","regular","700","900"]},
    {"family":"Montserrat","category":"sans-serif","axes":[{"tag":"wght","start":100,"end":900}],"variants":["100","200","300","regular","500","600","700","800","900"]},
    {"family":"Raleway","category":"sans-serif","axes":[{"tag":"wght","start":100,"end":900}],"variants":["100","200","300","regular","500","600","700","800","900"]},
    {"family":"Nunito","category":"sans-serif","axes":[{"tag":"wght","start":200,"end":900}],"variants":["200","300","regular","500","600","700","800","900"]},
    {"family":"Inter","category":"sans-serif","axes":[{"tag":"wght","start":100,"end":900}],"variants":["100","200","300","regular","500","600","700","800","900"]},
    {"family":"Playfair Display","category":"serif","axes":[{"tag":"wght","start":400,"end":900}],"variants":["regular","500","600","700","800","900"]},
    {"family":"Merriweather","category":"serif","axes":[],"variants":["300","regular","700","900"]},
    {"family":"Lora","category":"serif","axes":[{"tag":"wght","start":400,"end":700}],"variants":["regular","500","600","700"]},
    {"family":"Crimson Pro","category":"serif","axes":[{"tag":"wght","start":200,"end":900}],"variants":["200","300","regular","500","600","700","800","900"]},
    {"family":"Cormorant Garamond","category":"serif","axes":[],"variants":["300","regular","500","600","700"]},
    {"family":"DM Sans","category":"sans-serif","axes":[{"tag":"opsz","start":9,"end":40},{"tag":"wght","start":100,"end":700}],"variants":["100","200","300","regular","500","600","700"]},
    {"family":"Space Grotesk","category":"sans-serif","axes":[{"tag":"wght","start":300,"end":700}],"variants":["300","regular","500","600","700"]},
    {"family":"IBM Plex Sans","category":"sans-serif","axes":[],"variants":["100","200","300","regular","500","600","700"]},
    {"family":"Fraunces","category":"serif","axes":[{"tag":"SOFT","start":0,"end":100},{"tag":"WONK","start":0,"end":1},{"tag":"opsz","start":9,"end":144},{"tag":"wght","start":100,"end":900}],"variants":["100","200","300","regular","500","600","700","800","900"]},
    {"family":"Josefin Sans","category":"sans-serif","axes":[{"tag":"wght","start":100,"end":700}],"variants":["100","200","300","regular","500","600","700"]},
    {"family":"Poppins","category":"sans-serif","axes":[],"variants":["100","200","300","regular","500","600","700","800","900"]}
  ]
}
EOF
```

_(Run the fetch script when an API key is available to get the full 1500-font catalog.)_

### 2b: Implement the catalog helper

- [ ] **Step 3: Write the failing tests**

```js
// tests/googleFontsCatalog.test.js
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const mockRead = mock.fn(async () => null);
const mockWrite = mock.fn(async () => true);
mock.module("../src/lib/cloudflareKv.js", {
  namedExports: {
    readCloudflareKvJson: mockRead,
    writeCloudflareKvJson: mockWrite,
  },
});

const { normalizeCatalog, isVariableFont } = await import(
  "../src/lib/googleFontsCatalog.js"
);

describe("normalizeCatalog", () => {
  it("normalizes Google Fonts API response", () => {
    const raw = {
      items: [
        {
          family: "Inter",
          category: "sans-serif",
          axes: [{ tag: "wght" }],
          variants: ["regular"],
        },
        {
          family: "Lora",
          category: "serif",
          axes: [],
          variants: ["regular", "700"],
        },
      ],
    };
    const result = normalizeCatalog(raw);
    assert.equal(result.fonts.length, 2);
    assert.equal(result.fonts[0].family, "Inter");
  });

  it("normalizes snapshot format (already normalized)", () => {
    const snapshot = {
      fonts: [
        { family: "Inter", category: "sans-serif", axes: [], variants: [] },
      ],
    };
    const result = normalizeCatalog(snapshot);
    assert.equal(result.fonts[0].family, "Inter");
  });
});

describe("isVariableFont", () => {
  it("returns true when axes contains wght", () => {
    assert.equal(isVariableFont([{ tag: "wght" }]), true);
  });
  it("returns false when axes is empty", () => {
    assert.equal(isVariableFont([]), false);
  });
  it("returns false when axes is undefined", () => {
    assert.equal(isVariableFont(undefined), false);
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
node --experimental-test-module-mocks --test tests/googleFontsCatalog.test.js
```

- [ ] **Step 5: Implement googleFontsCatalog.js**

```js
// src/lib/googleFontsCatalog.js
import {
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";
import snapshot from "@/lib/googleFontsSnapshot.json";

const CATALOG_KV_KEY = "fonts:catalog";
const CATALOG_TTL = 86400; // 24 hours

/**
 * Normalizes a Google Fonts API response OR the bundled snapshot into
 * the canonical { fonts: [{ family, category, axes, variants }] } shape.
 */
export function normalizeCatalog(raw) {
  if (!raw || typeof raw !== "object") return { fonts: [] };
  // Google Fonts API format: { items: [...] }
  const items = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.fonts)
      ? raw.fonts
      : [];
  return {
    fonts: items.map(({ family, category, axes, variants }) => ({
      family: String(family || ""),
      category: String(category || ""),
      axes: Array.isArray(axes) ? axes : [],
      variants: Array.isArray(variants) ? variants : [],
    })),
  };
}

/**
 * Returns true when the axes array contains a wght entry (variable font).
 */
export function isVariableFont(axes) {
  if (!Array.isArray(axes)) return false;
  return axes.some((a) => a?.tag === "wght");
}

/**
 * Returns the catalog from KV cache, or fetches fresh, or falls back
 * to the bundled snapshot. Always writes result to KV for 24h.
 */
export async function getFontsCatalog() {
  // Try KV cache first
  const cached = await readCloudflareKvJson(CATALOG_KV_KEY);
  if (cached?.fonts?.length > 0) return cached;

  let catalog;
  const apiKey = process.env.GOOGLE_FONTS_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        catalog = normalizeCatalog(await res.json());
      }
    } catch {
      // Fall through to snapshot
    }
  }

  if (!catalog || catalog.fonts.length === 0) {
    catalog = normalizeCatalog(snapshot);
  }

  // Always cache (API or snapshot) so cold starts are fast
  await writeCloudflareKvJson(CATALOG_KV_KEY, catalog, {
    expirationTtl: CATALOG_TTL,
  });

  return catalog;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
node --experimental-test-module-mocks --test tests/googleFontsCatalog.test.js
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/googleFontsCatalog.js src/lib/googleFontsSnapshot.json \
        scripts/fetch-fonts-snapshot.mjs tests/googleFontsCatalog.test.js
git commit -m "feat: add Google Fonts catalog helper with KV cache and snapshot fallback"
```

---

## Task 3: Font download helper

**Files:**

- Create: `src/lib/fontDownload.js`
- Create: `tests/fontDownload.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/fontDownload.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { familyToSlug, buildFontFaceCss } from "../src/lib/fontDownload.js";

describe("familyToSlug", () => {
  it("converts family name to slug", () => {
    assert.equal(familyToSlug("Inter"), "inter");
    assert.equal(familyToSlug("Playfair Display"), "playfair-display");
    assert.equal(familyToSlug("DM Sans"), "dm-sans");
    assert.equal(familyToSlug("IBM Plex Sans"), "ibm-plex-sans");
  });
  it("strips non-alphanumeric characters", () => {
    assert.equal(familyToSlug("Font (Test)!"), "font-test");
  });
});

describe("buildFontFaceCss", () => {
  it("builds variable @font-face block", () => {
    const css = buildFontFaceCss(
      "Inter",
      "inter",
      true,
      [100, 900],
      [
        {
          r2Url: "https://r2.example.com/fonts/inter/inter-variable.woff2",
          unicodeRange: null,
        },
      ],
    );
    assert.ok(css.includes("font-family: 'Inter'"));
    assert.ok(css.includes("font-weight: 100 900"));
    assert.ok(css.includes("inter-variable.woff2"));
    assert.ok(css.includes("font-display: swap"));
  });

  it("builds non-variable @font-face block per weight", () => {
    const css = buildFontFaceCss("Lora", "lora", false, null, [
      {
        r2Url: "https://r2.example.com/fonts/lora/400.woff2",
        weight: 400,
        unicodeRange: null,
      },
      {
        r2Url: "https://r2.example.com/fonts/lora/700.woff2",
        weight: 700,
        unicodeRange: null,
      },
    ]);
    assert.ok(css.includes("font-weight: 400"));
    assert.ok(css.includes("font-weight: 700"));
    assert.ok(css.includes("400.woff2"));
    assert.ok(css.includes("700.woff2"));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --experimental-test-module-mocks --test tests/fontDownload.test.js
```

- [ ] **Step 3: Implement fontDownload.js**

```js
// src/lib/fontDownload.js
import { putBucketObject, headBucketObject } from "@/lib/s3upload";

const GOOGLE_FONTS_CSS_URL = "https://fonts.googleapis.com/css2";
// Modern Chrome UA → returns woff2 format
const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Converts a font family name to a URL-safe slug.
 * "Playfair Display" → "playfair-display"
 */
export function familyToSlug(family) {
  return String(family || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Builds @font-face CSS block(s) for the given font files.
 * @param {string}   family
 * @param {string}   slug
 * @param {boolean}  isVariable
 * @param {number[]|null} weightRange  e.g. [100, 900] — only for variable
 * @param {Array}    files  [{ r2Url, weight?, unicodeRange? }]
 * @returns {string}  one or more @font-face blocks
 */
export function buildFontFaceCss(family, slug, isVariable, weightRange, files) {
  return files
    .map(({ r2Url, weight, unicodeRange }) => {
      const weightDecl = isVariable
        ? `${weightRange[0]} ${weightRange[1]}`
        : String(weight || 400);
      const rangeDecl = unicodeRange
        ? `\n  unicode-range: ${unicodeRange};`
        : "";
      return `@font-face {\n  font-family: '${family}';\n  src: url('${r2Url}') format('woff2');\n  font-weight: ${weightDecl};\n  font-style: normal;\n  font-display: swap;${rangeDecl}\n}`;
    })
    .join("\n");
}

/**
 * Fetches Google Fonts CSS2 for a family and parses @font-face src + unicodeRange entries.
 * Returns [{ woff2Url, weight, unicodeRange }] — one per @font-face block.
 */
async function parseGoogleFontsCss(family, isVariable, weights) {
  const encoded = encodeURIComponent(family);
  let query;
  if (isVariable) {
    query = `family=${encoded}:wght@100..900&display=swap`;
  } else {
    query = `family=${encoded}:wght@${weights.join(";")}`;
  }
  const url = `${GOOGLE_FONTS_CSS_URL}?${query}`;
  const res = await fetch(url, {
    headers: { "User-Agent": FETCH_UA },
  });
  if (!res.ok)
    throw new Error(`Google Fonts CSS fetch failed (${res.status}): ${family}`);
  const css = await res.text();

  // Parse @font-face blocks
  const entries = [];
  const blockRe = /@font-face\s*\{([^}]+)\}/g;
  const srcRe = /src:\s*[^;]*url\(([^)]+)\)[^;]*format\(['"]woff2['"]\)/;
  const weightRe = /font-weight:\s*([^;]+);/;
  const rangeRe = /unicode-range:\s*([^;]+);/;

  let blockMatch;
  while ((blockMatch = blockRe.exec(css)) !== null) {
    const block = blockMatch[1];
    const srcMatch = srcRe.exec(block);
    if (!srcMatch) continue;
    const woff2Url = srcMatch[1].replace(/['"]/g, "").trim();
    const weightMatch = weightRe.exec(block);
    const rangeMatch = rangeRe.exec(block);
    // Extract weight number for non-variable (e.g. "400" or "700")
    const rawWeight = weightMatch ? weightMatch[1].trim() : "400";
    const weight = parseInt(rawWeight, 10) || 400;
    const unicodeRange = rangeMatch ? rangeMatch[1].trim() : null;
    entries.push({ woff2Url, weight, unicodeRange });
  }

  if (entries.length === 0) {
    throw new Error(
      `No woff2 entries found in Google Fonts CSS for: ${family}`,
    );
  }
  return entries;
}

/**
 * Downloads a Google Font to R2 and returns the complete @font-face CSS
 * with src URLs pointing to R2.
 *
 * @param {string}   family       e.g. "Inter"
 * @param {boolean}  isVariable
 * @param {number[]} weights      used only when !isVariable
 * @returns {Promise<{ fontFaceCss: string, slug: string, isVariable: boolean, weights?: number[], weightRange?: number[] }>}
 */
export async function downloadFontToR2(
  family,
  isVariable,
  weights = [400, 700],
) {
  const slug = familyToSlug(family);
  const r2BaseUrl =
    process.env.S3_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL || "";

  const entries = await parseGoogleFontsCss(family, isVariable, weights);

  const r2Files = [];
  // Deduplicate by woff2Url (Google sometimes returns the same file for multiple unicode ranges)
  const uploadedUrls = new Map();

  for (let i = 0; i < entries.length; i++) {
    const { woff2Url, weight, unicodeRange } = entries[i];

    let r2Key;
    if (uploadedUrls.has(woff2Url)) {
      r2Key = uploadedUrls.get(woff2Url);
    } else {
      // Build R2 key
      if (isVariable) {
        r2Key = `fonts/${slug}/${slug}-variable.woff2`; // Always fixed name — URL dedup prevents duplicate uploads
      } else {
        r2Key = `fonts/${slug}/${weight}${entries.length > weights.length ? `-${i}` : ""}.woff2`;
      }

      // Check if file already exists in R2 (skip re-upload)
      let exists = false;
      try {
        await headBucketObject({ key: r2Key, backend: "r2" });
        exists = true;
      } catch {
        // Not found — upload
      }

      if (!exists) {
        const fontRes = await fetch(woff2Url);
        if (!fontRes.ok)
          throw new Error(`Failed to download font file: ${woff2Url}`);
        const fontBytes = Buffer.from(await fontRes.arrayBuffer());
        await putBucketObject({
          key: r2Key,
          body: fontBytes,
          contentType: "font/woff2",
          backend: "r2",
        });
      }

      uploadedUrls.set(woff2Url, r2Key);
    }

    r2Files.push({
      r2Url: `${r2BaseUrl}/${r2Key}`,
      weight,
      unicodeRange,
    });
  }

  // Build @font-face CSS
  const weightRange = isVariable ? [100, 900] : null;
  const fontFaceCss = buildFontFaceCss(
    family,
    slug,
    isVariable,
    weightRange,
    r2Files,
  );

  // Extract unique weights for non-variable
  const uniqueWeights = isVariable
    ? undefined
    : [...new Set(r2Files.map((f) => f.weight))].sort((a, b) => a - b);

  return {
    family,
    slug,
    isVariable,
    ...(isVariable ? { weightRange: [100, 900] } : { weights: uniqueWeights }),
    fontFaceCss,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --experimental-test-module-mocks --test tests/fontDownload.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/fontDownload.js tests/fontDownload.test.js
git commit -m "feat: add font download helper with R2 upload and @font-face generation"
```

---

## Task 4: Extend siteStyle data model

**Files:**

- Modify: `src/lib/shopSettings.js`
- Create: `tests/shopSettings-fonts.test.js`

### Understanding the current code

`normalizeSiteStyle()` (line 96 in `shopSettings.js`) currently validates `fontHeading` and `fontBody` as strings against `SITE_FONT_SET`. We need to:

1. Keep backward compat: if `fontHeading`/`fontBody` is a string (old format), coerce to `{ type: "preset", stack: value }`
2. Accept new object format for all 5 font roles
3. Add `typographyPalette`, `linkStyle` fields
4. Update `DEFAULT_SITE_STYLE` and `DEFAULTS`

- [ ] **Step 1: Write failing tests**

```js
// tests/shopSettings-fonts.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// We test the pure normalization functions by importing them.
// shopSettings.js exports them for testing purposes (add these exports).
import {
  normalizeFontRole,
  normalizeTypographyPalette,
  normalizeLinkStyle,
} from "../src/lib/shopSettings.js";

describe("normalizeFontRole", () => {
  it("accepts a valid preset role", () => {
    const input = { type: "preset", stack: "system-ui, sans-serif" };
    const result = normalizeFontRole(input, {
      type: "preset",
      stack: "system-ui",
    });
    assert.equal(result.type, "preset");
    assert.equal(result.stack, "system-ui, sans-serif");
  });

  it("accepts a google role", () => {
    const input = {
      type: "google",
      family: "Inter",
      isVariable: true,
      weightRange: [100, 900],
    };
    const result = normalizeFontRole(input, {
      type: "preset",
      stack: "system-ui",
    });
    assert.equal(result.type, "google");
    assert.equal(result.family, "Inter");
  });

  it("accepts inherit type", () => {
    const result = normalizeFontRole(
      { type: "inherit" },
      { type: "preset", stack: "system-ui" },
    );
    assert.equal(result.type, "inherit");
  });

  it("coerces old string fontHeading to preset object", () => {
    const result = normalizeFontRole(
      "var(--font-montserrat), 'Helvetica Neue', sans-serif",
      { type: "preset", stack: "system-ui" },
    );
    assert.equal(result.type, "preset");
    assert.ok(result.stack.includes("montserrat"));
  });

  it("returns fallback for invalid input", () => {
    const fallback = { type: "preset", stack: "system-ui" };
    const result = normalizeFontRole(null, fallback);
    assert.deepEqual(result, fallback);
  });

  it("strips unknown fields from google role", () => {
    const result = normalizeFontRole(
      {
        type: "google",
        family: "Inter",
        isVariable: true,
        weightRange: [100, 900],
        colorSlot: 1,
        evil: "hack",
      },
      { type: "preset", stack: "system-ui" },
    );
    assert.equal(result.evil, undefined);
    assert.equal(result.colorSlot, 1);
  });
});

describe("normalizeTypographyPalette", () => {
  it("returns default when absent", () => {
    assert.deepEqual(normalizeTypographyPalette(undefined), ["#111111"]);
  });
  it("accepts valid one-entry palette", () => {
    assert.deepEqual(normalizeTypographyPalette(["#0a0a0a"]), ["#0a0a0a"]);
  });
  it("accepts two-entry palette", () => {
    assert.deepEqual(normalizeTypographyPalette(["#0a0a0a", "#1c3d5a"]), [
      "#0a0a0a",
      "#1c3d5a",
    ]);
  });
  it("rejects non-hex entries", () => {
    assert.deepEqual(normalizeTypographyPalette(["notacolor"]), ["#111111"]);
  });
  it("caps at two entries", () => {
    const result = normalizeTypographyPalette(["#111", "#222", "#333"]);
    assert.equal(result.length, 2);
  });
});

describe("normalizeLinkStyle", () => {
  it("returns defaults when absent", () => {
    const result = normalizeLinkStyle(undefined);
    assert.equal(result.hoverVariant, "underline");
    assert.equal(result.underlineDefault, "hover");
  });
  it("accepts valid values", () => {
    const result = normalizeLinkStyle({
      hoverVariant: "highlight",
      underlineDefault: "always",
    });
    assert.equal(result.hoverVariant, "highlight");
  });
  it("rejects unknown hoverVariant", () => {
    const result = normalizeLinkStyle({ hoverVariant: "evil" });
    assert.equal(result.hoverVariant, "underline");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --experimental-test-module-mocks --test tests/shopSettings-fonts.test.js
```

- [ ] **Step 3: Add font normalization functions to shopSettings.js**

Add these constants and functions **before** `normalizeSiteStyle`. Also export them for testing.

```js
// After existing HEX_COLOR_RE constant, add:

const VALID_HOVER_VARIANTS = new Set([
  "none",
  "underline",
  "highlight",
  "inverse",
  "pill",
  "slide",
  "box",
]);
const VALID_UNDERLINE_DEFAULTS = new Set(["always", "hover", "never"]);

const DEFAULT_LINK_STYLE = {
  hoverVariant: "underline",
  underlineDefault: "hover",
};

const DEFAULT_FONT_ROLES = {
  fontDisplay: {
    type: "preset",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    colorSlot: 1,
  },
  fontHeading: {
    type: "preset",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    colorSlot: 1,
  },
  fontSubheading: { type: "inherit" },
  fontBody: { type: "preset", stack: "Georgia, 'Times New Roman', serif" },
  fontButton: {
    type: "preset",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
};

export function normalizeFontRole(input, fallback) {
  // Backward compat: old string format → preset object
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed) return { type: "preset", stack: trimmed };
    return { ...fallback };
  }
  if (!input || typeof input !== "object") return { ...fallback };

  const type = String(input.type || "");
  if (!["preset", "google", "inherit"].includes(type)) return { ...fallback };

  if (type === "inherit") return { type: "inherit" };

  if (type === "preset") {
    const stack = String(input.stack || "").trim();
    if (!stack) return { ...fallback };
    const result = { type: "preset", stack };
    if (input.colorSlot === 1 || input.colorSlot === 2)
      result.colorSlot = input.colorSlot;
    return result;
  }

  // type === "google"
  const family = String(input.family || "").trim();
  if (!family) return { ...fallback };
  const result = { type: "google", family };
  result.isVariable = Boolean(input.isVariable);
  if (result.isVariable) {
    const [min, max] = Array.isArray(input.weightRange)
      ? input.weightRange
      : [100, 900];
    result.weightRange = [Number(min) || 100, Number(max) || 900];
  } else {
    result.weights = Array.isArray(input.weights)
      ? input.weights.map(Number).filter((w) => w > 0)
      : [400];
  }
  if (input.colorSlot === 1 || input.colorSlot === 2)
    result.colorSlot = input.colorSlot;
  return result;
}

export function normalizeTypographyPalette(input) {
  const DEFAULT = ["#111111"];
  if (!Array.isArray(input) || input.length === 0) return DEFAULT;
  const validated = input
    .slice(0, 2)
    .map((c) =>
      HEX_COLOR_RE.test(String(c || "").trim())
        ? String(c).trim().toLowerCase()
        : null,
    )
    .filter(Boolean);
  return validated.length > 0 ? validated : DEFAULT;
}

export function normalizeLinkStyle(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    hoverVariant: VALID_HOVER_VARIANTS.has(source.hoverVariant)
      ? source.hoverVariant
      : DEFAULT_LINK_STYLE.hoverVariant,
    underlineDefault: VALID_UNDERLINE_DEFAULTS.has(source.underlineDefault)
      ? source.underlineDefault
      : DEFAULT_LINK_STYLE.underlineDefault,
  };
}
```

- [ ] **Step 4: Update `normalizeSiteStyle` to include new font fields**

Replace the existing `normalizeSiteStyle` function:

```js
function normalizeSiteStyle(input, fallback = DEFAULT_SITE_STYLE) {
  const source = input && typeof input === "object" ? input : {};
  return {
    // Existing color fields — unchanged
    background: normalizeHexColor(source.background, fallback.background),
    foreground: normalizeHexColor(source.foreground, fallback.foreground),
    primary: normalizeHexColor(source.primary, fallback.primary),
    secondary: normalizeHexColor(source.secondary, fallback.secondary),
    tertiary: normalizeHexColor(source.tertiary, fallback.tertiary),
    muted: normalizeHexColor(source.muted, fallback.muted),
    // Font role objects — normalizeFontRole coerces legacy strings to preset objects for backward compat
    fontDisplay: normalizeFontRole(
      source.fontDisplay,
      DEFAULT_FONT_ROLES.fontDisplay,
    ),
    fontHeading: normalizeFontRole(
      source.fontHeading,
      DEFAULT_FONT_ROLES.fontHeading,
    ),
    fontSubheading: normalizeFontRole(
      source.fontSubheading,
      DEFAULT_FONT_ROLES.fontSubheading,
    ),
    fontBody: normalizeFontRole(source.fontBody, DEFAULT_FONT_ROLES.fontBody),
    fontButton: normalizeFontRole(
      source.fontButton,
      DEFAULT_FONT_ROLES.fontButton,
    ),
    // Palette and link style
    typographyPalette: normalizeTypographyPalette(source.typographyPalette),
    linkStyle: normalizeLinkStyle(source.linkStyle),
  };
}
```

Note: `normalizeFontRole` handles backward compat — if `source.fontHeading` is an old string (e.g. `"var(--font-inter), sans-serif"`), it is coerced to `{ type: "preset", stack: value }`. All five font roles are now consistently object-shaped after normalization; no `_obj` suffix fields exist.

- [ ] **Step 4b: Update `areSiteStylesEqual` in shopSettings.js**

`areSiteStylesEqual` currently compares `fontHeading` and `fontBody` with `===`, which fails for objects. Update it:

```js
function areSiteStylesEqual(left, right) {
  const a = normalizeSiteStyle(left, DEFAULT_SITE_STYLE);
  const b = normalizeSiteStyle(right, DEFAULT_SITE_STYLE);
  return (
    a.background === b.background &&
    a.foreground === b.foreground &&
    a.primary === b.primary &&
    a.secondary === b.secondary &&
    a.tertiary === b.tertiary &&
    a.muted === b.muted &&
    JSON.stringify(a.fontDisplay) === JSON.stringify(b.fontDisplay) &&
    JSON.stringify(a.fontHeading) === JSON.stringify(b.fontHeading) &&
    JSON.stringify(a.fontSubheading) === JSON.stringify(b.fontSubheading) &&
    JSON.stringify(a.fontBody) === JSON.stringify(b.fontBody) &&
    JSON.stringify(a.fontButton) === JSON.stringify(b.fontButton) &&
    JSON.stringify(a.typographyPalette) ===
      JSON.stringify(b.typographyPalette) &&
    JSON.stringify(a.linkStyle) === JSON.stringify(b.linkStyle)
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --experimental-test-module-mocks --test tests/shopSettings-fonts.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/shopSettings.js tests/shopSettings-fonts.test.js
git commit -m "feat: extend siteStyle data model with font roles, palette, and link style"
```

---

## Task 5: Admin API routes — catalog and download

**Files:**

- Create: `src/app/api/admin/fonts/catalog/route.js`
- Create: `src/app/api/admin/fonts/download/route.js`

- [ ] **Step 1: Create catalog route**

```js
// src/app/api/admin/fonts/catalog/route.js
import { requireAdmin } from "@/lib/adminRoute";
import { getFontsCatalog } from "@/lib/googleFontsCatalog";

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  try {
    const catalog = await getFontsCatalog();
    return new Response(JSON.stringify({ ok: true, ...catalog }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load font catalog.", 500);
  }
}
```

- [ ] **Step 2: Create download route**

```js
// src/app/api/admin/fonts/download/route.js
import { requireAdmin } from "@/lib/adminRoute";
import { getFontsCatalog, isVariableFont } from "@/lib/googleFontsCatalog";
import { downloadFontToR2 } from "@/lib/fontDownload";
import { upsertDownloadedFont } from "@/lib/downloadedFonts";

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const { family, weights } = body || {};
  if (!family || typeof family !== "string") {
    return jsonError("family is required.");
  }

  // Verify family exists in catalog
  const catalog = await getFontsCatalog();
  const entry = catalog.fonts.find((f) => f.family === family);
  if (!entry) {
    return jsonError(`Font "${family}" not found in catalog.`, 404);
  }

  const variable = isVariableFont(entry.axes);
  const requestedWeights = variable
    ? undefined
    : Array.isArray(weights) && weights.length > 0
      ? weights.map(Number).filter((w) => w > 0)
      : [400, 700];

  let record;
  try {
    record = await downloadFontToR2(family, variable, requestedWeights);
  } catch (err) {
    return jsonError(err?.message || "Font download failed.", 502);
  }

  try {
    await upsertDownloadedFont(record);
  } catch (err) {
    // KV write failed — R2 files are orphaned but not harmful; log and surface error
    console.error("upsertDownloadedFont failed after R2 upload:", err);
    return jsonError(
      "Font was downloaded to R2 but could not be saved to KV. Try again.",
      500,
    );
  }

  return new Response(
    JSON.stringify({ ok: true, fontFaceCss: record.fontFaceCss }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
```

- [ ] **Step 3: Smoke test both routes (manual)**

```bash
# Start dev server
npm run dev

# In another terminal — catalog (requires admin session cookie)
curl -s -b "admin_session=your_session_cookie" http://localhost:3000/api/admin/fonts/catalog | jq '.fonts | length'
# Expected: number > 0

# Download test
curl -s -X POST \
  -H "Content-Type: application/json" \
  -b "admin_session=your_session_cookie" \
  -d '{"family":"Lato"}' \
  http://localhost:3000/api/admin/fonts/download | jq .
# Expected: { ok: true, fontFaceCss: "@font-face {...}" }
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/fonts/
git commit -m "feat: add admin fonts catalog and download API routes"
```

---

## Task 6: Public site-fonts route

**Files:**

- Create: `src/app/api/site-fonts/route.js`

- [ ] **Step 1: Implement the route**

```js
// src/app/api/site-fonts/route.js
import { getDownloadedFonts, getAllFontFaceCss } from "@/lib/downloadedFonts";

export async function GET() {
  try {
    const fonts = await getDownloadedFonts();
    const css = getAllFontFaceCss(fonts);
    return new Response(css, {
      status: 200,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    // Return empty CSS rather than an error — the site degrades gracefully
    console.error("site-fonts route error:", err);
    return new Response("", {
      status: 200,
      headers: { "Content-Type": "text/css; charset=utf-8" },
    });
  }
}
```

- [ ] **Step 2: Smoke test**

```bash
curl -s http://localhost:3000/api/site-fonts
# Expected: empty response (no fonts downloaded yet) or @font-face blocks if fonts exist
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/site-fonts/route.js
git commit -m "feat: add public /api/site-fonts @font-face CSS endpoint"
```

---

## Task 7: CSS variable expansion

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/app/theme.generated.css`

### globals.css changes

- [ ] **Step 1: Replace the heading block and add new font variable bindings**

Find the existing heading block in `globals.css` (around line 32–43):

```css
h1,
h2,
h3,
h4,
h5,
h6 {
  color: var(--foreground);
  font-family: var(--font-heading);
  font-weight: 700;
  line-height: 1.3125;
  margin: 0.75em 0;
}
```

Replace with:

```css
h1,
h2,
h3,
h4,
h5,
h6 {
  color: var(--foreground);
  font-weight: 700;
  line-height: 1.3125;
  margin: 0.75em 0;
}

h1 {
  font-family: var(--font-display, var(--font-heading));
  color: var(--font-color-display, var(--foreground));
}

h2,
h3,
h4 {
  font-family: var(--font-heading);
  color: var(--font-color-heading, var(--foreground));
}

h5,
h6 {
  font-family: var(--font-subheading, var(--font-heading));
  color: var(
    --font-color-subheading,
    var(--font-color-heading, var(--foreground))
  );
}
```

- [ ] **Step 2: Update button font-family**

Find the `.wp-block-button__link, .wp-element-button` block (around line 167) and add `--font-button` fallback:

```css
.wp-block-button__link,
.wp-element-button {
  /* existing styles... */
  font-family: var(--font-button, var(--font-heading));
  /* rest of existing styles unchanged */
}
```

Also find any `button` element style and update similarly. Check around line 171 for `font-family: var(--font-heading)` on buttons — change those to `var(--font-button, var(--font-heading))`.

- [ ] **Step 3: Add link hover variant rules**

Append to `globals.css`:

```css
/* ── Link hover variants ─────────────────────────────────────────────────── */

/* Base link state controlled by underlineDefault */
[data-link-underline="always"] a {
  text-decoration: underline;
}
[data-link-underline="hover"] a,
[data-link-underline="never"] a {
  text-decoration: none;
}

/* Hover variants */
[data-link-style="underline"] a:hover {
  text-decoration: underline;
}
[data-link-style="highlight"] a:hover {
  background: var(--color-primary);
  color: #fff;
  border-radius: 2px;
  padding: 0 0.15em;
  text-decoration: none;
}
[data-link-style="inverse"] a:hover {
  background: var(--color-primary);
  color: var(--color-background);
  border-radius: 2px;
  padding: 0 0.15em;
  text-decoration: none;
}
[data-link-style="pill"] a:hover {
  background: var(--color-primary);
  color: #fff;
  border-radius: 9999px;
  padding: 0 0.35em;
  text-decoration: none;
}
[data-link-style="slide"] a {
  position: relative;
}
[data-link-style="slide"] a::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--color-primary);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.2s ease;
}
[data-link-style="slide"] a:hover::after {
  transform: scaleX(1);
}
[data-link-style="box"] a:hover {
  outline: 2px solid var(--color-primary);
  border-radius: 2px;
  text-decoration: none;
}
/* suppress underline on underline variant when underlineDefault=never */
[data-link-underline="never"][data-link-style="underline"] a:hover {
  text-decoration: none;
}
[data-link-underline="never"][data-link-style="underline"] a::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.2s ease;
}
[data-link-underline="never"][data-link-style="underline"] a:hover::after {
  transform: scaleX(1);
}
```

### theme.generated.css changes

- [ ] **Step 4: Add new CSS variable defaults to theme.generated.css**

Add to the `:root` block (after the existing `--font-body` and `--font-heading` lines):

```css
--font-display: var(--font-heading);
--font-subheading: var(--font-heading);
--font-button: var(--font-heading);
--font-color-display: var(--color-foreground);
--font-color-heading: var(--color-foreground);
--font-color-subheading: var(--color-foreground);
```

Also add utility classes at the bottom:

```css
.font-display {
  font-family: var(--font-display);
}
.font-subheading {
  font-family: var(--font-subheading);
}
.font-button {
  font-family: var(--font-button);
}
```

- [ ] **Step 5: Verify the site still renders correctly**

```bash
npm run dev
# Open http://localhost:3000 — headings should render with the same fonts as before
# No visual regression expected since --font-display defaults to var(--font-heading)
```

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/theme.generated.css
git commit -m "feat: expand CSS font variables and add link hover variant rules"
```

---

## Task 8: Update layout.js

**Files:**

- Modify: `src/app/layout.js`

The existing inline script (line 111 in layout.js) applies CSS variables from `/api/site-style`. We need to:

1. Extend it to handle the 5 new font role objects → CSS variables
2. Apply 3 color variables from `typographyPalette`
3. Set `data-link-style` and `data-link-underline` attributes on `<body>`
4. Add `<link rel="stylesheet" href="/api/site-fonts">` to `<head>`

- [ ] **Step 1: Add the site-fonts link to `<head>`**

In the `<head>` section of `RootLayout`, after the existing `<link>` tags:

```jsx
<link rel="stylesheet" href="/api/site-fonts" />
```

- [ ] **Step 2: Replace the inline style script**

The current script is the long one-liner on line 111. Replace the `dangerouslySetInnerHTML` value with this updated version (written here expanded for clarity — it must be kept as a single-line string in the actual file to avoid JSX parsing issues):

```js
// Expanded version of the new inline script (minify before putting in layout.js)
(function () {
  var KEY = "ragbaz-site-style";
  var root = document.documentElement;

  // Color variable map (same as before)
  var colorMap = {
    background: "--color-background",
    foreground: "--color-foreground",
    primary: "--color-primary",
    secondary: "--color-secondary",
    tertiary: "--color-tertiary",
    muted: "--color-muted",
  };

  function fontFamilyValue(role) {
    if (!role || typeof role !== "object") return null;
    if (role.type === "preset") return role.stack || null;
    if (role.type === "google")
      return "'" + role.family + "', system-ui, sans-serif";
    return null; // inherit — handled by CSS var()
  }

  function apply(style) {
    if (!style || typeof style !== "object") return;

    // Apply color variables
    for (var k in colorMap) {
      if (!Object.prototype.hasOwnProperty.call(colorMap, k)) continue;
      var v = style[k];
      if (typeof v === "string" && v.trim())
        root.style.setProperty(colorMap[k], v.trim());
    }
    root.style.setProperty("--background", "var(--color-background)");
    root.style.setProperty("--foreground", "var(--color-foreground)");

    // Apply font role variables (new object format)
    var fontRoleMap = {
      fontDisplay: "--font-display",
      fontHeading: "--font-heading",
      fontSubheading: "--font-subheading",
      fontBody: "--font-body",
      fontButton: "--font-button",
    };
    for (var role in fontRoleMap) {
      if (!Object.prototype.hasOwnProperty.call(fontRoleMap, role)) continue;
      var roleData = style[role];
      var cssVar = fontRoleMap[role];
      var fv;
      // New object format
      if (roleData && typeof roleData === "object") {
        fv = fontFamilyValue(roleData);
      }
      // Legacy string format fallback
      if (!fv && typeof roleData === "string" && roleData.trim()) {
        fv = roleData.trim();
      }
      if (fv) root.style.setProperty(cssVar, fv);
    }

    // Apply typography color variables from palette
    var palette = Array.isArray(style.typographyPalette)
      ? style.typographyPalette
      : ["#111111"];
    var colorRoles = {
      fontDisplay: "--font-color-display",
      fontHeading: "--font-color-heading",
      fontSubheading: "--font-color-subheading",
    };
    for (var cr in colorRoles) {
      if (!Object.prototype.hasOwnProperty.call(colorRoles, cr)) continue;
      var roleObj = style[cr];
      var slot =
        roleObj && typeof roleObj === "object" ? roleObj.colorSlot : null;
      var hex = slot && palette[slot - 1] ? palette[slot - 1] : null;
      if (hex) root.style.setProperty(colorRoles[cr], hex);
    }

    // Set link hover data attributes on body
    var linkStyle =
      style.linkStyle && typeof style.linkStyle === "object"
        ? style.linkStyle
        : {};
    var hoverVariant = linkStyle.hoverVariant || "underline";
    var underlineDefault = linkStyle.underlineDefault || "hover";
    document.body.setAttribute("data-link-style", hoverVariant);
    document.body.setAttribute("data-link-underline", underlineDefault);
  }

  try {
    var cached = localStorage.getItem(KEY);
    if (cached) apply(JSON.parse(cached));
  } catch (_) {}

  fetch("/api/site-style")
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (payload) {
      if (!payload || payload.ok !== true || !payload.siteStyle) return;
      apply(payload.siteStyle);
      try {
        localStorage.setItem(KEY, JSON.stringify(payload.siteStyle));
      } catch (_) {}
    })
    .catch(function () {});
})();
```

**Important:** Minify this script before placing it as a string in the JSX. Use any online minifier or:

```bash
npx terser --compress --mangle -- /tmp/inline-script.js
```

Then put the minified output as the `__html` value in `dangerouslySetInnerHTML`.

- [ ] **Step 3: Verify the site still loads correctly**

```bash
npm run dev
# Open http://localhost:3000 — site should look identical to before
# Open DevTools → Elements → <body> should have data-link-style="underline" data-link-underline="hover"
# Network tab → /api/site-fonts should be requested (returns 200 empty CSS for now)
```

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.js
git commit -m "feat: add site-fonts link and extend inline style script for new font variables"
```

---

## Task 9: Built-in typography themes

**Files:**

- Create: `src/lib/typographyThemes.js`

- [ ] **Step 1: Implement the themes file**

```js
// src/lib/typographyThemes.js
// Five built-in typography theme presets.
// Each theme is a siteStyle fragment: only sets font role and palette fields.
// Applying a theme merges these fields into the current siteStyle — color fields are untouched.

export const TYPOGRAPHY_THEMES = [
  {
    id: "clean",
    name: "Clean",
    description: "Sharp, neutral. Works everywhere.",
    typographyPalette: ["#0f0f0f", "#1a1a1a"],
    fontDisplay: {
      type: "google",
      family: "Inter",
      isVariable: true,
      weightRange: [100, 900],
      colorSlot: 1,
    },
    fontHeading: {
      type: "google",
      family: "Inter",
      isVariable: true,
      weightRange: [100, 900],
      colorSlot: 2,
    },
    fontSubheading: {
      type: "google",
      family: "Inter",
      isVariable: true,
      weightRange: [100, 900],
      colorSlot: 2,
    },
    fontBody: {
      type: "google",
      family: "Inter",
      isVariable: true,
      weightRange: [100, 900],
    },
    fontButton: {
      type: "google",
      family: "Inter",
      isVariable: true,
      weightRange: [100, 900],
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    description:
      "Magazine tension: high-contrast serif display + clean sans body.",
    typographyPalette: ["#0a0a0a", "#1c3d5a"],
    fontDisplay: {
      type: "google",
      family: "Playfair Display",
      isVariable: false,
      weights: [700],
      colorSlot: 1,
    },
    fontHeading: {
      type: "google",
      family: "DM Sans",
      isVariable: true,
      weightRange: [100, 700],
      colorSlot: 2,
    },
    fontSubheading: {
      type: "google",
      family: "DM Sans",
      isVariable: true,
      weightRange: [100, 700],
      colorSlot: 2,
    },
    fontBody: {
      type: "google",
      family: "Lora",
      isVariable: false,
      weights: [400, 600],
    },
    fontButton: {
      type: "google",
      family: "DM Sans",
      isVariable: true,
      weightRange: [100, 700],
    },
  },
  {
    id: "technical",
    name: "Technical",
    description: "Startup energy. Geometric with personality.",
    typographyPalette: ["#09090b", "#3b3b4f"],
    fontDisplay: {
      type: "google",
      family: "Space Grotesk",
      isVariable: true,
      weightRange: [300, 700],
      colorSlot: 1,
    },
    fontHeading: {
      type: "google",
      family: "Space Grotesk",
      isVariable: true,
      weightRange: [300, 700],
      colorSlot: 2,
    },
    fontSubheading: {
      type: "google",
      family: "IBM Plex Sans",
      isVariable: false,
      weights: [400, 500],
      colorSlot: 2,
    },
    fontBody: {
      type: "google",
      family: "IBM Plex Sans",
      isVariable: false,
      weights: [400],
    },
    fontButton: {
      type: "google",
      family: "Space Grotesk",
      isVariable: true,
      weightRange: [300, 700],
    },
  },
  {
    id: "warm",
    name: "Warm",
    description:
      "Approachable and human. Optical-size serif display + rounded sans.",
    typographyPalette: ["#1a0f0a", "#4a3728"],
    fontDisplay: {
      type: "google",
      family: "Fraunces",
      isVariable: true,
      weightRange: [100, 900],
      colorSlot: 1,
    },
    fontHeading: {
      type: "google",
      family: "Nunito",
      isVariable: true,
      weightRange: [200, 900],
      colorSlot: 2,
    },
    fontSubheading: {
      type: "google",
      family: "Nunito",
      isVariable: true,
      weightRange: [200, 900],
      colorSlot: 2,
    },
    fontBody: {
      type: "google",
      family: "Nunito",
      isVariable: true,
      weightRange: [200, 900],
    },
    fontButton: {
      type: "google",
      family: "Nunito",
      isVariable: true,
      weightRange: [200, 900],
    },
  },
  {
    id: "haute",
    name: "Haute",
    description:
      "Fashion/luxury. Ultra-light display, geometric sans, classical body serif.",
    typographyPalette: ["#0d0d0d", "#8b6f47"],
    fontDisplay: {
      type: "google",
      family: "Cormorant Garamond",
      isVariable: false,
      weights: [300, 600],
      colorSlot: 1,
    },
    fontHeading: {
      type: "google",
      family: "Raleway",
      isVariable: true,
      weightRange: [100, 900],
      colorSlot: 2,
    },
    fontSubheading: {
      type: "google",
      family: "Raleway",
      isVariable: true,
      weightRange: [100, 900],
      colorSlot: 2,
    },
    fontBody: {
      type: "google",
      family: "Crimson Pro",
      isVariable: true,
      weightRange: [200, 900],
    },
    fontButton: {
      type: "google",
      family: "Raleway",
      isVariable: true,
      weightRange: [100, 900],
    },
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/typographyThemes.js
git commit -m "feat: add five built-in typography theme presets"
```

---

## Task 10: AdminFontBrowserModal component

**Files:**

- Create: `src/components/admin/AdminFontBrowserModal.js`

This is a large React component. It:

- Accepts `{ role, currentFamily, onSelect, onClose }` props
- Fetches catalog from `/api/admin/fonts/catalog` on mount
- Shows search input, category filter, variable-only toggle
- Renders a virtualized list of fonts (windowed with IntersectionObserver sentinel)
- Injects Google CDN `<link>` tags for font preview, replacing pending ones
- Shows Download button (calls `/api/admin/fonts/download`) or "Downloaded ◉" badge
- Shows Select button (calls `onSelect(fontRole)`)

- [ ] **Step 1: Create the component**

```jsx
// src/components/admin/AdminFontBrowserModal.js
"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const CATEGORIES = [
  "All",
  "sans-serif",
  "serif",
  "display",
  "handwriting",
  "monospace",
];
const PREVIEW_TEXT_KEY = "ragbaz-font-preview-text";
const DEFAULT_PREVIEW = "The quick brown fox jumps over the lazy dog";
const PAGE_SIZE = 20;

/** Inject a Google Fonts CDN <link> for preview, replacing any pending (not-yet-loaded) link. */
function useGoogleFontsPreview() {
  const pendingLinkRef = useRef(null);
  const loadedFamilies = useRef(new Set());

  const previewFont = useCallback((family) => {
    if (loadedFamilies.current.has(family)) return;

    // Remove previous pending link if it hasn't fired load yet
    if (pendingLinkRef.current && !pendingLinkRef.current._loaded) {
      pendingLinkRef.current.remove();
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
    link._loaded = false;
    link.onload = () => {
      link._loaded = true;
      loadedFamilies.current.add(family);
    };
    document.head.appendChild(link);
    pendingLinkRef.current = link;
  }, []);

  // Cleanup: remove all preview links when modal unmounts
  const cleanup = useCallback(() => {
    // Remove all Google Fonts preview links added by this hook
    loadedFamilies.current.clear();
  }, []);

  return { previewFont, cleanup };
}

export default function AdminFontBrowserModal({
  role,
  currentFamily,
  downloadedFamilies,
  onSelect,
  onClose,
  onDownloadStart,
  onDownloadEnd,
}) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [variableOnly, setVariableOnly] = useState(false);
  const [previewText, setPreviewText] = useState(
    () =>
      (typeof localStorage !== "undefined" &&
        localStorage.getItem(PREVIEW_TEXT_KEY)) ||
      DEFAULT_PREVIEW,
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [downloading, setDownloading] = useState(new Set()); // families currently downloading
  const [downloaded, setDownloaded] = useState(
    new Set(downloadedFamilies || []),
  );
  const [weightPickerFamily, setWeightPickerFamily] = useState(null); // for non-variable download
  const [selectedWeights, setSelectedWeights] = useState([400, 700]);
  const sentinelRef = useRef(null);
  const { previewFont, cleanup } = useGoogleFontsPreview();

  // Fetch catalog
  useEffect(() => {
    fetch("/api/admin/fonts/catalog")
      .then((r) => r.json())
      .then((data) => {
        setCatalog(data.fonts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => cleanup();
  }, [cleanup]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Persist preview text
  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_TEXT_KEY, previewText);
    } catch (_) {}
  }, [previewText]);

  // Filtered + sliced list
  const filtered = catalog.filter((f) => {
    if (search && !f.family.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (category !== "All" && f.category !== category) return false;
    if (variableOnly && !f.axes?.some((a) => a.tag === "wght")) return false;
    return true;
  });
  const visible = filtered.slice(0, visibleCount);

  async function downloadFont(family, weights) {
    setDownloading((d) => new Set([...d, family]));
    if (onDownloadStart) onDownloadStart();
    try {
      const res = await fetch("/api/admin/fonts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family, weights }),
      });
      if (res.ok) setDownloaded((d) => new Set([...d, family]));
    } finally {
      setDownloading((d) => {
        const s = new Set(d);
        s.delete(family);
        return s;
      });
      setWeightPickerFamily(null);
      if (onDownloadEnd) onDownloadEnd();
    }
  }

  function handleSelect(font) {
    const isVar = font.axes?.some((a) => a.tag === "wght");
    const role = {
      type: "google",
      family: font.family,
      isVariable: isVar,
      ...(isVar ? { weightRange: [100, 900] } : { weights: [400, 700] }),
    };
    onSelect(role);
    // Start background download if not yet downloaded (modal may unmount — callbacks keep parent in sync)
    if (!downloaded.has(font.family)) {
      downloadFont(font.family, isVar ? undefined : [400, 700]);
    }
  }

  const roleLabel =
    {
      fontDisplay: "Display",
      fontHeading: "Heading",
      fontSubheading: "Subheading",
      fontBody: "Body",
      fontButton: "Button",
    }[role] || role;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 pt-12 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Choose {roleLabel} Font
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 px-6 py-3 border-b bg-gray-50">
          <input
            type="text"
            placeholder="Search fonts…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="flex-1 min-w-48 px-3 py-1.5 border rounded-lg text-sm"
          />
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="px-3 py-1.5 border rounded-lg text-sm bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={variableOnly}
              onChange={(e) => {
                setVariableOnly(e.target.checked);
                setVisibleCount(PAGE_SIZE);
              }}
              className="rounded"
            />
            Variable only
          </label>
        </div>

        {/* Preview text editor */}
        <div className="px-6 py-2 border-b bg-gray-50">
          <input
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value || DEFAULT_PREVIEW)}
            className="w-full text-sm text-gray-500 bg-transparent border-none outline-none"
          />
        </div>

        {/* Font list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading && (
            <div className="p-8 text-center text-gray-400">Loading fonts…</div>
          )}
          {!loading && visible.length === 0 && (
            <div className="p-8 text-center text-gray-400">No fonts found.</div>
          )}
          {visible.map((font) => {
            const isVar = font.axes?.some((a) => a.tag === "wght");
            const isDl = downloaded.has(font.family);
            const isDling = downloading.has(font.family);
            const isCurrent = font.family === currentFamily;

            // Trigger CDN preview when font becomes visible
            // (IntersectionObserver on individual rows is overkill; trigger on render)
            previewFont(font.family);

            return (
              <div
                key={font.family}
                className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-50 ${isCurrent ? "ring-2 ring-inset ring-indigo-500" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 mb-1">
                    {font.family}
                    {isVar && (
                      <span className="ml-2 text-xs text-indigo-500">
                        Variable
                      </span>
                    )}
                  </div>
                  <div
                    className="text-base text-gray-700 truncate"
                    style={{ fontFamily: `'${font.family}', serif` }}
                  >
                    {previewText}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isDl ? (
                    <span className="text-xs text-green-600 font-medium">
                      ◉ Downloaded
                    </span>
                  ) : isVar ? (
                    <button
                      onClick={() => downloadFont(font.family)}
                      disabled={isDling}
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 disabled:opacity-50"
                    >
                      {isDling ? "…" : "Download"}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setWeightPickerFamily(font.family);
                        setSelectedWeights([400, 700]);
                      }}
                      disabled={isDling}
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 disabled:opacity-50"
                    >
                      {isDling ? "…" : "Download"}
                    </button>
                  )}
                  <button
                    onClick={() => handleSelect(font)}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Select
                  </button>
                </div>
              </div>
            );
          })}
          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-4" />
        </div>

        {/* Weight picker popover (non-variable fonts) */}
        {weightPickerFamily &&
          (() => {
            const wf = catalog.find((f) => f.family === weightPickerFamily);
            const availableWeights = wf
              ? wf.variants
                  .map((v) => (v === "regular" ? 400 : parseInt(v, 10)))
                  .filter((n) => !isNaN(n))
              : [400, 700];
            return (
              <div className="border-t p-6">
                <div className="font-medium text-sm text-gray-800 mb-3">
                  Select weights for {weightPickerFamily}
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {availableWeights.map((w) => (
                    <label
                      key={w}
                      className="flex items-center gap-1.5 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedWeights.includes(w)}
                        onChange={(e) =>
                          setSelectedWeights((ws) =>
                            e.target.checked
                              ? [...ws, w]
                              : ws.filter((x) => x !== w),
                          )
                        }
                      />
                      {w}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      downloadFont(weightPickerFamily, selectedWeights)
                    }
                    disabled={selectedWeights.length === 0}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => setWeightPickerFamily(null)}
                    className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AdminFontBrowserModal.js
git commit -m "feat: add AdminFontBrowserModal component"
```

---

## Task 11: Update AdminDashboard.js typography UI

**Files:**

- Modify: `src/components/admin/AdminDashboard.js`

This is the largest change. The AdminDashboard.js file is ~2600 lines. The typography section lives around lines 2132–2320. We're replacing the 2-dropdown font UI with the 5-role card system.

### 11a: Add state and helpers

- [ ] **Step 1: Add `AdminFontBrowserModal` import**

At the top of `AdminDashboard.js`, after the existing imports:

```js
import AdminFontBrowserModal from "./AdminFontBrowserModal";
import { TYPOGRAPHY_THEMES } from "@/lib/typographyThemes";
```

- [ ] **Step 2: Add font role state near the existing `siteStyleTokens` state**

Find where `siteStyleTokens` state is declared (around line 300 in the component body). Add alongside it:

```js
// Font role state (new system)
const [fontRoles, setFontRoles] = useState({
  fontDisplay: siteStyleTokens.fontDisplay || {
    type: "preset",
    stack: "system-ui, sans-serif",
    colorSlot: 1,
  },
  fontHeading: siteStyleTokens.fontHeading || {
    type: "preset",
    stack: "system-ui, sans-serif",
    colorSlot: 1,
  },
  fontSubheading: siteStyleTokens.fontSubheading || { type: "inherit" },
  fontBody: siteStyleTokens.fontBody || {
    type: "preset",
    stack: "Georgia, serif",
  },
  fontButton: siteStyleTokens.fontButton || {
    type: "preset",
    stack: "system-ui, sans-serif",
  },
});
const [typographyPalette, setTypographyPalette] = useState(
  siteStyleTokens.typographyPalette || ["#111111"],
);
const [linkStyle, setLinkStyle] = useState(
  siteStyleTokens.linkStyle || {
    hoverVariant: "underline",
    underlineDefault: "hover",
  },
);
const [fontBrowserRole, setFontBrowserRole] = useState(null); // null = closed
const [downloadedFamilies, setDownloadedFamilies] = useState([]);
const [downloadingRole, setDownloadingRole] = useState(null); // key of role currently downloading
```

- [ ] **Step 3: Fetch downloaded families on mount**

Find the `useEffect` that loads shop settings on mount and add a fetch for downloaded fonts:

```js
// After the existing shop settings fetch effect, add:
useEffect(() => {
  fetch("/api/admin/fonts/catalog")
    // We need downloaded families — fetch from the site-fonts route or
    // add a dedicated endpoint. For now, track via the modal's onSelect callback.
    .catch(() => {});
}, []);
```

Actually, since there's no "list downloaded fonts" admin endpoint, we track downloaded status within the modal component itself (it receives `downloadedFamilies` as prop and updates on download success). Initialise `downloadedFamilies` as empty and let the modal manage state internally.

- [ ] **Step 4: Add helpers for applying font roles to DOM and saving**

Find `applySiteStyleTokensToDom` (around line 237) and add after it:

```js
function applyFontRolesToDom(roles, palette, ls) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const body = document.body;

  function fontFamilyValue(role) {
    if (!role || typeof role !== "object") return null;
    if (role.type === "preset") return role.stack || null;
    if (role.type === "google")
      return `'${role.family}', system-ui, sans-serif`;
    return null;
  }

  const cssVarMap = {
    fontDisplay: "--font-display",
    fontHeading: "--font-heading",
    fontSubheading: "--font-subheading",
    fontBody: "--font-body",
    fontButton: "--font-button",
  };
  for (const [key, cssVar] of Object.entries(cssVarMap)) {
    const fv = fontFamilyValue(roles[key]);
    if (fv) root.style.setProperty(cssVar, fv);
  }

  // Color variables
  const colorVarMap = {
    fontDisplay: "--font-color-display",
    fontHeading: "--font-color-heading",
    fontSubheading: "--font-color-subheading",
  };
  for (const [key, cssVar] of Object.entries(colorVarMap)) {
    const slot = roles[key]?.colorSlot;
    const hex = slot && palette[slot - 1] ? palette[slot - 1] : null;
    if (hex) root.style.setProperty(cssVar, hex);
  }

  // Link style
  if (ls) {
    body.setAttribute("data-link-style", ls.hoverVariant || "underline");
    body.setAttribute("data-link-underline", ls.underlineDefault || "hover");
  }
}
```

- [ ] **Step 5: Update `saveSiteStyleSettings` to include new font fields**

Find the `saveSiteStyleSettings` function (around line 1260). In the body that builds the payload to PUT to `/api/admin/shop-settings`, add the new fields:

```js
async function saveSiteStyleSettings() {
  setShopSettingsSaving(true);
  try {
    const payload = {
      siteStyle: {
        ...sanitizeSiteStyleTokens(siteStyleTokens, SITE_STYLE_DEFAULTS),
        // New font role fields
        fontDisplay: fontRoles.fontDisplay,
        fontSubheading: fontRoles.fontSubheading,
        fontButton: fontRoles.fontButton,
        typographyPalette,
        linkStyle,
      },
    };
    // ... rest of existing save logic unchanged
  }
}
```

Note: The save payload must include all five font role objects plus `typographyPalette` and `linkStyle`. In the `handleSave` function (or equivalent), spread fontRoles into the siteStyle update:

```js
const updatedStyle = {
  ...currentSiteStyle,
  ...fontRoles, // fontDisplay, fontHeading, fontSubheading, fontBody, fontButton
  typographyPalette,
  linkStyle,
};
```

All five keys are object-shaped after normalization — no legacy string fields need to be kept separately.

### 11b: Replace the typography UI section

- [ ] **Step 6: Find and replace the typography render section**

Find the section starting around line 2175 (`{/* Typography / Fonts */}` or `t("admin.styleHeadingFontLabel")`). Replace the two font dropdown selects and their preview boxes with the new role-card UI:

```jsx
{
  /* Typography section — replace existing font dropdowns with this */
}
<div className="space-y-4">
  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
    Typography
  </h3>

  {/* Themes strip */}
  <div>
    <div className="text-xs text-gray-500 mb-2">Themes</div>
    <div className="flex flex-wrap gap-2">
      {TYPOGRAPHY_THEMES.map((theme) => (
        <button
          key={theme.id}
          onClick={() => {
            setFontRoles({
              fontDisplay: theme.fontDisplay,
              fontHeading: theme.fontHeading,
              fontSubheading: theme.fontSubheading,
              fontBody: theme.fontBody,
              fontButton: theme.fontButton,
            });
            setTypographyPalette(theme.typographyPalette);
            applyFontRolesToDom(
              {
                fontDisplay: theme.fontDisplay,
                fontHeading: theme.fontHeading,
                fontSubheading: theme.fontSubheading,
                fontBody: theme.fontBody,
                fontButton: theme.fontButton,
              },
              theme.typographyPalette,
              linkStyle,
            );
          }}
          className="px-3 py-1.5 text-xs border rounded-full hover:bg-gray-100 hover:border-gray-400"
          title={theme.description}
        >
          {theme.name}
        </button>
      ))}
    </div>
  </div>

  {/* Typography color palette */}
  <div>
    <div className="text-xs text-gray-500 mb-2">Typography Colors</div>
    <div className="flex items-center gap-3">
      {typographyPalette.map((color, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <input
            type="color"
            value={color}
            onChange={(e) => {
              const next = [...typographyPalette];
              next[idx] = e.target.value;
              setTypographyPalette(next);
              applyFontRolesToDom(fontRoles, next, linkStyle);
            }}
            className="w-8 h-8 rounded cursor-pointer border"
          />
          <span className="text-xs font-mono text-gray-500">{color}</span>
        </div>
      ))}
      {typographyPalette.length < 2 ? (
        <button
          onClick={() =>
            setTypographyPalette([...typographyPalette, "#4682b4"])
          }
          className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
        >
          + Second color
        </button>
      ) : (
        <button
          onClick={() => {
            const next = [typographyPalette[0]];
            setTypographyPalette(next);
            // Reset slot-2 roles to slot 1
            const updated = { ...fontRoles };
            for (const key of [
              "fontDisplay",
              "fontHeading",
              "fontSubheading",
            ]) {
              if (updated[key]?.colorSlot === 2)
                updated[key] = { ...updated[key], colorSlot: 1 };
            }
            setFontRoles(updated);
            applyFontRolesToDom(updated, next, linkStyle);
          }}
          className="px-2 py-1 text-xs border rounded hover:bg-red-50 hover:border-red-300 text-red-600"
        >
          − Remove
        </button>
      )}
    </div>
  </div>

  {/* Font role cards */}
  {[
    { key: "fontDisplay", label: "Display", elements: "h1", hasColor: true },
    {
      key: "fontHeading",
      label: "Heading",
      elements: "h2, h3, h4",
      hasColor: true,
    },
    {
      key: "fontSubheading",
      label: "Subheading",
      elements: "h5, h6",
      hasColor: true,
    },
    { key: "fontBody", label: "Body", elements: "body, p", hasColor: false },
    { key: "fontButton", label: "Button", elements: "button", hasColor: false },
  ].map(({ key, label, elements, hasColor }) => {
    const role = fontRoles[key];
    const fontLabel =
      role?.type === "google"
        ? `${role.family}${role.isVariable ? " Variable" : ""}`
        : role?.type === "inherit"
          ? "(inherits Heading)"
          : role?.type === "preset"
            ? "Preset"
            : "—";
    const weightLabel = role?.isVariable
      ? `${role.weightRange?.[0]}–${role.weightRange?.[1]}`
      : role?.weights
        ? role.weights.join(", ")
        : "";
    const slot = role?.colorSlot;

    return (
      <div key={key} className="border rounded-lg p-3 flex items-center gap-3">
        {/* Color slot dot */}
        {hasColor && typographyPalette.length > 0 && (
          <button
            onClick={() => {
              if (typographyPalette.length < 2) return;
              const nextSlot = slot === 2 ? 1 : 2;
              const updated = {
                ...fontRoles,
                [key]: { ...role, colorSlot: nextSlot },
              };
              setFontRoles(updated);
              applyFontRolesToDom(updated, typographyPalette, linkStyle);
            }}
            className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-gray-300 shrink-0 cursor-pointer"
            style={{
              backgroundColor: typographyPalette[(slot || 1) - 1] || "#111",
            }}
            title={
              typographyPalette.length < 2
                ? "Add second color to enable slot switching"
                : `Color slot ${slot || 1}`
            }
          />
        )}
        {!hasColor && <div className="w-5 h-5 shrink-0" />}

        {/* Font info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800">{label}</div>
          <div className="text-xs text-gray-500">{elements}</div>
          <div className="text-xs text-gray-700 mt-0.5">
            {fontLabel}
            {weightLabel && (
              <span className="ml-2 text-gray-400">{weightLabel}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {role?.type !== "preset" && role?.type !== "inherit" && (
            <button
              onClick={() => {
                const defaults = {
                  fontDisplay: {
                    type: "preset",
                    stack: "system-ui, sans-serif",
                    colorSlot: 1,
                  },
                  fontHeading: {
                    type: "preset",
                    stack: "system-ui, sans-serif",
                    colorSlot: 1,
                  },
                  fontSubheading: { type: "inherit" },
                  fontBody: { type: "preset", stack: "Georgia, serif" },
                  fontButton: {
                    type: "preset",
                    stack: "system-ui, sans-serif",
                  },
                };
                const updated = { ...fontRoles, [key]: defaults[key] };
                setFontRoles(updated);
                applyFontRolesToDom(updated, typographyPalette, linkStyle);
              }}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none"
              title="Reset to preset"
            >
              ×
            </button>
          )}
          <button
            onClick={() => setFontBrowserRole(key)}
            disabled={downloadingRole === key}
            className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-wait"
          >
            {downloadingRole === key ? "Downloading…" : "Browse"}
          </button>
        </div>
      </div>
    );
  })}

  {/* Link style */}
  <div className="border rounded-lg p-3 space-y-3">
    <div className="text-sm font-medium text-gray-800">Link Style</div>
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-gray-600">Underline:</span>
      {["always", "hover", "never"].map((v) => (
        <label
          key={v}
          className="flex items-center gap-1.5 text-xs cursor-pointer"
        >
          <input
            type="radio"
            name="underlineDefault"
            value={v}
            checked={linkStyle.underlineDefault === v}
            onChange={() => {
              const next = { ...linkStyle, underlineDefault: v };
              setLinkStyle(next);
              applyFontRolesToDom(fontRoles, typographyPalette, next);
            }}
          />
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </label>
      ))}
    </div>
    <div className="flex flex-wrap gap-2">
      {[
        "none",
        "underline",
        "highlight",
        "inverse",
        "pill",
        "slide",
        "box",
      ].map((variant) => (
        <button
          key={variant}
          onClick={() => {
            const next = { ...linkStyle, hoverVariant: variant };
            setLinkStyle(next);
            applyFontRolesToDom(fontRoles, typographyPalette, next);
          }}
          className={`px-3 py-1.5 text-xs border rounded-full ${linkStyle.hoverVariant === variant ? "bg-indigo-100 border-indigo-400 text-indigo-700" : "hover:bg-gray-100"}`}
        >
          {variant}
        </button>
      ))}
    </div>
  </div>
</div>;

{
  /* Font browser modal */
}
{
  fontBrowserRole && (
    <AdminFontBrowserModal
      role={fontBrowserRole}
      currentFamily={fontRoles[fontBrowserRole]?.family}
      downloadedFamilies={downloadedFamilies}
      onSelect={(roleObj) => {
        const updated = { ...fontRoles, [fontBrowserRole]: roleObj };
        setFontRoles(updated);
        applyFontRolesToDom(updated, typographyPalette, linkStyle);
        setFontBrowserRole(null);
      }}
      onClose={() => setFontBrowserRole(null)}
      onDownloadStart={() => setDownloadingRole(fontBrowserRole)}
      onDownloadEnd={() => setDownloadingRole(null)}
    />
  );
}
```

- [ ] **Step 7: Load initial font role state from settings API**

Find where `siteStyleTokens` is initialized from the API response (in the `useEffect` that calls `/api/admin/shop-settings`). After setting `siteStyleTokens`, also set the new font state:

```js
// Inside the shop-settings GET useEffect, after setSiteStyleTokens(...)
if (settings.siteStyle) {
  const s = settings.siteStyle;
  if (s.fontDisplay)
    setFontRoles((prev) => ({ ...prev, fontDisplay: s.fontDisplay }));
  if (s.fontSubheading)
    setFontRoles((prev) => ({ ...prev, fontSubheading: s.fontSubheading }));
  if (s.fontButton)
    setFontRoles((prev) => ({ ...prev, fontButton: s.fontButton }));
  if (s.typographyPalette) setTypographyPalette(s.typographyPalette);
  if (s.linkStyle) setLinkStyle(s.linkStyle);
  // fontHeading and fontBody: the new UI stores them as fontDisplay / fontHeading
  // The legacy fontHeading/fontBody string fields remain for the existing color/preview system
}
```

- [ ] **Step 8: Test the UI end-to-end**

```bash
npm run dev
# Open http://localhost:3000/admin
# Navigate to the Style tab
# Verify: 5 role cards visible, themes strip, palette strip, link style section
# Click Browse on any role → modal opens, fonts load, search works
# Select a font → role card updates, live preview updates
# Click Download → font downloads (check /api/site-fonts response after)
# Save → verify new fields appear in /api/site-style response
```

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/AdminDashboard.js
git commit -m "feat: replace font dropdowns with typography role cards, palette strip, and font browser"
```

---

## Task 12: i18n keys

**Files:**

- Modify: `src/lib/i18n/en.json`
- Modify: `src/lib/i18n/sv.json`
- Modify: `src/lib/i18n/es.json`

- [ ] **Step 1: Add new keys to en.json**

Add these keys to the `"admin"` namespace (or wherever the existing style keys live):

```json
"styleTypographyTitle": "Typography",
"styleThemesLabel": "Themes",
"styleTypographyColors": "Typography Colors",
"styleAddSecondColor": "+ Second color",
"styleRemoveSecondColor": "− Remove",
"styleFontRoleDisplay": "Display",
"styleFontRoleHeading": "Heading",
"styleFontRoleSubheading": "Subheading",
"styleFontRoleBody": "Body",
"styleFontRoleButton": "Button",
"styleFontRoleInherits": "(inherits Heading)",
"styleFontRolePreset": "Preset",
"styleFontBrowse": "Browse",
"styleFontResetPreset": "Reset to preset",
"styleLinkStyle": "Link Style",
"styleLinkUnderlineLabel": "Underline:",
"styleLinkUnderlineAlways": "Always",
"styleLinkUnderlineHover": "On Hover",
"styleLinkUnderlineNever": "Never",
"styleLinkVariantNone": "None",
"styleLinkVariantUnderline": "Underline",
"styleLinkVariantHighlight": "Highlight",
"styleLinkVariantInverse": "Inverse",
"styleLinkVariantPill": "Pill",
"styleLinkVariantSlide": "Slide",
"styleLinkVariantBox": "Box",
"fontBrowserTitle": "Choose {role} Font",
"fontBrowserSearch": "Search fonts…",
"fontBrowserCategoryAll": "All",
"fontBrowserVariableOnly": "Variable only",
"fontBrowserPreviewText": "The quick brown fox jumps over the lazy dog",
"fontBrowserDownload": "Download",
"fontBrowserDownloaded": "◉ Downloaded",
"fontBrowserSelect": "Select",
"fontBrowserLoading": "Loading fonts…",
"fontBrowserEmpty": "No fonts found."
```

- [ ] **Step 2: Add the same keys to sv.json (Swedish translations)**

```json
"styleTypographyTitle": "Typografi",
"styleThemesLabel": "Teman",
"styleTypographyColors": "Typografifärger",
"styleAddSecondColor": "+ Andra färg",
"styleRemoveSecondColor": "− Ta bort",
"styleFontRoleDisplay": "Display",
"styleFontRoleHeading": "Rubrik",
"styleFontRoleSubheading": "Underrubrik",
"styleFontRoleBody": "Brödtext",
"styleFontRoleButton": "Knapp",
"styleFontRoleInherits": "(ärver Rubrik)",
"styleFontRolePreset": "Standard",
"styleFontBrowse": "Bläddra",
"styleFontResetPreset": "Återställ till standard",
"styleLinkStyle": "Länkstil",
"styleLinkUnderlineLabel": "Understrykning:",
"styleLinkUnderlineAlways": "Alltid",
"styleLinkUnderlineHover": "Vid hover",
"styleLinkUnderlineNever": "Aldrig",
"styleLinkVariantNone": "Ingen",
"styleLinkVariantUnderline": "Understrykning",
"styleLinkVariantHighlight": "Markering",
"styleLinkVariantInverse": "Inverterad",
"styleLinkVariantPill": "Pill",
"styleLinkVariantSlide": "Glidande",
"styleLinkVariantBox": "Ruta",
"fontBrowserTitle": "Välj {role}-font",
"fontBrowserSearch": "Sök typsnitt…",
"fontBrowserCategoryAll": "Alla",
"fontBrowserVariableOnly": "Endast variabel",
"fontBrowserPreviewText": "Snabba bruna rävar hoppar över lata hundar",
"fontBrowserDownload": "Ladda ner",
"fontBrowserDownloaded": "◉ Nedladdad",
"fontBrowserSelect": "Välj",
"fontBrowserLoading": "Laddar typsnitt…",
"fontBrowserEmpty": "Inga typsnitt hittades."
```

- [ ] **Step 3: Add the same keys to es.json (Spanish translations)**

```json
"styleTypographyTitle": "Tipografía",
"styleThemesLabel": "Temas",
"styleTypographyColors": "Colores de tipografía",
"styleAddSecondColor": "+ Segundo color",
"styleRemoveSecondColor": "− Eliminar",
"styleFontRoleDisplay": "Display",
"styleFontRoleHeading": "Encabezado",
"styleFontRoleSubheading": "Subencabezado",
"styleFontRoleBody": "Cuerpo",
"styleFontRoleButton": "Botón",
"styleFontRoleInherits": "(hereda Encabezado)",
"styleFontRolePreset": "Predeterminado",
"styleFontBrowse": "Explorar",
"styleFontResetPreset": "Restablecer predeterminado",
"styleLinkStyle": "Estilo de enlace",
"styleLinkUnderlineLabel": "Subrayado:",
"styleLinkUnderlineAlways": "Siempre",
"styleLinkUnderlineHover": "Al pasar",
"styleLinkUnderlineNever": "Nunca",
"styleLinkVariantNone": "Ninguno",
"styleLinkVariantUnderline": "Subrayado",
"styleLinkVariantHighlight": "Resaltado",
"styleLinkVariantInverse": "Inverso",
"styleLinkVariantPill": "Píldora",
"styleLinkVariantSlide": "Deslizante",
"styleLinkVariantBox": "Recuadro",
"fontBrowserTitle": "Elegir fuente de {role}",
"fontBrowserSearch": "Buscar fuentes…",
"fontBrowserCategoryAll": "Todas",
"fontBrowserVariableOnly": "Solo variables",
"fontBrowserPreviewText": "El veloz zorro marrón salta sobre el perro perezoso",
"fontBrowserDownload": "Descargar",
"fontBrowserDownloaded": "◉ Descargada",
"fontBrowserSelect": "Seleccionar",
"fontBrowserLoading": "Cargando fuentes…",
"fontBrowserEmpty": "No se encontraron fuentes."
```

- [ ] **Step 4: Run i18n sync check**

```bash
node -e "
function flatten(obj, prefix) {
  prefix = prefix || '';
  return Object.keys(obj).reduce(function(acc, k) {
    var full = prefix ? prefix + '.' + k : k;
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      Object.assign(acc, flatten(obj[k], full));
    } else {
      acc[full] = true;
    }
    return acc;
  }, {});
}
var fs = require('fs');
var en = flatten(JSON.parse(fs.readFileSync('src/lib/i18n/en.json','utf8')));
var sv = flatten(JSON.parse(fs.readFileSync('src/lib/i18n/sv.json','utf8')));
var es = flatten(JSON.parse(fs.readFileSync('src/lib/i18n/es.json','utf8')));
var files = { en: en, sv: sv, es: es };
var all = new Set(Object.keys(en).concat(Object.keys(sv)).concat(Object.keys(es)));
var problems = 0;
all.forEach(function(k) {
  var missing = Object.keys(files).filter(function(lang) { return !files[lang][k]; });
  if (missing.length) { console.log('MISSING in [' + missing.join(', ') + ']: ' + k); problems++; }
});
console.log('---');
if (!problems) console.log('All three files are in sync.');
else console.log(problems + ' key(s) out of sync.');
"
```

Expected: `All three files are in sync.`

If missing keys are reported, add them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/en.json src/lib/i18n/sv.json src/lib/i18n/es.json
git commit -m "feat: add i18n keys for font browser and typography UI"
```

---

## Task 13: Full test suite + end-to-end verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all existing tests PASS, new tests PASS. If any existing tests fail, investigate before proceeding — do not suppress failures.

- [ ] **Step 2: Manual end-to-end flow**

```bash
npm run dev
```

Walk through this checklist:

1. **Site loads** — no console errors, fonts render from `theme.generated.css` defaults
2. **`/api/site-fonts`** — returns `200` (empty CSS initially)
3. **Admin style tab** — opens without errors, shows 5 role cards, themes strip, link style section
4. **Themes strip** — click "Editorial" → role cards update with Playfair/DM Sans/Lora
5. **Browse button** — opens modal, font list loads (check Network for `/api/admin/fonts/catalog`)
6. **Search** — typing filters list in real time
7. **Variable only** — toggle filters to only variable fonts
8. **Font preview** — fonts render in preview text via Google CDN
9. **Download variable font** — click Download on Inter → button becomes "Downloaded ◉"
10. **Download non-variable** — weight picker appears for non-variable font, download proceeds
11. **Select font** — role card updates, live preview on page updates
12. **Palette** — add second color, change hex → color dot on role cards reflects change
13. **Color slot dot** — click to toggle between slot 1 / slot 2
14. **Link style** — change hover variant → try hovering a link on the page
15. **Save** — click Publish → verify `/api/site-style` returns updated `fontDisplay`, `typographyPalette`, `linkStyle`
16. **Page reload** — all font and link settings persist from KV
17. **`/api/site-fonts`** — after downloading a font, returns non-empty @font-face CSS

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete font browser and typography system"
```
