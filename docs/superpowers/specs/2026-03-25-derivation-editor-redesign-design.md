# Derivation Editor Redesign — Design Spec

## Goal

Replace the flat dropdown + number-input derivation editor with a beautiful, categorized visual grid picker, slider-based parameter controls, and drag-and-drop pipeline reordering. Expose all 22 user-facing photon pipeline operations in the admin GUI (up from 10). The `source` operation is an internal binding mechanism and is not counted or shown in the grid picker.

## Architecture

Extract the derivation editor from `AdminMediaLibraryTab.js` (~2700 lines) into a focused component tree. The parent passes the focused asset and derivation list; the editor owns all derivation state internally.

### Component Tree

```
AdminMediaLibraryTab.js (existing, trimmed ~600 lines)
  └── DerivationEditor/
        ├── DerivationEditor.js        — container, state, API calls
        ├── DerivationSelector.js      — dropdown to pick/create derivations + metadata form
        ├── OperationGridPicker.js     — categorized icon grid for adding operations
        ├── OperationPipeline.js       — drag-and-drop ordered list of active steps
        ├── OperationCard.js           — single step: slider params, remove, drag handle
        ├── DerivationPreview.js       — preview image + apply/save buttons + progress
        └── operationRegistry.js       — all 22 operation schemas + categories + icons
```

### File Responsibilities

| File                     | Responsibility                                                                                                                                                          | Estimated lines |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `DerivationEditor.js`    | Container component. Owns derivation state (selected derivation, operations array, validation, API calls for load/save/apply). Passes props down.                       | ~200            |
| `DerivationSelector.js`  | Derivation dropdown, metadata form (id, name, description, asset types), "show matching / show all" toggle.                                                             | ~120            |
| `OperationGridPicker.js` | Renders four category sections. Each section has a heading and a row of icon tiles. Clicking a tile calls `onAddOperation(type)`.                                       | ~100            |
| `OperationPipeline.js`   | Renders ordered list of `OperationCard` components. Manages HTML5 drag-and-drop reorder logic. Calls `onReorder(fromIndex, toIndex)`.                                   | ~120            |
| `OperationCard.js`       | Single pipeline step. Drag handle, header (step number, name, category badge, remove button), collapsible body with parameter controls (sliders, text inputs, selects). | ~180            |
| `DerivationPreview.js`   | Preview image display, Apply/Save buttons, progress bar, error state.                                                                                                   | ~100            |
| `operationRegistry.js`   | Exports `OPERATION_SCHEMAS` (all 22 operations), `OPERATION_CATEGORIES`, and icon mappings. Pure data, no JSX.                                                          | ~150            |

### Data Flow

```
AdminMediaLibraryTab
  │
  ├── focusedAsset, derivations[] ──→ DerivationEditor
  │                                      │
  │                                      ├── DerivationSelector
  │                                      │     onSelect(derivationId)
  │                                      │     onMetadataChange(field, value)
  │                                      │
  │                                      ├── OperationGridPicker
  │                                      │     onAddOperation(type)
  │                                      │
  │                                      ├── OperationPipeline
  │                                      │     operations[]
  │                                      │     onReorder(from, to)
  │                                      │     ├── OperationCard
  │                                      │     │     onParamChange(opIndex, key, value)
  │                                      │     │     onRemove(opIndex)
  │                                      │     └── ...
  │                                      │
  │                                      └── DerivationPreview
  │                                            onApply()
  │                                            onSaveToLibrary()
```

## Operation Grid Picker

### Layout

Four category sections arranged vertically. Each has:

- A category heading (subtle, uppercase, small font)
- A flex-wrap row of tiles

### Tile Design

Each tile is ~64x64px:

- Icon/emoji centered (large, ~24px)
- Label below (small, ~11px)
- Rounded corners, subtle border
- Hover: slight scale-up (1.05) + shadow
- Click: brief flash/highlight, immediately adds operation to pipeline
- Tooltip on hover: one-line description of the effect

No separate "Add" button — clicking the tile is the action.

### Categories and Icons

#### Transform

