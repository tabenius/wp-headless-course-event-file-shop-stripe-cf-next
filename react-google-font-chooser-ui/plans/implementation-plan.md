# Comprehensive Implementation Plan: Drafted Font-Chooser Features

Date: 2026-03-30
Scope: `react-google-font-chooser-ui` in this monorepo.

## 1. Goal

Deliver a production-ready, reusable font chooser component that combines:

- Draft 1 strengths:
  - robust touch/mouse interaction logic
  - high-fidelity axis control behavior
  - category-first discovery
- Draft 2 strengths:
  - clean information architecture
  - rich variable-font metadata
  - similar-font suggestions
  - copyable CSS output and confirmation flow

Target outputs:

- one reusable React component module
- example host integration
- UX and technical docs
- test and lint coverage for core logic

## 2. Current baseline

Already landed:

- `src/GoogleFontChooser.jsx` (reusable component)
- `src/fontCatalog.js` (starter catalog)
- `src/googleFontChooser.css` (base styles)
- `example.html` (usage reference)
- draft artifacts co-located in this directory

Current gaps:

- direct browser demo is reference-only (not self-bundled runtime)
- no dedicated unit tests yet
- no Storybook-like interaction suite
- no accessibility audit pass
- no persistence bridge to storefront style settings yet

## 3. Feature map and implementation phases

## Phase A: Hardened Core (1-2 days)

Objective:
Make the current chooser stable and deterministic.

Tasks:

1. Normalize axis value model:
   - add strict min/max clamping on every update path.
   - enforce per-axis step precision.
2. Standardize generated CSS:
   - stable axis ordering.
   - consistent quote/comma formatting.
3. Add component-level error handling:
   - fallback UI when font catalog is empty.
   - safe clipboard failure messaging.
4. Add controlled-mode API:
   - optional `value` + `onChange` props for host-managed state.

Done criteria:

- no uncontrolled/controlled warnings
- predictable output for same inputs
- no uncaught runtime errors in empty-catalog mode

## Phase B: Interaction Upgrade from Draft 1 (2-3 days)

Objective:
Bring in advanced input behaviors from knob-focused prototype.

Tasks:

1. Introduce optional “advanced controls” mode:
   - slider mode (default)
   - knob mode (opt-in)
2. Port pointer and touch handling:
   - drag, wheel, touch drag, pinch support.
   - passive listener control and gesture prevention safety.
3. Add keyboard fine-control:
   - arrow keys step axis.
   - Shift+arrow for larger increments.
4. Add axis reset actions:
   - per-axis reset
   - global reset to defaults

Done criteria:

- axis controls functional on desktop + mobile touch
- no scroll-jank while interacting with controls
- keyboard control documented and discoverable

## Phase C: Discovery and Curation from Draft 2 (1-2 days)

Objective:
Improve operator speed when selecting typefaces.

Tasks:

1. Similar-font ranking v2:
   - name token matching
   - category weighting
   - optional manual synonyms map
2. Add “favorites” and “recent” chips:
   - in-memory baseline
   - optional host persistence callback
3. Catalog quality pass:
   - validate axis metadata for each listed font
   - mark uncertain axes with fallback behavior

Done criteria:

- shortlist and selection actions require fewer clicks
- similar suggestions feel relevant for common fonts

## Phase D: Theming and Visual Language (1-2 days)

Objective:
Bridge visual identity from both drafts without harming readability.

Tasks:

1. Introduce theme tokens:
   - neutral/default
   - dark/workbench
   - optional “laboratory” skin inspired by type-laboratory artifact
2. Preserve contrast and legibility:
   - WCAG-focused text/background checks
   - reduce decorative styling in dense controls
3. Add responsive typography tuning:
   - smaller footprint on mobile
   - denser inspector on wide screens

Done criteria:

- style variants can be swapped through props
- no low-contrast text in major states

## Phase E: Integration with Storefront Admin (2-3 days)

Objective:
Use chooser output to drive real admin style settings.

Tasks:

1. Add adapter to `AdminStyleTab`:
   - map selection payload to `fontRoles` schema.
2. Persist chosen axes and family in existing style state.
3. Add “preview before apply” panel in admin.
4. Add rollback action tied to style-history revision save.

Done criteria:

- selecting/applying a font in chooser updates storefront preview immediately
- rollback restores previous font roles cleanly

## 4. Technical architecture

## Component boundaries

- `GoogleFontChooser.jsx`
  - state orchestration
  - callbacks (`onApply`, later `onChange`)
- `fontCatalog.js`
  - curated metadata set
  - no UI logic
- `googleFontChooser.css`
  - visual tokens and layout
  - no business logic
- `utils` (planned)
  - axis math
  - similarity scoring
  - css-output builder

## Data contracts (planned)

Chooser selection payload:

```json
{
  "family": "Inter",
  "category": "sans-serif",
  "fontSize": 52,
  "axisValues": { "wght": 400, "opsz": 14 },
  "variationSettings": "'wght' 400, 'opsz' 14",
  "cssSnippet": "font-family: 'Inter', system-ui, sans-serif;",
  "previewText": "The quick brown fox jumps over the lazy dog"
}
```

Host adapter responsibilities:

- persist `family`
- persist axis settings by role
- generate/load role-specific font CSS vars

## 5. Quality strategy

## Tests to add

1. Unit:
   - clamp/step axis math
   - variation settings serialization
   - similarity ranking stability
2. Component:
   - category + search filtering
   - axis change updates preview style
   - apply callback payload shape
3. Regression:
   - catalog empty
   - unsupported clipboard
   - missing Google font load

## Lint and static checks

- enforce no direct DOM side effects outside guarded hooks
- enforce deterministic key usage in font list rendering
- validate catalog entries with a small schema-check script

## 6. Risks and mitigations

Risk: Google font URL/API changes  
Mitigation: isolate URL builder in utility and keep fallback loading mode.

Risk: touch interactions conflict with page scroll  
Mitigation: apply non-passive listeners only on control surfaces.

Risk: too many UI controls overwhelm non-technical users  
Mitigation: default simple mode, advanced mode opt-in.

Risk: heavy catalog affects rendering speed  
Mitigation: memoized filtering and optional virtualization in large lists.

## 7. Deliverables checklist

- [x] Draft artifacts moved into this directory.
- [x] Initial reusable component structure.
- [x] Example usage file.
- [x] Synthesis of draft ideas.
- [ ] Controlled mode and host persistence adapter.
- [ ] Advanced knob controls.
- [ ] A11y and keyboard audit.
- [ ] Tests + catalog validation script.
- [ ] AdminStyleTab integration and production rollout.
