# Font Browser & Typography System Design

## Overview

A full Google Fonts browser integrated into the admin style editor, supporting five named typography roles (Display, Heading, Subheading, Body, Button), per-role heading colors via a 1-or-2-color palette, link hover style variants, a font browser modal with CDN preview, self-hosted R2 font delivery, and five built-in themes.

---

## Section 1: Data Model

### Site Style (stored in KV / siteConfig)

Five typography roles are added to `siteStyle`, plus a palette and link style block:

```js
siteStyle: {
  // ── Typography palette (1 or 2 hex colors) ──────────────────────────────
  typographyPalette: ["#111111"],          // always at least one entry; max two
  // typographyPalette: ["#0a0a0a", "#1c3d5a"],  // two-color example

  // ── Font roles ───────────────────────────────────────────────────────────
  fontDisplay: {
    type: "preset" | "google" | "inherit",
    stack?: string,       // CSS font-family value, used when type === "preset"
    family?: string,      // Google Font name, used when type === "google"
    isVariable?: boolean, // true → one file covering wght axis range
    weights?: number[],   // discrete weights, only when !isVariable
    weightRange?: [number, number],  // e.g. [100, 900], only when isVariable
    colorSlot?: 1 | 2,   // which typographyPalette entry drives this role's color; absent = inherit site text color
  },
  fontHeading:    { /* same shape */ },
  fontSubheading: { /* same shape */ },
  fontBody:       { /* same shape — no colorSlot; inherits site text color */ },
  fontButton:     { /* same shape — no colorSlot; inherits site text/brand color */ },

  // ── Link style ────────────────────────────────────────────────────────────
  linkStyle: {
    hoverVariant: "none" | "underline" | "highlight" | "inverse" | "pill" | "slide" | "box",
    underlineDefault: "always" | "hover" | "never",
  },
}
```

**Role field semantics:**
- `type: "preset"` — system font stack (no download); `stack` is the raw CSS value e.g. `"system-ui, sans-serif"`
- `type: "google"` — Google Font hosted on R2; `family` is the display name e.g. `"Inter"`
- `type: "inherit"` — role defers to another role's variable (used by Subheading when unset; see Section 3)
- `colorSlot` — references `typographyPalette[colorSlot - 1]`; only meaningful on Display, Heading, Subheading; Body and Button never carry this field
- Variable font: `isVariable: true`, `weightRange: [min, max]`, no `weights`
- Non-variable: `isVariable: false` (or absent), `weights: [400, 700]`, no `weightRange`

**Palette model:**
The `typographyPalette` array is the single source of truth for heading colors. Each heading role's `colorSlot` (1 or 2) indexes into it. The CSS generation step reads `typographyPalette[colorSlot - 1]` and writes the corresponding `--font-color-*` variable. This means two roles can share a color by pointing to the same slot — changing slot 2's hex updates all roles assigned to slot 2 simultaneously.

### Downloaded Fonts (KV)

All downloaded font records are stored in a **single KV key** `fonts:downloaded` as a JSON array:

```js
// KV key: "fonts:downloaded"
[
  {
    family: string,          // "Inter"
    slug: string,            // "inter" — lowercase, spaces→hyphens, non-alphanumeric stripped
    isVariable: boolean,
    weights?: number[],      // only when !isVariable
    weightRange?: [number, number],  // only when isVariable
    fontFaceCss: string,     // complete rewritten @font-face block(s) with R2 src URLs
  },
  // …
]
```

`POST /api/admin/fonts/download` performs a read-modify-write on this key (upsert by `family`).

`GET /api/site-fonts` reads this single key and concatenates all `fontFaceCss` strings.

**R2 key convention:** `fonts/<slug>/<slug>-variable.woff2` for variable fonts; `fonts/<slug>/<weight>.woff2` for non-variable. Slug derivation: lowercase, spaces replaced with hyphens, all non-alphanumeric characters except hyphens stripped. Example: `"Playfair Display"` → `playfair-display`.

### Migration Defaults

On style load, coerce missing fields as follows (one-time, no DB migration):