| Operation  | Icon                       | Description                       |
| ---------- | -------------------------- | --------------------------------- |
| crop       | &#x2702; (scissors)        | Crop to exact dimensions          |
| resize     | &#x21F2; (resize arrows)   | Scale to target size              |
| presetCrop | &#x25A3; (aspect box)      | Crop to aspect ratio preset       |
| flip       | &#x21C4; (arrows)          | Mirror horizontally or vertically |
| rotate     | &#x21BB; (clockwise arrow) | Rotate by degrees                 |
| padding    | &#x25A1; (square outline)  | Add border padding                |

#### Color & Tone

| Operation  | Icon                     | Description                  |
| ---------- | ------------------------ | ---------------------------- |
| brightness | &#x2600; (sun)           | Adjust brightness            |
| saturation | &#x1F308; (rainbow)      | Boost or reduce saturation   |
| colorBoost | &#x1F3A8; (palette)      | Vibrance + contrast combined |
| hueRotate  | &#x1F504; (cycle arrows) | Shift color hue              |
| tint       | &#x1F4A7; (droplet)      | Apply RGB color tint         |
| grayscale  | &#x25D1; (half circle)   | Convert to grayscale         |
| invert     | &#x25D0; (inverse half)  | Invert colors                |

#### Effects

| Operation | Icon                 | Description         |
| --------- | -------------------- | ------------------- |
| sharpen   | &#x25C8; (diamond)   | Sharpen edges       |
| blur      | &#x1F32B; (fog)      | Gaussian blur       |
| sepia     | &#x1F4DC; (scroll)   | Vintage sepia tone  |
| solarize  | &#x26A1; (lightning) | Solarize effect     |
| pixelize  | &#x25A6; (grid)      | Pixelation / mosaic |

#### Artistic

| Operation   | Icon                   | Description                     |
| ----------- | ---------------------- | ------------------------------- |
| duotone     | &#x25D3; (circle half) | Two-tone color mapping          |
| oil         | &#x1F58C; (brush)      | Oil painting effect             |
| cropCircle  | &#x25EF; (circle)      | Circular crop with transparency |
| textOverlay | &#x1F524; (abc)        | Draw text on image              |

## Operation Pipeline (Drag-and-Drop)

### Layout

Vertical list of `OperationCard` components inside a container with a dashed-border empty state ("Add operations from the grid above").

### Drag-and-Drop

- **Implementation:** HTML5 Drag and Drop API (no library dependency)
- **Drag handle:** Grip dots icon on left edge of each card (only this element triggers drag)
- **Visual feedback:** During drag, a blue insertion line appears between cards at the drop target
- **Drop:** Reorders the operations array via `onReorder(fromIndex, toIndex)`

### Operation Card

**Collapsed state (default):**

```
[::] 1. Resize — width: 800, height: 600                    [x]
```

- Grip handle | step number | operation name | parameter summary | remove button
- Category color accent on left border (Transform=blue, Color=amber, Effects=purple, Artistic=rose)

**Expanded state (click header to toggle):**

```
[::] 1. Resize                                               [x]
     ┌─────────────────────────────────────────────────┐
     │  Width    [==========|=====] 800                │
     │  Height   [=======|========] 600                │
     └─────────────────────────────────────────────────┘
```

**Auto-expand:** When a new operation is added, its card auto-expands. Others stay collapsed.

## Parameter Controls

### Numeric Parameters — Range Slider

- Label on the left
- HTML `<input type="range">` in the middle (maps to schema `min`/`max`/`step`)
- Current value on the right — displayed as text, clickable to edit directly as number input
- Invalid values (out of range): red highlight on the value display
- On `mouseup` / `touchend` / `change`: calls `onParamChange`

### Text Parameters

- Standard text input with label
- Used for: textOverlay `text`, textOverlay `typeface`

### Select Parameters

- Styled `<select>` or segmented toggle for small option sets
- Used for: presetCrop `preset`, flip `direction`
- Flip direction options: "h" / "v" (displayed as "Horizontal" / "Vertical")
- Rotate degrees: segmented toggle for 90 / 180 / 270 as shortcuts, plus free number input

### Color Picker Parameters (duotone only)

