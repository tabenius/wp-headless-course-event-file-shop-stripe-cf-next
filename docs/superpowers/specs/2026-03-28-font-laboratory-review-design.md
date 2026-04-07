# Font Laboratory Review — Vintage Theme + CSS Output + Selector Sync

**Date:** 2026-03-28
**Status:** Approved
**Scope:** Add a Vintage typography theme, show CSS declarations in font role cards, and synchronize font selector awareness across roles.

---

## Context

The admin style tab has 5 typography theme presets and a font browser modal for selecting Google Fonts per role (Display, Heading, Subheading, Body, Button). The `type-laboratory.html` reference showcases a vintage aesthetic. Two gaps exist: font choosers don't show the CSS being generated, and there's no cross-role visibility when selecting fonts.

## Changes

### 1. Vintage Typography Theme

Add a "Vintage" preset to `typographyThemes.js` alongside Clean, Editorial, Technical, Warm, and Haute.

Font choices for Vintage theme:

- **fontDisplay:** Playfair Display (variable, weight 400-900, serif)
- **fontHeading:** Cormorant Garamond (variable, weight 300-700, serif)
- **fontSubheading:** inherit (from heading)
- **fontBody:** Lora (variable, weight 400-700, serif)
- **fontButton:** Playfair Display (variable, weight 600, serif)

All fonts are available as variable fonts on Google Fonts. The theme uses warm, old-style serifs throughout for a cohesive vintage feel.

### 2. CSS Output in Font Role Cards

Add a collapsible "Show CSS" panel to each font role card in `AdminStyleTab.js`:

- Toggle button labeled "CSS" below the font role card controls
- When expanded, shows a read-only code block containing:
  - The `@font-face` CSS declaration (from the font's stored `fontFaceCss` in downloaded fonts)
  - The Google Fonts CDN URL: `https://fonts.googleapis.com/css2?family=Family:wght@range&display=swap`
  - A copy button for each block
- Only shown for Google font roles (not preset or inherit)
- The font face CSS is already stored per font in KV (`fonts:downloaded`) — no new data fetching needed, just reading from the existing downloaded fonts list

### 3. Font Selector Cross-Role Awareness

Enhance `AdminFontBrowserModal.js` with cross-role visibility:

- Accept a new prop `usedFonts` — an array of `{ family, role }` objects describing which fonts are currently assigned to other roles
- In the font list, show a subtle badge next to fonts already used by other roles (e.g., "Heading" pill badge)
- This is informational only — does not prevent selection

No weight compatibility validation — YAGNI. The badge is sufficient for awareness.

## Files Changed

| File                                            | Change                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/typographyThemes.js`                   | Add "Vintage" theme preset                                              |
| `src/components/admin/AdminStyleTab.js`         | Add collapsible CSS panel per font role card; pass `usedFonts` to modal |
| `src/components/admin/AdminFontBrowserModal.js` | Accept `usedFonts` prop, show role badges next to used fonts            |

## Out of Scope

- Knob/slider UI from type-laboratory.html (visual inspiration only, not porting the UI)
- OpenType axis controls beyond weight (opsz, ital, slnt)
- Weight range validation across roles
- Changes to font download pipeline or storage
