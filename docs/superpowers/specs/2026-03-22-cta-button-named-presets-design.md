# CTA Button Style & Named Presets Design

## Overview

Extends the typography system with: (1) a full CTA button visual style (`ctaStyle`) stored in `siteStyle`, (2) four built-in CTA presets plus an "Upstream" passthrough option, (3) a persistent named-preset library in KV for both CTA button styles and typography configurations, and (4) an "upstream" first-class concept across the entire style system that lets any field defer to the WordPress theme's own CSS.

---

## Section 1: Data Model

### The "Upstream" Concept

`"upstream"` is a first-class value throughout the style system meaning **do not write this CSS variable** — let the WordPress theme's own stylesheet define it. It applies per field:

- **Color fields** (`background`, `foreground`, `primary`, etc.): value `"upstream"` → CSS variable is omitted from `theme.generated.css` and the inline runtime script
- **Font roles** (`fontDisplay`, `fontHeading`, etc.): `{ type: "upstream" }` → `--font-{role}` variable is omitted
- **`ctaStyle`**: `{ type: "upstream" }` → all ten `--btn-*` variables are omitted
- **`linkStyle`**: `{ type: "upstream" }` → no link hover CSS is written
- **`typographyPalette`**: `["upstream"]` sentinel → no `--font-color-*` variables are written

"Upstream" is the implicit default for any field that is absent — the style system is purely additive. Anything not explicitly overridden defers to WordPress.

### `ctaStyle` object (new field in `siteStyle`)

```js
siteStyle: {
  // ... existing fields ...
  ctaStyle: { type: "upstream" }
  // OR:
  ctaStyle: {
    bgColor:       "primary" | "secondary" | "foreground" | "background" | "custom",
    bgCustom?:     string,          // hex, only when bgColor === "custom"
    textColor:     "background" | "foreground" | "primary" | "secondary" | "custom",
    textCustom?:   string,
    borderRadius:  "none" | "sm" | "md" | "lg" | "full",
    border:        "none" | "solid",
    borderColor?:  "primary" | "secondary" | "foreground" | "custom",  // required when border === "solid"; defaults to "primary" in normalizeCtaStyle
    borderCustom?: string,
    shadow:        "none" | "sm" | "md",
    fontWeight:    "normal" | "medium" | "semibold" | "bold",
    textTransform: "none" | "uppercase" | "capitalize",
    paddingSize:   "sm" | "md" | "lg",
  }
}
```

**Default** (Filled preset — derives from existing `primary` + `background` colors):
```js
{
  bgColor: "primary", textColor: "background", borderRadius: "md",
  border: "none", shadow: "none", fontWeight: "semibold",
  textTransform: "none", paddingSize: "md"
}
```

### Four built-in CTA presets (hardcoded, not deletable)

| Name | bgColor | textColor | borderRadius | border | borderColor | shadow |
|------|---------|-----------|--------------|--------|-------------|--------|
| **Upstream** | — | — | — | — | — | — |
| **Filled** | primary | background | md | none | — | none |
| **Outline** | background | primary | md | solid | primary | none |
| **Pill** | primary | background | full | none | — | none |
| **Secondary** | secondary | foreground | md | none | — | none |

Upstream is always shown first and is not a style object — selecting it sets `ctaStyle: { type: "upstream" }`.

> **Note — Secondary preset contrast:** The Secondary preset pairs `secondary` background with `foreground` text. Because both colors are user-defined, contrast is not guaranteed. The UI does not validate this; admins should verify contrast after choosing custom secondary/foreground values.

### Named preset library (KV key `style-presets`)

```js
// KV key: "style-presets"
{
  cta: [
    {
      id: string,        // crypto.randomUUID()
      name: string,      // user-supplied, e.g. "Dark Solid"
      style: { /* ctaStyle object, never upstream */ }
    }
  ],
  typography: [
    {
      id: string,
      name: string,      // e.g. "fontpair-elegant-sofia"
      style: {
        fontDisplay: { /* font role object */ },
        fontHeading: { /* font role object */ },
        fontSubheading: { /* font role object */ },
        fontBody: { /* font role object */ },
        fontButton: { /* font role object */ },
        typographyPalette: string[],
        linkStyle: { /* link style object */ },
        // ctaStyle is NOT included — it is saved/managed separately via the CTA preset strip
      }
    }
  ]
}
```