| Field | Default value |
|---|---|
| `fontDisplay` | `{ type: "preset", stack: "system-ui, sans-serif", colorSlot: 1 }` |
| `fontHeading` | `{ type: "preset", stack: "system-ui, sans-serif", colorSlot: 1 }` |
| `fontSubheading` | `{ type: "inherit" }` |
| `fontBody` | `{ type: "preset", stack: "Georgia, serif" }` |
| `fontButton` | `{ type: "preset", stack: "system-ui, sans-serif" }` |
| `typographyPalette` | `["#111111"]` |
| `linkStyle` | `{ hoverVariant: "underline", underlineDefault: "hover" }` |

When `colorSlot` is absent on an existing role that previously had an implicit color, default `colorSlot: 1`.

---

## Section 2: API Layer

### `GET /api/admin/fonts/catalog`

- Auth: admin
- Returns `{ fonts: [{ family, category, axes, variants }] }`
- If `GOOGLE_FONTS_API_KEY` env var is set → fetches from `https://www.googleapis.com/webfonts/v1/webfonts?key=...&sort=popularity`
- Otherwise → returns the bundled static JSON snapshot (committed to repo at `src/lib/googleFontsSnapshot.json`)
- The 24h KV cache under key `fonts:catalog` is **always written** regardless of source (API or snapshot). This ensures cold-start performance after the first request even when no API key is present.
- `axes` array containing `{ tag: "wght" }` indicates a variable font

### `POST /api/admin/fonts/download`

- Auth: admin
- Body: `{ family: string, weights?: number[] }`
- **If variable font** (catalog entry has `wght` axis): ignores `weights`, downloads a single variable `.woff2` file
- **If non-variable**: downloads one `.woff2` per entry in `weights` (defaults to `[400, 700]` if omitted)
- Rewrites `@font-face` src URLs to point to R2 (`S3_PUBLIC_URL/fonts/<slug>/…`)
- Uploads font files to R2 under `fonts/<slug>/`
- Upserts the `downloadedFonts` array in KV (read-modify-write on `fonts:downloaded`); upsert is a full replacement of the KV record for that family. R2 files are re-uploaded only for newly requested weights; existing weight files may be skipped (via HEAD check) or overwritten — either is acceptable for v1. The resulting KV record reflects only the weights present in R2 after the operation.
- Returns `{ ok: true, fontFaceCss: string }`
- On failure: returns `{ ok: false, error: string }` with appropriate HTTP status

**Weight selection UI contract:** The font browser modal does **not** show a weight picker for variable fonts — the Download button triggers the request immediately with no `weights` field. For non-variable fonts, clicking Download opens a weight picker popover; the user selects weights, then confirms. The selected weights are sent as `weights: [400, 700, …]`.

### `GET /api/site-fonts`

- Public, no auth
- Reads `fonts:downloaded` KV key
- Concatenates all `fontFaceCss` strings with a newline separator
- Returns `Content-Type: text/css`, `Cache-Control: public, max-age=86400`
- Returns empty response (200 with empty body) if no fonts are downloaded

---

## Section 3: CSS Variable Expansion

### Font variables

| Variable | Default Elements | CSS fallback when absent |
|---|---|---|
| `--font-display` | `h1` | `system-ui, sans-serif` |
| `--font-heading` | `h2, h3, h4` | `system-ui, sans-serif` |
| `--font-subheading` | `h5, h6` | falls through to `--font-heading` (see below) |
| `--font-body` | `body, p, li, span` | `Georgia, serif` |
| `--font-button` | `button, .btn, [role="button"], input[type="submit"]` | `system-ui, sans-serif` |

### Subheading inheritance

When `fontSubheading.type === "inherit"`, `theme.generated.css` writes:
```css
--font-subheading: var(--font-heading);
--font-color-subheading: var(--font-color-heading);
```
This means `h5, h6` automatically follow whatever heading font and color are active, with no extra CSS rules needed in `globals.css`. The `globals.css` static binding for `h5, h6` simply uses `font-family: var(--font-subheading)` and `color: var(--font-color-subheading)` as normal.

If `fontSubheading.type === "inherit"` but a `colorSlot` is explicitly set, the `colorSlot` takes precedence for the color variable only (the font family still inherits from `--font-heading`). This allows a user to have Subheading track Heading's font while using a different color.