- Hex text input + small color swatch preview
- Duotone has two color pickers (color1, color2)
- UI accepts `#hex` format (e.g. `#ff6600`), converts to `{r, g, b}` object for the pipeline
- Conversion happens in `OperationCard` on param change

### RGB Channel Sliders

- Used for: padding `r`/`g`/`b`/`a`, tint `r`/`g`/`b`
- Three (or four) individual number sliders, one per channel
- These match the photon API which expects separate numeric channels

### Deferred Preview

- When any parameter changes while the derivation is concrete (all params bound), the "Apply / Preview" button pulses briefly (CSS animation) to draw attention
- Preview only fires on explicit button click — not on every slider change
- This keeps server load manageable and makes the interaction intentional

## Complete Operation Schemas

### Existing (updated)

| Operation   | Label        | Parameters                                                                                                                                                    |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| crop        | Crop         | width: number (32-4000, step 1), height: number (32-4000, step 1)                                                                                             |
| resize      | Resize       | width: number (64-4000, step 1), height: number (64-4000, step 1)                                                                                             |
| sharpen     | Sharpen      | _(none)_                                                                                                                                                      |
| colorBoost  | Color Boost  | vibrance: number (-1 to 1, step 0.05), contrast: number (-1 to 1, step 0.05)                                                                                  |
| saturation  | Saturation   | amount: number (-1 to 1, step 0.05)                                                                                                                           |
| sepia       | Sepia        | amount: number (0-1, step 0.05, default 1.0)                                                                                                                  |
| cropCircle  | Circle Crop  | diameter: number (32-4000, step 1), centerX: number (0-100, step 1), centerY: number (0-100, step 1)                                                          |
| presetCrop  | Preset Crop  | preset: select ["4:5", "1:1", "9:16", "3:4", "16:9", "2:1", "21:9"], scale: number (0.5-1, step 0.05)                                                         |
| textOverlay | Text Overlay | text: text, x: number (0-1, step 0.01), y: number (0-1, step 0.01), typeface: text (no-op — only Roboto bundled in photon WASM), size: number (6-200, step 1) |
| source      | Source Asset | assetId: text                                                                                                                                                 |

### New

| Operation  | Label        | Category     | Parameters                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| brightness | Brightness   | Color & Tone | amount: number (-1 to 1, step 0.05, default 0). Pipeline multiplies by 255 before calling `photon.adjust_brightness()`.                                                                                                                                                                                                      |
| grayscale  | Grayscale    | Color & Tone | amount: number (0-1, step 0.05, default 1.0)                                                                                                                                                                                                                                                                                 |
| flip       | Flip         | Transform    | direction: select ["h", "v"] with display labels "Horizontal" / "Vertical" (default "h"). Matches pipeline which checks `dir === "v"`.                                                                                                                                                                                       |
| rotate     | Rotate       | Transform    | degrees: number (0-360, step 1, default 90). UI shows segmented toggle for 90/180/270 as shortcuts, plus free number input for arbitrary angles.                                                                                                                                                                             |
| blur       | Blur         | Effects      | radius: number (1-20, step 1, default 3)                                                                                                                                                                                                                                                                                     |
| padding    | Padding      | Transform    | padding: number (0-500, step 1, default 0), r: number (0-255, step 1, default 255), g: number (0-255, step 1, default 255), b: number (0-255, step 1, default 255), a: number (0-255, step 1, default 255). Matches pipeline's `photon.padding_uniform(img, padding, Rgba(r,g,b,a))`.                                        |
| tint       | Tint         | Color & Tone | r: number (-255 to 255, step 1, default 0), g: number (-255 to 255, step 1, default 0), b: number (-255 to 255, step 1, default 0). Matches pipeline's `photon.tint(img, r, g, b)` which accepts negative values.                                                                                                            |
| hueRotate  | Hue Rotate   | Color & Tone | degrees: number (0-360, step 1, default 0)                                                                                                                                                                                                                                                                                   |
| invert     | Invert       | Color & Tone | amount: number (0-1, step 0.05, default 1.0)                                                                                                                                                                                                                                                                                 |
| solarize   | Solarize     | Effects      | _(none)_                                                                                                                                                                                                                                                                                                                     |
| pixelize   | Pixelize     | Effects      | size: number (2-50, step 1, default 8). Key is `size` to match pipeline's `p.size`.                                                                                                                                                                                                                                          |
| duotone    | Duotone      | Artistic     | color1: {r, g, b} each 0-255 (default {255,255,255}), color2: {r, g, b} each 0-255 (default {0,0,0}). UI shows two color pickers with hex input; `OperationCard` converts hex to `{r,g,b}` object before saving to the operation params. Matches pipeline's `photon.duotone(img, Rgb(c1.r,c1.g,c1.b), Rgb(c2.r,c2.g,c2.b))`. |
| oil        | Oil Painting | Artistic     | radius: number (1-5, step 1, default 2), intensity: number (10-60, step 1, default 30). Ranges match pipeline clamp values.                                                                                                                                                                                                  |