IDs are generated with `crypto.randomUUID()` on save. User-created presets are deletable; built-in CTA presets and the five built-in typography themes are not. A missing or null `style-presets` key is treated as `{ cta: [], typography: [] }`.

**Typography preset vs built-in themes:** Built-in themes (Clean, Editorial, Technical, Warm, Haute) specify only font roles and `typographyPalette` — they leave `linkStyle` and `ctaStyle` at their current values when applied. User-saved typography presets capture and restore the full typography state: all five font roles + `typographyPalette` + `linkStyle`. Applying a user preset overwrites `linkStyle` in the style editor state. `ctaStyle` is never included in typography presets.

### Migration defaults

| Field | Default |
|-------|---------|
| `ctaStyle` | `{ type: "upstream" }` — no CSS written; WP theme button styles apply |

When `ctaStyle` is absent from an existing siteStyle record, `normalizeCtaStyle()` returns `{ type: "upstream" }`.

---

## Section 2: API Layer

### New route: `/api/admin/style-presets/route.js`

All three methods require admin auth.

**`GET /api/admin/style-presets`**
- Reads KV key `style-presets`
- Returns `{ ok: true, cta: [...], typography: [...] }`
- Returns `{ ok: true, cta: [], typography: [] }` if key is absent

**`POST /api/admin/style-presets`**
- Body: `{ type: "cta" | "typography", name: string, style: object }`
- Validates: `name` is a non-empty string (max 80 chars); `type` is one of the two values; `style` is present
- For CTA presets: runs `style` through `normalizeCtaStyle()` before storing — invalid fields are clamped, missing `borderColor` defaults to `"primary"`. Rejects if `normalizeCtaStyle()` returns `{ type: "upstream" }` (cannot save upstream as a named preset)
- For typography presets: stores `style` as-is (the client sends already-normalized font role objects)
- Generates `id: crypto.randomUUID()`
- Read-modify-write on `style-presets` KV key — appends to the matching array
- Returns `{ ok: true, preset: { id, name, style } }`

**`DELETE /api/admin/style-presets`**
- Body: `{ id: string, type: "cta" | "typography" }` — `id` must be a non-empty string, max 64 chars
- Read-modify-write — filters out the matching entry by id from the matching array
- Returns `{ ok: true }` (idempotent — no error if id not found)

### Modifications to `shopSettings.js`

**`normalizeCtaStyle(source)`** — new exported helper:
- If `source` is absent/null or `source.type === "upstream"` → return `{ type: "upstream" }`
- If `source` is an object with `bgColor` → validate and clamp each field, return full style object
- Otherwise → return `{ type: "upstream" }` (safe fallback)

**`normalizeSiteStyle()`** — add:
```js
ctaStyle: normalizeCtaStyle(source.ctaStyle),
```

**`areSiteStylesEqual()`** — add:
```js
JSON.stringify(a.ctaStyle) === JSON.stringify(b.ctaStyle)
```

### CSS variable generation (`theme.generated.css`)

When `ctaStyle.type === "upstream"`, write nothing. Otherwise write ten variables (always in this order, for stable `JSON.stringify` comparison in `areSiteStylesEqual`):

```css
--btn-bg:           <resolved color>;
--btn-color:        <resolved color>;
--btn-radius:       <px value>;
--btn-border-width: <0px | 1px>;
--btn-border-color: <resolved color | transparent>;
--btn-shadow:       <value>;
--btn-font-weight:  <number>;
--btn-text-transform: <value>;
--btn-padding-x:    <rem value>;
--btn-padding-y:    <rem value>;
```

Color slot resolution:
- `"primary"` → `var(--color-primary)`
- `"secondary"` → `var(--color-secondary)`
- `"foreground"` → `var(--color-fg)`
- `"background"` → `var(--color-bg)`
- `"custom"` → literal hex from the matching `*Custom` field

For existing color fields (`background`, `foreground`, `primary`, etc.) — when value is `"upstream"`, skip writing that variable entirely.

---

## Section 3: CSS Variable Expansion

### `globals.css` additions

```css
:where(button, .btn, [role="button"], input[type="submit"]) {
  background-color: var(--btn-bg, var(--color-primary));
  color:            var(--btn-color, var(--color-bg));
  border-radius:    var(--btn-radius, 8px);
  border:           var(--btn-border-width, 0px) solid var(--btn-border-color, transparent);
  box-shadow:       var(--btn-shadow, none);
  font-weight:      var(--btn-font-weight, 600);
  text-transform:   var(--btn-text-transform, none);
  padding:          var(--btn-padding-y, 0.625rem) var(--btn-padding-x, 1.25rem);
}
```

