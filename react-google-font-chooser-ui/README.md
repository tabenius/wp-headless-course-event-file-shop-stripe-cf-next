# react-google-font-chooser-ui

In-repo React component module for exploring Google Fonts and variable axes.

## Included

- `src/GoogleFontChooser.jsx` — main UI component.
- `src/AxisKnob.jsx` — advanced axis control widget.
- `src/fontCatalog.js` — default font list with axis metadata.
- `src/googleFontChooser.css` — component styles.
- `src/utils.js` — deterministic axis math and formatter helpers.
- `src/index.js` — module exports.
- `draft-font-editor-1` and `draft-font-editor-2` — original draft artifacts.
- `sketch-artifacts/type-laboratory.html` — visual lab prototype.
- `tests/utils.test.mjs` — utility-level regression tests.

## Quick usage

```jsx
import { GoogleFontChooser } from "@/../react-google-font-chooser-ui/src";

export default function Demo() {
  return (
    <GoogleFontChooser
      allowAdvancedToggle
      advancedDefault={false}
      confirmBeforeSwitch={false}
      onApply={(selection) => {
        console.log(selection);
      }}
    />
  );
}
```

`onApply` receives:

- `family`
- `category`
- `fontSize`
- `axisValues`
- `variationSettings`
- `cssSnippet`
- `previewText`

## Development checks

```bash
node --test react-google-font-chooser-ui/tests/utils.test.mjs
npx eslint react-google-font-chooser-ui/src/*.js react-google-font-chooser-ui/src/*.jsx
```