### Color variables

Three color CSS variables cover heading roles:

| Variable | Used by |
|---|---|
| `--font-color-display` | `h1` |
| `--font-color-heading` | `h2, h3, h4` |
| `--font-color-subheading` | `h5, h6` |

Each is written to `theme.generated.css` by reading `typographyPalette[role.colorSlot - 1]`. When a role has no `colorSlot`, the variable is omitted and the element inherits `color` from the cascade (i.e., the site's existing default text color).

Body and Button have no color variables — they always inherit.

### `theme.generated.css` generation

`theme.generated.css` is a static file written to disk (in `public/` or equivalent) by the style-save action — the same mechanism already used for other generated CSS. It is served as a static asset, not via an API route. On save:

1. Read the current `siteStyle` from KV
2. Build the CSS variable block (all `--font-*` variables + color variables + link style rules)
3. Write the file; the CDN/Next.js serves it as-is

### Link Hover CSS

A small block in `theme.generated.css` drives the selected hover variant via a `data-link-style` attribute on `<body>` (set by `layout.js` from siteStyle at render time):

| Variant | Behavior |
|---|---|
| `none` | Color only, no decoration change |
| `underline` | `text-decoration: underline` on `:hover` |
| `highlight` | `background: var(--color-link); color: #fff` on `:hover` |
| `inverse` | `background: var(--color-link); color: var(--color-bg)` on `:hover` |
| `pill` | Highlight + `border-radius: 9999px; padding: 0 0.35em` on `:hover` |
| `slide` | CSS `::after` pseudo-element, `scaleX(0→1)` transition left-to-right |
| `box` | `outline: 2px solid var(--color-link); border-radius: 2px` on `:hover` |

`underlineDefault` controls base state (not hover):
- `"always"` → `a { text-decoration: underline }`
- `"hover"` → `a { text-decoration: none }` (decoration only appears from hover variant)
- `"never"` → `a { text-decoration: none }` and suppresses `text-decoration: underline` from the `underline` hover variant specifically. Variants that do not use text-decoration (`highlight`, `inverse`, `pill`, `box`, `slide`) are unaffected by this flag — they are inherently non-underline.

---

## Section 4: Style Tab UI

### Typography Colors Strip

```
Typography Colors
  [● #111111]  [+ second color]
```

After "+ second color" is clicked:
```
Typography Colors
  [● #111111]  [◉ #4682B4]  [− remove]
```

- Each swatch is a color picker (inline or popover)
- Each Display/Heading/Subheading role card shows a colored dot (● for slot 1, ◉ for slot 2); clicking the dot cycles `colorSlot` between 1 and 2. The dot is inert (non-interactive) when `typographyPalette` has only one entry — slot 2 does not exist so there is nothing to cycle to.
- "− remove" is only shown when slot 2 exists; clicking it resets all slot-2 roles back to slot 1 and removes the second swatch
- Body and Button cards show no dot

### Font Role Cards

```
┌─────────────────────────────────────────────────┐
│ ● Display      Inter Variable                   │
│   h1           100–900 · Variable  [Browse] [×] │
├─────────────────────────────────────────────────┤
│ ● Heading      System Sans                      │
│   h2, h3, h4   Preset             [Browse]      │
├─────────────────────────────────────────────────┤
│ ● Subheading   —                                │
│   h5, h6       (inherits Heading) [Browse]      │
├─────────────────────────────────────────────────┤
│   Body         Georgia                          │
│   body, p      Preset             [Browse]      │
├─────────────────────────────────────────────────┤
│   Button       System Sans                      │
│   button       Preset             [Browse]      │
└─────────────────────────────────────────────────┘
```

- × resets to migration default for that role
- Preset quick-pick dropdown alongside Browse: System Sans, System Serif, Monospace, Georgia
- Font changes preview live via a `<style>` tag injected into the admin page that overrides `--font-*` variables (does not affect `theme.generated.css` until saved)

### Select-before-Download behavior

When the user clicks **Select** in the font browser modal for a font that is not yet downloaded:
1. The font is immediately assigned to the role (stored in local editor state); the modal closes
2. The role card shows a "Downloading…" spinner
3. `POST /api/admin/fonts/download` runs in the background
4. On success: spinner clears; the admin preview continues to use Google CDN; the live site will use R2 after the next style save
5. **On failure**: an error toast is shown; the role assignment is rolled back to the previous font; the role card returns to its prior state

The live site CSS is only updated when the admin explicitly saves the style — so there is no risk of a broken `@font-face` being served to visitors during a background download failure.

### Link Style Subsection

Below font role cards:

- `underlineDefault` three-way toggle: Always / On Hover / Never
- Hover variant: horizontal strip of 7 clickable swatch pills, each rendering "Link →" in that style using the site's current accent color

### Themes Strip

Above all font role cards, a horizontal row of 5 named theme chips. Selecting a theme populates all five font roles + `typographyPalette` in one click. Fonts still download on demand — selecting a theme does not trigger any downloads automatically.

---

## Section 5: Font Browser Modal

Opens full-screen (or large sheet) when Browse is clicked on any role card. Header shows the role being edited.

```
┌──────────────────────────────────────────────────────────┐
│ Choose Display Font                              [× Close]│
├──────────────────────────────────────────────────────────┤
│ [🔍 Search fonts...        ] [Category ▾] [Variable only]│
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Inter                        ◉ Downloaded  [Select]    │
│  The quick brown fox…                                    │
│                                                          │
│  Playfair Display             [Download]    [Select]     │
│  The quick brown fox…                                    │
│                                                          │
│  Roboto                       ◉ Downloaded  [Select]    │
│  The quick brown fox…                                    │
└──────────────────────────────────────────────────────────┘
```

- Preview text editable inline; persisted in localStorage
- **Preview renders via Google Fonts CDN** — one `<link>` tag per visible font family injected into `<head>`; when a new font scrolls into view its link is added. Once a font's `<link>` fires its `load` event the tag remains in the DOM until modal close. If another font scrolls into view while a previous link is still pending (load event not yet fired), the pending link is replaced — preventing CDN flooding without erasing already-rendered previews. When the modal closes, all preview links are removed.
- Variable only toggle filters to fonts with a `wght` axis in catalog metadata
- Category filter: Sans Serif, Serif, Display, Handwriting, Monospace
- Download button behavior: variable fonts download immediately on click; non-variable fonts open a weight picker popover first. On download success the button becomes "Downloaded ◉"
- Select assigns immediately and closes modal (with background download if needed — see Section 4)
- List is virtualized (windowed) — ~1500 fonts, renders ~10 rows at a time with a sentinel div triggering infinite scroll
- Currently assigned font for the role is highlighted with a subtle ring

---

## Section 6: @font-face Injection

1. `POST /api/admin/fonts/download` stores rewritten `@font-face` CSS in the `fonts:downloaded` KV record
2. `GET /api/site-fonts` (public) reads the KV key and returns concatenated CSS
3. `layout.js` adds `<link rel="stylesheet" href="/api/site-fonts">` in `<head>` — one line added, nothing else changes
4. `theme.generated.css` (static file, written on style save) sets `--font-*` variables and per-role color variables

Variable font `@font-face`:
```css
@font-face {
  font-family: 'Inter';
  src: url('https://r2.example.com/fonts/inter/inter-variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}
```

Non-variable (one block per weight):
```css
@font-face {
  font-family: 'Playfair Display';
  src: url('https://r2.example.com/fonts/playfair-display/400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
```

Admin preview in the modal uses Google CDN directly — no R2 round-trip during browsing.

**Font deletion / cleanup:** Out of scope for v1. Downloaded fonts that are no longer assigned to any role remain in `GET /api/site-fonts` output. Cleanup tooling can be added in a future iteration.

**`GET /api/site-fonts` cache staleness:** The 24-hour `Cache-Control: public, max-age=86400` header means visitors who cached the response will not receive newly downloaded fonts until expiry. This staleness window is accepted behavior for v1. A future iteration can add a cache-busting query param tied to the style-save version.

**Per-role rendered font weight:** The weight value shown in the theme tables (e.g. "800 variable") is the CSS `font-weight` applied to that element in `globals.css` (e.g. `h1 { font-weight: 800 }`). This is hardcoded per element in `globals.css`, not stored in `siteStyle`. Per-role weight customization is out of scope for this spec.

---

## Section 7: Built-in Themes

Five named presets shipped as a static JS object. Applying a theme sets all five font roles and `typographyPalette` — no downloads are triggered.

Themes express roles in the `siteStyle` data model shape. `type: "google"` roles require a download before they take effect on the live site; the role card shows a Download prompt if not yet available. `weightRange` is set to the font's full axis range (e.g. `[100, 900]`); the weight expressed in the theme description is the *rendered weight used in that theme* (set separately via CSS specificity on that role's element).