**Specificity strategy:** The rule uses `:where()`, which has zero specificity. This means any WordPress theme button rule (even a plain `button { }`) will override it at equal or higher specificity. When `--btn-bg` is unset (upstream ctaStyle) and `--color-primary` is also unset (upstream color), the fallback chain produces an invalid value and the declaration is dropped — the WP theme rule wins. No explicit upstream logic is needed in CSS.

### Concrete value mappings

**`borderRadius`:**
| Value | CSS |
|-------|-----|
| `none` | `0px` |
| `sm` | `4px` |
| `md` | `8px` |
| `lg` | `16px` |
| `full` | `9999px` |

**`paddingSize`:**
| Value | `--btn-padding-y` | `--btn-padding-x` |
|-------|-------------------|-------------------|
| `sm` | `0.375rem` | `0.875rem` |
| `md` | `0.625rem` | `1.25rem` |
| `lg` | `0.875rem` | `1.75rem` |

**`shadow`:**
| Value | CSS |
|-------|-----|
| `none` | `none` |
| `sm` | `0 1px 2px rgba(0,0,0,.08)` |
| `md` | `0 4px 6px rgba(0,0,0,.10)` |

**`fontWeight`:** `normal`=400, `medium`=500, `semibold`=600, `bold`=700

**`border`:** `none` → `--btn-border-width: 0px`, `solid` → `--btn-border-width: 1px`

---

## Section 4: Style Tab UI

### Button Style section

Placed below font role cards in the style tab.

```
Button Style
  [Upstream ●] [Filled] [Outline] [Pill] [Secondary] [My Dark ×]  [Save current…]

  Preview:  [  Shop Now  →  ]      ← live, renders with current --btn-* CSS vars

  Background   [primary ▼]         Text Color   [background ▼]
  Border       [none ▼]            Shadow       [none ▼]
  Radius       [md ▼]              Font Weight  [semibold ▼]
  Text Case    [none ▼]            Padding      [md ▼]
```

- **Upstream selected**: all controls disabled; preview shows "Using WordPress default" label
- **Selecting a preset**: fills all controls and updates the live preview immediately via inline style on the preview element
- **Live preview**: a `<button>` element with inline style applying the current `--btn-*` values — uses the actual CSS variables so it reflects the real computed result
- **Color slot dropdowns**: Primary / Secondary / Foreground / Background / Custom; choosing Custom reveals an inline hex color input
- **Save current…**: expands an inline name input + Save button; on save POSTs to `/api/admin/style-presets` and prepends to the user preset strip
- **User presets**: appear after built-in presets with `×` delete; clicking `×` calls DELETE and removes from local state
- Built-in presets have no `×`

### Typography preset saving

Added to the existing themes strip:

```
Themes
  [Clean] [Editorial] [Technical] [Warm] [Haute]
  [fontpair-elegant-sofia ×]  [Save current…]
```

- **Save current…**: same inline name input pattern; saves all five font roles + `typographyPalette` + `linkStyle` as a named typography preset
- User typography presets appear after the five built-in themes, with `×` to delete
- Applying a user preset works identically to applying a built-in theme: sets all font role state + palette + linkStyle, updates DOM preview, leaves save to user

---

## Section 5: File Map

**New files:**
- `src/app/api/admin/style-presets/route.js` — GET/POST/DELETE named preset library
- `tests/stylePresets.test.js` — unit tests for preset CRUD

**Modified files:**
- `src/lib/shopSettings.js` — add `normalizeCtaStyle()`, extend `normalizeSiteStyle()` and `areSiteStylesEqual()`, handle upstream for all fields
- `src/app/globals.css` — add ten `--btn-*` bindings (with fallback values) to button elements via `:where()` rule
- `src/app/theme.generated.css` — write `--btn-*` variables when `ctaStyle` is non-upstream; write nothing for upstream fields. Fallback/default values live exclusively in the `globals.css` `var()` fallback chain — not here.
- `src/lib/typographyThemes.js` — no changes required; built-in themes do not set `ctaStyle` (each theme applies only its font/palette fields; ctaStyle is left at whatever the current value is)
- `src/components/admin/AdminDashboard.js` — add Button Style section, preset strip, Save current… for typography
