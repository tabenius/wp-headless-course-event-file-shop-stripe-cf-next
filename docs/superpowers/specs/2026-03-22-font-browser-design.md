# Font Browser & Typography System Design

## Overview

A full Google Fonts browser integrated into the admin style editor, supporting five named typography roles (Display, Heading, Subheading, Body, Button), per-role colors, link hover variants, and five built-in themes. Fonts are self-hosted on R2 for production; Google CDN is used for admin preview only.

---

## Section 1: Data Model

### Site Style (stored in KV / siteConfig)

Five typography roles are added to `siteStyle`:

```js
siteStyle: {
  fontDisplay:    { type: "preset"|"google", stack?: string, family?: string, weights?: number[], weightRange?: [number,number], isVariable?: boolean, color?: string },
  fontHeading:    { /* same shape */ },
  fontSubheading: { /* same shape */ },
  fontBody:       { /* same shape */ },
  fontButton:     { /* same shape */ },
  linkStyle: {
    hoverVariant: "none"|"underline"|"highlight"|"inverse"|"pill"|"slide"|"box",
    underlineDefault: "always"|"hover"|"never",
  },
}
```

- `type: "preset"` — system font stack (no download), `stack` holds the CSS value (e.g. `system-ui, sans-serif`)
- `type: "google"` — Google Font hosted on R2, `family` is the font name
- `isVariable: true` → one file covering axis range; `weightRange: [100, 900]`
- `isVariable: false` → discrete weight files; `weights: [400, 700]`
- `color` — optional hex string; absent = inherits site default text color
- Body and Button do not use `color` (inherit from existing text/brand color system)

### Downloaded Fonts (stored in KV, keyed by family)

```js
downloadedFonts: [{
  family: string,          // "Inter"
  isVariable: boolean,
  weights?: number[],      // only when !isVariable
  weightRange?: [number, number],  // only when isVariable, e.g. [100, 900]
  fontFaceCss: string,     // rewritten @font-face blocks with R2 src URLs
}]
```

### Migration Defaults

On style load, if a role key is absent, default to:

| Role | Default |
|---|---|
| `fontDisplay` | `{ type: "preset", stack: "system-ui, sans-serif" }` |
| `fontHeading` | `{ type: "preset", stack: "system-ui, sans-serif" }` |
| `fontSubheading` | `{ type: "preset", stack: "system-ui, sans-serif" }` |
| `fontBody` | `{ type: "preset", stack: "Georgia, serif" }` |
| `fontButton` | `{ type: "preset", stack: "system-ui, sans-serif" }` |
| `linkStyle` | `{ hoverVariant: "underline", underlineDefault: "hover" }` |

---

## Section 2: API Layer

### `GET /api/admin/fonts/catalog`

- Auth: admin
- Returns the Google Fonts catalog as JSON: `{ fonts: [{ family, category, axes, variants }] }`
- If `GOOGLE_FONTS_API_KEY` env var is set: fetches from `https://www.googleapis.com/webfonts/v1/webfonts?key=...&sort=popularity`
- Otherwise: falls back to a bundled static JSON snapshot (committed to repo, updated periodically)
- Response cached 24 h in KV under key `fonts:catalog`
- `axes` array present → font supports variable axis; `wght` axis → variable weight font

### `POST /api/admin/fonts/download`

- Auth: admin
- Body: `{ family: string, weights?: number[] }`
- Looks up the family in the catalog
- If font has `wght` axis → downloads the variable font `.woff2` file, ignores `weights`
- Otherwise → downloads one `.woff2` per requested weight
- Rewrites `@font-face` src URLs to point to R2 (`S3_PUBLIC_URL/fonts/...`)
- Uploads font files to R2 under `fonts/<family-slug>/`
- Stores the `downloadedFonts` record in KV
- Returns `{ ok: true, fontFaceCss: string }`

### `GET /api/site-fonts`

- Public, no auth
- Reads all `downloadedFonts` records from KV
- Concatenates their `fontFaceCss` strings
- Returns `Content-Type: text/css`, `Cache-Control: public, max-age=86400`

---

## Section 3: CSS Variable Expansion

Five CSS variables control typography across the site:

| Variable | Default Elements | Default Fallback |
|---|---|---|
| `--font-display` | `h1` | `system-ui, sans-serif` |
| `--font-heading` | `h2, h3, h4` | `system-ui, sans-serif` |
| `--font-subheading` | `h5, h6` | `system-ui, sans-serif` |
| `--font-body` | `body, p, li, span` | `Georgia, serif` |
| `--font-button` | `button, .btn, [role="button"], input[type="submit"]` | `system-ui, sans-serif` |

Per-role heading colors use three additional variables:

| Variable | Used by |
|---|---|
| `--font-color-display` | `h1` |
| `--font-color-heading` | `h2, h3, h4, h5, h6` |

Element-to-variable bindings are static rules in `globals.css` — they never change. Only the variable values in `theme.generated.css` change when fonts/colors are saved.

### Link Hover CSS

A small block in `theme.generated.css` applies the selected link hover variant via a `data-link-style` attribute on `<body>`:

```css
/* example: slide variant */
[data-link-style="slide"] a::after {
  content: '';
  display: block;
  height: 2px;
  background: var(--color-link);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.2s ease;
}
[data-link-style="slide"] a:hover::after { transform: scaleX(1); }
```

Variants:

| Variant | Behavior |
|---|---|
| `none` | Color only, no decoration |
| `underline` | `text-decoration: underline` on hover |
| `highlight` | `background: var(--color-link); color: #fff` on hover |
| `inverse` | `background: var(--color-link); color: var(--color-bg)` on hover |
| `pill` | Highlight + `border-radius: 9999px; padding: 0 0.35em` |
| `slide` | CSS `::after` pseudo-element, `scaleX` transition |
| `box` | `outline: 2px solid var(--color-link)` on hover |

`underlineDefault` controls the base state:
- `"always"` → `a { text-decoration: underline }`
- `"hover"` → `a { text-decoration: none }` (underline only on hover)
- `"never"` → `a { text-decoration: none }` + hover variant suppresses underline

---

## Section 4: Style Tab UI

### Typography Colors Strip

Above the font role cards:

```
Typography Colors
  [● #111111]  [+ second color]
```

Clicking `+ second color` adds a second swatch. Each heading role card gains a colored dot that toggles between swatch 1 and swatch 2. Body and Button do not participate (inherit from existing text/brand system).

### Font Role Cards

Five role cards in the Typography section:

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

- Colored dot (●/◉) on Display, Heading, Subheading indicates which color swatch is assigned; clicking cycles between slot 1 / slot 2
- × resets to preset default
- Preset quick-pick dropdown alongside Browse (System Sans, System Serif, Monospace, Georgia)
- Font changes preview live via a `<style>` tag injected into the page overriding `--font-*` variables

### Link Style Subsection

Below font role cards:

- `underlineDefault` toggle: Always / On Hover / Never
- Hover variant: horizontal strip of 7 clickable swatch pills, each rendering "Link →" in that style using the site's current accent color

### Themes Strip

Above all font role cards, a horizontal row of 5 named theme chips. Selecting a theme populates all five roles + colors in one click; individual roles can still be overridden after.

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
- Preview renders via Google Fonts CDN — no download needed to see the font
- Variable only toggle filters to fonts with a `wght` axis
- Category filter: Sans Serif, Serif, Display, Handwriting, Monospace
- Download triggers `POST /api/admin/fonts/download` with spinner; becomes "Downloaded ◉" on success
- Select immediately assigns font to the role and closes modal; downloads in background if not yet downloaded
- List is virtualized (windowed) — ~1500 fonts, renders ~10 rows at a time with sentinel div for infinite scroll
- Currently assigned font for the role highlighted with a subtle ring

---

## Section 6: @font-face Injection

1. `POST /api/admin/fonts/download` stores rewritten `@font-face` CSS in the `downloadedFonts` KV record (R2 src URLs)
2. `GET /api/site-fonts` concatenates all `fontFaceCss` blocks → returns as `text/css`
3. `layout.js` adds one `<link rel="stylesheet" href="/api/site-fonts">` in `<head>`
4. `theme.generated.css` sets the five `--font-*` variables and per-role color variables

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

Admin preview in the modal injects a `<link>` to Google CDN into `<head>` on demand, removed when modal closes.

---

## Section 7: Built-in Themes

Five named presets shipped as a static JS object. Selecting a theme sets all five roles + colors; fonts download on demand when user saves or clicks Download explicitly.

### ① Clean *(default)*
> Sharp, neutral, works everywhere.

| Role | Font | Weight |
|---|---|---|
| Display | Inter | 800 variable |
| Heading | Inter | 600 variable |
| Subheading | Inter | 500 variable |
| Body | Inter | 400 variable |
| Button | Inter | 500 variable |

Colors: `#0f0f0f` display · `#1a1a1a` headings

### ② Editorial
> Magazine tension between high-contrast serif display and clean sans body.

| Role | Font | Weight |
|---|---|---|
| Display | Playfair Display | 700 |
| Heading | DM Sans | 600 variable |
| Subheading | DM Sans | 400 variable |
| Body | Lora | 400 |
| Button | DM Sans | 500 variable |

Colors: `#0a0a0a` display · `#1c3d5a` headings (ink navy)

### ③ Technical
> Startup/dev tool energy. Geometric with personality.

| Role | Font | Weight |
|---|---|---|
| Display | Space Grotesk | 700 variable |
| Heading | Space Grotesk | 500 variable |
| Subheading | IBM Plex Sans | 500 |
| Body | IBM Plex Sans | 400 |
| Button | Space Grotesk | 500 variable |

Colors: `#09090b` display · `#3b3b4f` headings (cool slate)

### ④ Warm
> Approachable and human. Optical-size serif display with rounded sans.

| Role | Font | Weight |
|---|---|---|
| Display | Fraunces | 700 variable |
| Heading | Nunito | 700 variable |
| Subheading | Nunito | 500 variable |
| Body | Nunito | 400 variable |
| Button | Nunito | 600 variable |

Colors: `#1a0f0a` display (warm black) · `#4a3728` headings (warm brown)

### ⑤ Haute
> Fashion/luxury. Ultra-light display, geometric sans headings, classical body serif.

| Role | Font | Weight |
|---|---|---|
| Display | Cormorant Garamond | 300 |
| Heading | Raleway | 600 variable |
| Subheading | Raleway | 400 variable |
| Body | Crimson Pro | 400 variable |
| Button | Raleway | 500 variable |

Colors: `#0d0d0d` display · `#8b6f47` headings (warm gold)