### ① Clean *(default)*
```js
typographyPalette: ["#0f0f0f", "#1a1a1a"],
fontDisplay:    { type: "google", family: "Inter", isVariable: true, weightRange: [100, 900], colorSlot: 1 },
fontHeading:    { type: "google", family: "Inter", isVariable: true, weightRange: [100, 900], colorSlot: 2 },
fontSubheading: { type: "google", family: "Inter", isVariable: true, weightRange: [100, 900], colorSlot: 2 },
fontBody:       { type: "google", family: "Inter", isVariable: true, weightRange: [100, 900] },
fontButton:     { type: "google", family: "Inter", isVariable: true, weightRange: [100, 900] },
```

### ② Editorial
```js
typographyPalette: ["#0a0a0a", "#1c3d5a"],
fontDisplay:    { type: "google", family: "Playfair Display", isVariable: false, weights: [700], colorSlot: 1 },
fontHeading:    { type: "google", family: "DM Sans",          isVariable: true,  weightRange: [100, 700], colorSlot: 2 },
fontSubheading: { type: "google", family: "DM Sans",          isVariable: true,  weightRange: [100, 700], colorSlot: 2 },
fontBody:       { type: "google", family: "Lora",             isVariable: false, weights: [400, 600] },
fontButton:     { type: "google", family: "DM Sans",          isVariable: true,  weightRange: [100, 700] },
```