### Category Assignments (all 22)

| Category     | Operations                                                             |
| ------------ | ---------------------------------------------------------------------- |
| Transform    | crop, resize, presetCrop, flip, rotate, padding                        |
| Color & Tone | brightness, saturation, colorBoost, hueRotate, tint, grayscale, invert |
| Effects      | sharpen, blur, sepia, solarize, pixelize                               |
| Artistic     | duotone, oil, cropCircle, textOverlay                                  |

## Pipeline Changes

### Intensity Blending (sepia, grayscale, invert)

All three operations gain an `amount` parameter (0-1, default 1.0). All three need pipeline changes — they currently call their photon functions directly with no amount support.

Implementation in the photon pipeline for each:

1. If `amount === 1.0` (or missing): apply directly, same as current behavior
2. Otherwise: clone the image, apply the effect at full strength to the clone, blend original and processed using `amount` as the mix factor via `photon.blend(original, processed, amount)`

### Brightness Scaling

The schema uses a normalized `-1 to 1` range (intuitive for sliders). The pipeline must multiply by 255 before calling `photon.adjust_brightness(img, Math.round(amount * 255))`. This is a one-line change in the brightness case.

### Other New Operations

The photon pipeline (`photonPipeline.js`) already has case blocks for all 12 new operations. No logic changes needed for: flip, rotate, blur, padding, tint, hueRotate, solarize, pixelize, duotone, oil. The schemas match the existing pipeline parameter names and ranges (after fixes above).

## Backward Compatibility

Existing saved derivations must continue to work:

- **sepia/grayscale/invert without `amount`:** Pipeline defaults to `1.0` when `amount` is missing (full-strength, identical to current behavior)
- **brightness without scaling:** Old derivations that stored raw 0-255 values: the pipeline detects values outside `-1..1` and skips the `*255` scaling. New derivations from the slider always produce normalized values.
- **Renamed labels** (e.g. "Crop" stays "Crop"): Operation `type` keys are unchanged; only display labels in the registry change. Stored derivations reference types, not labels.
- **`source` operation:** Unchanged, not shown in grid picker, still works in pipeline

## Validation

Existing validation logic (`isInvalidNumericParam`) carries forward unchanged. The status badges (concrete/abstract, unbound parameters, invalid parameters) move into `DerivationEditor.js` and work exactly as today.

## Dependencies

**Zero new dependencies.** Everything uses:

- HTML5 Drag and Drop API (built-in)
- HTML `<input type="range">` (built-in)
- Existing Tailwind/CSS styling patterns from the admin UI

## Not In Scope

- Live preview (real-time updates while dragging sliders) — deferred preview only
- Custom SVG icon set — Unicode/emoji initially, upgradeable later
- Preset operation chains (e.g. "Web optimized" = resize + sharpen)
- Undo/redo for pipeline changes
- Keyboard accessibility for drag-and-drop (future enhancement)

## Testing

- Verify all 22 operations appear in grid picker with correct categories
- Verify clicking a tile adds the operation with correct default parameters
- Verify drag-and-drop reorders operations correctly
- Verify sliders respect min/max/step constraints
- Verify deferred preview works (apply button triggers render)
- Verify sepia/grayscale/invert intensity blending at amount < 1.0
- Verify existing derivations with old operations still load and work
- Verify the "source" operation (used for asset binding) still works in pipeline
