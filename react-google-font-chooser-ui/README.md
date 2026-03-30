# react-google-font-chooser-ui

In-repo React component module for exploring Google Fonts and variable axes.

## Included

- `src/GoogleFontChooser.jsx` — main UI component.
- `src/fontCatalog.js` — default font list with axis metadata.
- `src/googleFontChooser.css` — component styles.
- `src/index.js` — module exports.
- `draft-font-editor-1` and `draft-font-editor-2` — original draft artifacts.
- `sketch-artifacts/type-laboratory.html` — visual lab prototype.

## Quick usage

```jsx
import { GoogleFontChooser } from "@/../react-google-font-chooser-ui/src";

export default function Demo() {
  return (
    <GoogleFontChooser
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