### ③ Technical
```js
typographyPalette: ["#09090b", "#3b3b4f"],
fontDisplay:    { type: "google", family: "Space Grotesk", isVariable: true,  weightRange: [300, 700], colorSlot: 1 },
fontHeading:    { type: "google", family: "Space Grotesk", isVariable: true,  weightRange: [300, 700], colorSlot: 2 },
fontSubheading: { type: "google", family: "IBM Plex Sans", isVariable: false, weights: [400, 500],     colorSlot: 2 },
fontBody:       { type: "google", family: "IBM Plex Sans", isVariable: false, weights: [400] },
fontButton:     { type: "google", family: "Space Grotesk", isVariable: true,  weightRange: [300, 700] },
```

### ④ Warm
```js
typographyPalette: ["#1a0f0a", "#4a3728"],
fontDisplay:    { type: "google", family: "Fraunces", isVariable: true, weightRange: [100, 900], colorSlot: 1 },
fontHeading:    { type: "google", family: "Nunito",   isVariable: true, weightRange: [200, 900], colorSlot: 2 },
fontSubheading: { type: "google", family: "Nunito",   isVariable: true, weightRange: [200, 900], colorSlot: 2 },
fontBody:       { type: "google", family: "Nunito",   isVariable: true, weightRange: [200, 900] },
fontButton:     { type: "google", family: "Nunito",   isVariable: true, weightRange: [200, 900] },
```

### ⑤ Haute
```js
typographyPalette: ["#0d0d0d", "#8b6f47"],
fontDisplay:    { type: "google", family: "Cormorant Garamond", isVariable: false, weights: [300, 600], colorSlot: 1 },
fontHeading:    { type: "google", family: "Raleway",            isVariable: true,  weightRange: [100, 900], colorSlot: 2 },
fontSubheading: { type: "google", family: "Raleway",            isVariable: true,  weightRange: [100, 900], colorSlot: 2 },
fontBody:       { type: "google", family: "Crimson Pro",        isVariable: true,  weightRange: [200, 900] },
fontButton:     { type: "google", family: "Raleway",            isVariable: true,  weightRange: [100, 900] },
```
