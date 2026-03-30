# Draft Ideas Synthesis: `draft-font-editor-1` + `draft-font-editor-2`

This document merges the strongest ideas from both drafts into one practical direction.

## Best ideas from Draft 1

- Precision interaction model:
  - knob controls with mouse drag, wheel, touch drag, and pinch handling.
  - explicit clamp/step normalization for stable axis values.
- Category framing for discovery:
  - serif/sans/monospace/handwriting buckets.
- Lightweight Google-font loader:
  - on-demand stylesheet injection by selected family.
- Device behavior awareness:
  - viewport and gesture handling aimed at mobile reliability.

## Best ideas from Draft 2

- Clear information architecture:
  - split into search/list, preview, controls, and CSS output.
- Practical conversion flow:
  - “confirm selection”, then load and tune.
- Rich variable-font dataset:
  - real variable fonts with axis ranges and defaults.
- “Similar fonts” aid:
  - quick alternatives based on name/category proximity.
- Copy-friendly output:
  - generated CSS block with obvious copy affordance.

## Recommended merged direction

1. Keep Draft 2’s page structure as the base shell.
2. Use Draft 1’s robust pointer/touch/step logic in control widgets.
3. Keep Draft 2’s search + similar-font affordances for speed.
4. Keep Draft 2’s CSS export panel, but feed it from normalized axis state from Draft 1.
5. Use a staged complexity model:
   - start with sliders and stable defaults.
   - optional “advanced controls” mode can later re-introduce knob widgets.

## What this repo now includes

- A reusable `GoogleFontChooser` component under `src/`.
- Both drafts moved into this directory for traceability:
  - `draft-font-editor-1`
  - `draft-font-editor-2`
- Existing sketch artifact retained:
  - `sketch-artifacts/type-laboratory.html`
