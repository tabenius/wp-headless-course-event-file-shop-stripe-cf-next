# Claude + Codex Co-Working Log

## Active TODO Backlog (priority x impact)

DONE [P0 | Very High]: Image generation runtime reliability — `/api/admin/generate-image` now returns classified diagnostics (`code`, `hint`, `requestId`) with timeout handling, provider error classification, partial-success warnings, and improved admin toast reporting.
DONE [P0 | Very High]: Receipt PDF validity — Stripe receipt proxy now enforces HTTPS Stripe-host allowlist, verifies `%PDF`, traces response provenance (status/content-type/final URL/elapsed), extracts embedded PDF URLs from HTML wrappers, and falls back to invoice PDF URLs.
DONE [P1 | High]: VAT/Moms completion across all product sources — per-item VAT override persists through admin save/API/store/WordPress backend, checkout metadata now carries VAT, and sales VAT/net use tax-inclusive math with metadata/product/category VAT precedence.
DONE [P2 | Medium]: Welcome story data realism — replaced the mock image-generator slide with live quota + latest-run snapshot state and a read-only fallback when live API state is unavailable.
DONE [P2 | Medium]: Dead-link finder panel — added admin scanner (content `<a href>` extraction + internal/pseudo-external/external classification + reachability checks) and surfaced it in Support with filters and source traces.
DONE [P3 | Medium]: Documentation UX pass — added GUI visuals alongside key sections, reordered operator instructions for average-user relevance, and synced wording with current tab names/flows.
TODO [P2 | Medium]: Admin header stats ticker — add a scrolling menu-bar ticker showing: total revenue, number of users, number of bought products, sales-per-user ratio (%), and average weekly hits/day; implement via one aggregated admin endpoint with graceful fallback when Stripe/analytics are unavailable.
TODO [P3 | Medium]: Post-implementation code review — run a full quality/usability review pass and capture prioritized improvements.
TODO [P2 | Medium]: Admin UX polish follow-up (Codex review for Claude) — add focus trap + initial focus for hamburger drawer, prevent global `Ctrl+Alt` actions while typing in form controls, make media table rows keyboard-selectable (`Up/Down`, `Enter`, `Space`), and hard-validate numeric derivation params before enabling apply.
TODO [P2 | Medium]: WordPress plugin media metadata surface — update `packages/ragbaz-articulate-plugin` to expose attachment asset metadata (`assetId`, `original`, `variants`, `size`, `dimensions`, `mime`, `hash`) so admin/storefront pipelines can resolve original↔compressed relationships consistently across WP media and R2.
TODO [P2 | Medium]: WordPress plugin presence/version GraphQL signal — expose plugin presence + semantic version over GraphQL so admin health/info views can detect compatibility before running attachment-asset metadata flows.

## 2026-03-20 (cont. 82)

### Codex — image uploader UX compacted + source chooser + Escape cancel

- Reworked `ImageUploader` modal layout to reduce vertical stack usage:
  - image/canvas now lives on the left,
  - controls live on the right,
  - aspect + output resolution are now positioned close to the visual crop area.
- Added first-step image source chooser:
  - option 1: browse media library,
  - option 2: upload a new image.
- Added in-uploader media-library browser modal (image-only selection from WP + R2 via `/api/admin/media-library`) so users can assign existing assets directly.
- Moved upload destination selector to the end of the control list.
- Collapsed advanced metadata controls under a `More` accordion:
  - derived-work toggle,
  - copyright holder,
  - license.
- Updated variant semantics:
  - uploader now uses `original` or `derived-work` variant kind (no `compressed` option in UI/default parsing path).
- Added universal Escape-to-cancel behavior for uploader-related modals:
  - source chooser,
  - media browser,
  - crop/upload editor.
- Updated EN/SV/ES i18n for the new chooser/browser/accordion/resolution labels and variant copy.
- Verification:
  - `npm run lint` (passes; existing 3 `@next/next/no-img-element` warnings unchanged),
  - `npm test` (passes: `144` pass, `0` fail, `3` skipped),
  - `npm run build` (passes; route generation successful, with known intermittent WordPress/GraphQL fetch noise during static generation).

## Joint plan

- Coordinate the Media tab derivation review with Claude by logging observations as `TODO:` entries when we stop, syncing on follow-ups, and keeping `AGENTS.md`/`claude+codex-coop.md` aligned per the shared-doc protocol.

## 2026-03-21 (Codex)

### Codex — derivation preview matrix + parameter guardrails (in progress)

- Added derivation summary badges/screens in the Media tab: pseudo-name, concrete vs abstract state, unbound-parameter chips, and an operation matrix table that highlights which parameters are preset and which are left open.
- Prevented `Apply derivation` from running while parameters remain unbound and documented the requirement in README/AGENTS to keep abstract chains reusable until a concrete asset is chosen.

## 2026-03-20 (cont. 81)

### Codex — owner URI inheritance groundwork for asset records

- Added owner-scoped asset metadata fields in upload + media-library flows:
  - `ownerUri` (defaults to `/`),
  - asset-ID-based URI (`/asset/<asset-id>`),
  - optional `slug`.
- Upload pipeline now persists these fields to both storage backends:
  - WordPress attachment meta (`ragbaz_asset_owner_uri`, `ragbaz_asset_uri`, `ragbaz_asset_slug`),
  - R2 object metadata (`asset_owner_uri`, `asset_uri`, `asset_slug`).
- Media-library listing normalization now surfaces owner/access context in each `asset` record:
  - `ownerUri`,
  - `uri`,
  - `slug`,
  - `accessInheritance: "owner"`.
- Media annotation save flow now carries `asset` fields so owner/URI metadata survives metadata edits (no accidental key drop on R2 metadata replacement).
- Added admin UI annotation inputs for owner URI, optional asset slug, and asset URI base to support the evolving URI protocol.
- Verification:
  - `npm run lint` (passes; existing 3 `@next/next/no-img-element` warnings unchanged),
  - `npm test` (passes: `144` pass, `0` fail, `3` skipped).

## 2026-03-20 (cont. 80)

### Codex — media library extended to structured assets + in-app viewers

- Extended Media tab uploads beyond images to support JSON, YAML, CSV, Markdown, and SQLite files (plus images), with backend selection preserved (default WordPress, optional R2/S3 if enabled).
- Added `/api/admin/media-library/view` (Node runtime) to securely fetch/preview assets server-side with allowed-host checks and typed viewers:
  - JSON: parse + pretty + root summary,
  - CSV: header annotation parsing + inferred column types + sample rows,
  - YAML: text + top-level key summary,
  - Markdown: heading extraction + rendered preview,
  - SQLite: binary header inspection (page size/encoding/page count/user version/schema cookie).
- Added metadata model extensions across WP/R2 media APIs and UI annotation editor:
  - `usageNotes` (unstructured usage guidance),
  - `structuredMeta` (structured schema/semantics blob),
  - `schemaRef` (external schema/contract reference).
- Updated locale parity in EN/SV/ES for the new media upload/viewer/metadata strings.
- Hardened Media-tab uploader behavior for mixed selections by preserving unsupported-file detection and clearer skip/error messaging.
- Verification:
  - `npm run lint` (passes; existing 3 `@next/next/no-img-element` warnings unchanged),
  - `npm test` (passes: `144` pass, `0` fail, `3` skipped),
  - `npm run build` (passes; route list now includes `/api/admin/media-library/view`; observed transient WordPress/GraphQL network 429/socket warnings during build fetches but final build succeeded).

## 2026-03-20 (cont. 79)

### Codex — Media tab upload zone (drag/drop + paste + backend chooser)

- Added direct image-ingest UI to `AdminMediaLibraryTab`:
  - drag-and-drop upload area for image files,
  - clipboard paste ingestion (click zone + `Ctrl/Cmd+V`),
  - hidden multi-file picker fallback (`Choose images`).
- Wired uploads to the existing admin upload API (`/api/admin/upload?kind=image`) so media-tab uploads use the same backend-aware asset pipeline as product image uploads.
- Added per-upload backend selector in Media tab:
  - defaults to WordPress media when available,
  - allows switching to R2 (and S3 only when explicitly enabled/configured).
- Added upload UX feedback:
  - in-zone active drag state,
  - progress/status text + success/error toasts,
  - partial-success messaging for mixed outcomes (e.g., oversized files skipped).
- Updated admin i18n keys in EN/SV/ES for the new media upload zone copy and statuses.
- Updated `AdminDashboard` to pass `uploadBackend` and `uploadInfo` props into Media tab for backend availability logic.
- Verification:
  - `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only),
  - `npm test` passes (`144` pass, `0` fail, `3` skipped).

## 2026-03-20 (cont. 78)

### Codex — asset-aware upload pipeline + media annotation (WP + R2)

- Rebuilt image upload pipeline around a shared asset record with two-step upload flow:
  - original file uploads first and is tagged as `original`,
  - processed variant uploads second and links back to original (`assetId`, original URL/ID, hash, dimensions, format).
- Added upload-time variant typing + rights metadata:
  - variant kind now supports `compressed` and `derived-work`,
  - copyright holder + license captured in uploader and propagated through upload API/storage metadata.
- Extended `/api/admin/upload` asset metadata handling:
  - persists asset metadata for WP, R2, and optional S3 paths,
  - writes WordPress attachment meta (`ragbaz_asset_*`) when WP accepts those keys,
  - includes structured `asset` object in upload response for downstream UI.
- Extended combined media library API/UI for browsing + annotation:
  - `/api/admin/media-library` now returns inherited metadata for WP attachments (`title/caption/description/alt`) plus asset/rights fields where present,
  - R2 rows now probe object metadata headers and surface asset/rights annotations in the same shape,
  - added `POST /api/admin/media-library` metadata updates for:
    - WordPress attachments (title/caption/description/alt + ragbaz meta),
    - R2 objects (managed `x-amz-meta-asset_*` keys via metadata replacement copy).
- Added media annotation editor in `AdminMediaLibraryTab`:
  - per-item annotate panel for title/caption/description/alt/tooltip + copyright/license,
  - quick “suggest alt/tooltip” helper from existing metadata seed,
  - save flow with success/error toasts and refresh.
- Follow-up hardening: when a WordPress install rejects unknown attachment `meta` keys, the media-library save route now retries the update without custom meta so title/caption/description/alt edits still persist.
- Added/updated EN/SV/ES i18n keys for media tab + annotation labels and uploader variant/rights controls.
- Verification:
  - `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only),
  - `npm test` passes (`144` pass, `0` fail, `3` skipped).

## 2026-03-20 (cont. 77)

### Codex — Media tab + consolidated Info hub (stats/health/docs subroutes)

- Added a new dedicated admin **Media** tab backed by `/api/admin/media-library`:
  - combines WordPress media library + R2 object listings in one response,
  - includes file size, file type, and image resolution metadata when available,
  - supports source filtering (`all|wordpress|r2`) and search.
- Added `AdminMediaLibraryTab` UI:
  - combined table view with source badges, preview, size/type/resolution columns, updated timestamp, and copyable URLs.
- Consolidated top-level admin surface area by moving **Stats**, **Health check**, and **Documentation** under the **Info** hub as subroutes:
  - `#/info` (overview/runtime),
  - `#/info/stats`,
  - `#/info/health`,
  - `#/info/docs`.
- Updated routing aliases for backward compatibility:
  - legacy `#/stats`, `#/health`, and `#/docs` now map into `#/info/...` paths.
- Updated header/navigation behavior:
  - removed standalone top-level Stats/Health/Docs nav entries,
  - added top-level Media nav entry,
  - status control now routes to `#/info/health` (subroute) for health checks.
- Updated welcome quick-nav cards to target new consolidated info subroutes and include Media.
- Added `Ctrl+Alt+A` tab hotkey for Media (`adminHotkeys` + test update), while keeping legacy stats/health hotkeys functional via Info subroute aliasing.
- Synced missing i18n parity key (`shopProductInlineHint`) in `sv`/`es`.
- Verification:
  - `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only),
  - `npm test -- tests/admin-hotkeys.test.js tests/i18n-admin-parity.test.js` passes.

## 2026-03-20 (cont. 76)

### Codex — remove hidden legacy Products tab code path

- Removed unreachable legacy branch from `AdminProductsTab` after the All-products merge:
  - deleted the entire `ProductsTab` component implementation,
  - removed dead render branch `innerTab === "products"`.
- Deleted stale helpers only used by the removed branch (`formatBytes`, `formatIsoDate`).
- Result: no hidden duplicate editor path remains; Access tab is now the single product editing surface.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-20 (cont. 75)

### Codex — merge direction: All Products absorbs Digital Downloads editor fields

- Implemented first-pass merge in `AdminProductsTab`:
  - removed `Digital products` inner-tab from `InnerTabs` navigation (All Products + Visible types remain),
  - expanded Access-tab shop-selection panel from “mini info” to full editable shop-product details.
- New shop fields now available directly in All Products detail pane:
  - image picker/upload,
  - name, slug, type, active toggle,
  - description + image generator toggle,
  - digital file URL + upload button + backend/runtime hint,
  - course URI input for course-type products,
  - remove button for selected shop product.
- Goal: reduce mode switching and keep one canonical editor for product operations.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-20 (cont. 74)

### Codex — revert backend pin, keep diagnostics + modal close behavior

- Reverted temporary All-Products Access-tab backend override:
  - changed WP item image picker from `uploadBackend=\"wordpress\"` back to `uploadBackend={uploadBackend}`.
  - rationale: keep consistent backend behavior across Products/Access tabs as requested.
- Added better failure diagnostics to `ImageUploader` save path:
  - console error now includes `{ backend, status, error }` on non-OK responses,
  - thrown exceptions are logged with backend context,
  - emitted error text now appends backend marker (e.g. `(...backend...)`) for operator clarity.
- Preserved prior UX fix: crop modal auto-closes/reset on failed save.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-20 (cont. 73)

### Codex — All Products image upload backend safety + modal-close-on-error

- Applied targeted backend safety for WP-content image editing in Access (All Products) panel:
  - Access-tab `ImagePickerButton` now explicitly uses `uploadBackend=\"wordpress\"` for WP item images.
  - This avoids bucket-backend code paths when updating WordPress-native content images in that panel.
- Improved failed-upload UX in `ImageUploader`:
  - when upload returns non-OK or throws, modal now auto-closes and clears transient preview/file state instead of requiring manual Cancel.
- Context: user observed Digital Downloads image edit working while All Products save emitted `fs`-related error and left crop dialog open.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-20 (cont. 72)

### Codex — regression timeline check + revert to near-working picker interaction

- Reviewed image-picker history around ~4 hours prior (`2026-03-19 20:30–21:30 UTC`) and identified `cb8bc56` (`20:43 UTC`) as the closest “almost working” baseline for trigger behavior.
- Reverted current interaction wiring to match that baseline:
  - `ImagePickerButton`: back to straightforward `onClick={openPicker}` (removed pointer-down/keyboard event-interception layer).
  - `ImageUploader.openFilePicker`: plain `input.click()` path with no extra event handling.
- Kept visual affordance improvements in place while simplifying click flow to reduce Brave-specific gesture blocking risk.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-20 (cont. 71)

### Codex — product image picker clickable-area reliability fix

- Fixed product editor image-picker trigger reliability in two places:
  - `ImageUploader.openFilePicker` now uses direct `input.click()` only (removed `showPicker()` path that can no-op on some browsers without throwing).
  - `ImagePickerButton` trigger now enforces click ownership via `preventDefault()` + `stopPropagation()` and forwards the event into `openPicker`.
- Added `pointer-events-auto` to the image trigger button class to ensure the trigger surface remains clickable even under layered UI overlays.
- Result: clicking the product image tile/pen area should consistently open the file chooser in the product editor.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 70)

### Codex — menu bar shifted to stronger saturated red-orange

- Retuned `AdminHeader` menu palette to a more saturated red-orange direction:
  - primary bar hue/saturation/brightness moved from `hsl(33 40% 37%)` to `hsl(22 62% 42%)`,
  - border, control surfaces, hover states, drawer/tooltip, and language-select background were adjusted to matching `hsl(22 ...)` values with higher chroma.
- Goal: visibly warmer red-orange bar with stronger saturation while keeping readability/contrast intact.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 69)

### Codex — temporary disable for Sierpinski layers and pendulum motion

- Added explicit Info-banner feature flags in `TorusBanner`:
  - `ENABLE_SIERPINSKI_LAYERS = false`
  - `ENABLE_PENDULUM_MOVEMENT = false`
- Applied flags without removing implementation:
  - Sierpinski far/mid/near parallax layer nodes are conditionally skipped when disabled.
  - Parallax base layer animation uses `animation-name: none` when pendulum is disabled.
- Result: background fractal layers and pendulum movement are both off, while code remains intact for fast rollback.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 68)

### Codex — header color + theme icon hover + torus granularity/height tuning

- Increased menu-bar saturation/contrast in `AdminHeader`:
  - header and key controls now use richer amber HSL values for stronger visual presence.
- Increased `RAGBAZ` wordmark intensity:
  - logo cyan updated to a brighter/saturated value (`#00ecff`).
- Updated sun/moon hover behavior to affect outline only:
  - icon fill stays fixed yellow,
  - hover now expands/darkens the icon outline via generated text-shadow radius (`1px -> 3px`).
- Set Info torus to requested granularity and height:
  - `TORUS_MAJOR_SEGMENTS=24`, `TORUS_MINOR_SEGMENTS=24`,
  - canvas/banner fixed to `20vh` (`h-[20vh]`, `max-h-[20vh]`), fallback draw height raised to `80`.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 67)

### Codex — torus z-buffer pass (no backface culling)

- Replaced the old depth-sorted face painter pass in `TorusBanner` with a software z-buffer pipeline:
  - per-frame `Float32Array` depth buffer (initialized to `-Infinity`),
  - per-frame RGBA color buffer + `ImageData`,
  - depth-tested triangle rasterizer using barycentric interpolation.
- Added depth-tested cyan edge rendering so wire edges respect occlusion:
  - line raster pass writes through the same z-test as fill triangles.
- Removed backface culling from the torus draw path:
  - both front/back faces are rasterized,
  - visibility is now resolved strictly by z-buffer depth compare.
- Kept existing torus style (orange fill + cyan edges) and current reduced canvas footprint.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 66)

### Codex — smaller canvas + deeper Sierpinski recursion

- Reduced Info canvas height to half again:
  - draw fallback height `130 -> 65`,
  - panel/canvas min-height classes `10/11/12rem -> 5/5.5/6rem`.
- Increased Sierpinski recursion across parallax layers:
  - far depth `2-3 -> 3-4`,
  - mid depth `3 -> 4-5`,
  - near depth `3-4 -> 4-6`.
- Also removed an unused torus renderer constant from the interrupted z-buffer draft (`TORUS_RASTER_SCALE`) to keep the file clean.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 65)

### Codex — sun/moon hover/focus visual cleanup

- Updated the theme-toggle button in `AdminHeader` so hover only affects icon foreground color:
  - removed any potential hover/active background treatment via explicit `bg-transparent hover:bg-transparent active:bg-transparent`.
- Removed active/focus frame visuals for both sun and moon states:
  - disabled focus ring and visible outline (`focus:ring-0`, `focus-visible:ring-0`, `focus:outline-none`, `focus-visible:outline-none`),
  - removed border/shadow framing (`border-0`, `shadow-none`, `rounded-none`, `appearance-none`).
- Result: no dark hover background and no active frame, while preserving icon color hover swap.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 64)

### Codex — torus renderer restored + Sierpinski forest background

- Geometry renderer in `TorusBanner` switched back to a torus with requested modern pipeline:
  - granularity set around 64 (`TORUS_MAJOR_SEGMENTS=64`, `TORUS_MINOR_SEGMENTS=64`),
  - depth-sorted **quads** (not triangle strips for output),
  - explicit backface culling using view-space normal vs camera-vector dot product,
  - filled quads with edge stroking preserved.
- Canvas vertical size reduced to approximately half previous height:
  - fallback draw height `260 -> 130`,
  - UI height classes `20/22/24rem -> 10/11/12rem`.
- Background switched from foliage to sharp-contrast Sierpinski fractal trees:
  - removed L-system foliage generator,
  - added recursive Sierpinski triangle generator and per-layer forest SVG builder,
  - layered parallax tree groups with contrasting palettes (cyan/magenta/yellow/lime, neon green/purple/orange/blue, etc.).
- Kept side feather masks and wide overscan to avoid hard horizontal edges during pendulum movement.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 63)

### Codex — foliage density down, artifacts wider, canopy lower

- Re-tuned `TorusBanner` foliage generation to match requested profile:
  - density reduced via lower `plantCount` and fewer `iterations` on mid/near layers,
  - vertical growth reduced via lower `stepBase` and `leafSizeBase`,
  - artifact width increased via larger `branchWidth`, `leafWidth`, `branchOutlineWidth`, `leafOutlineWidth`.
- Updated layer placement downward to reduce perceived canopy height:
  - far `top: 0% -> 16%`
  - mid `top: 8% -> 24%`
  - near `top: 16% -> 32%`
- Net effect: fewer plants, thicker linework, and shorter foliage stack.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 62)

### Codex — removed scrolling text, coarser spherical volume, new polynomial

- Removed Info-banner scrolling text output completely:
  - deleted right-panel sine-scroller markup path,
  - deleted bottom ticker markup and related animation styles.
- Reduced spherical volume mesh granularity for a coarser render:
  - `LONGITUDE_SEGMENTS: 128 -> 64`
  - `LATITUDE_SEGMENTS: 72 -> 36`
- Replaced the previous trigonometric harmonic mix with a new polynomial basis in `sphericalPolynomialRadius(theta, phi)`:
  - uses directional components (`x,y,z`) and polynomial terms (`p2`, `p22`, `p31`, `p4`) for radial deformation.
- Simplified layout to a single full-width canvas region (no text column).
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 61)

### Codex — higher foliage + seamless horizontal fog edges

- Increased foliage vertical reach further in `TorusBanner`:
  - raised growth parameters (`stepBase`, `leafSizeBase`) for far/mid/near generated L-system layers,
  - moved bush layers upward again (`top`: far `0%`, mid `8%`, near `16%`).
- Hardened side-edge blending to remove sharp horizontal artifacts:
  - expanded bush-layer horizontal overscan (`left/right: -20%`),
  - enlarged foliage texture scale (`170%/180%/190%`),
  - switched foliage texture repetition to non-tiling (`no-repeat`) to avoid seam repetition,
  - added left/right feather masks (`mask-image` + `-webkit-mask-image`) on each bush layer for smooth side fade under all pendulum offsets.
- Also widened generic layer inset (`-18%`) to better cover swing extremes.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 60)

### Codex — trefoil removed, spherical harmonics volume added

- Removed the trefoil-knot active geometry path from `TorusBanner` and switched rendering to a spherical-harmonics volume surface.
- Added harmonic radial field model:
  - mesh resolution: `LONGITUDE_SEGMENTS=128`, `LATITUDE_SEGMENTS=72`
  - radius basis: `SH_BASE_RADIUS=112`
  - harmonic mix from multiple angular modes (`sin/cos` terms over `theta` and `phi`) for an organic volumetric form.
- Updated render loops for spherical topology:
  - longitude wraps, latitude strips are non-wrapping (`j -> j+1`) to avoid polar seam artifacts.
- Kept depth-sorted triangle shading + cyan edge treatment and updated depth range normalization (`SH_DEPTH_RANGE=340`).
- This fully replaces the previous trefoil visualization in the Info canvas while preserving existing parallax/ticker behavior.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 59)

### Codex — foliage canopy height increase (~2x)

- Increased generated foliage growth amplitude in `TorusBanner`:
  - far layer: `stepBase 6.4 -> 11.8`, `leafSizeBase 2.9 -> 4.2`
  - mid layer: `stepBase 7.2 -> 13.0`, `leafSizeBase 3.5 -> 4.8`
  - near layer: `stepBase 7.8 -> 14.2`, `leafSizeBase 3.9 -> 5.3`
- Raised bush parallax layer placement to reach higher into the scene:
  - far `top: 42% -> 20%`
  - mid `top: 50% -> 26%`
  - near `top: 58% -> 34%`
- Outcome: foliage now occupies substantially more vertical space (roughly double perceived canopy height) while preserving parallax motion behavior.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 58)

### Codex — bottom ticker restyle (smaller, yellow, faster)

- Updated `TorusBanner` non-sine text presentation:
  - removed the static right-panel text block when `ENABLE_SINE_SCROLLER` is false,
  - added a dedicated bottom ticker shell spanning the banner width.
- Implemented compact/faster ticker styling:
  - smaller font (`clamp(0.62rem, 1.2vw, 0.9rem)`),
  - bright yellow text (`#ffe100`),
  - faster horizontal motion (`torus-bottom-scroll` in `11s` linear loop).
- Kept sine-scroller code path fully intact behind the existing flag.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 57)

### Codex — thicker/smoother trefoil with improved self-sticking handling

- Reworked trefoil mesh density and thickness in `TorusBanner`:
  - `CURVE_SEGMENTS: 72 -> 120`
  - `RING_SEGMENTS: 24 -> 30`
  - `TREFOIL_TUBE_RADIUS: 10 -> 14` (visibly thicker rope)
  - trefoil scale slightly increased (`XY/Y/Z`: `42/36/66` -> `44/38/70`) to preserve curvature feel.
- Improved crossing/render stability by replacing coarse quad painter pass with depth-sorted triangle rendering:
  - each tube quad is split into two triangles,
  - per-triangle lambert-like shading from transformed face normals + depth component,
  - subtle cyan edge treatment retained but reduced to avoid hard sticking artifacts.
- Added a depth-sorted centerline cyan highlight pass so rope layering reads cleaner at overlaps.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 56)

### Codex — leafy parallax clarity pass (less fog + black outlines)

- Updated L-system foliage SVG generation in `TorusBanner` to add dark structural outlines:
  - introduced outline pass for both branch and leaf paths (rendered before color strokes),
  - added per-layer outline config (`outlineColor`, `branchOutlineWidth`, `leafOutlineWidth`, `outlineOpacity`).
- Increased foliage legibility by raising branch/leaf stroke opacity across far/mid/near generated layers.
- Reduced foggy appearance by retuning bush-layer CSS blending:
  - increased layer alpha (`far 0.90`, `mid 0.96`, `near 1.0`),
  - reduced translucent haze in gradient overlays so line structures remain crisp.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 55)

### Codex — trefoil smoothness + crossing cleanup pass

- Refined trefoil mesh generation in `TorusBanner` for smoother continuity along the knot:
  - split mesh density into separate axes (`CURVE_SEGMENTS = 72`, `RING_SEGMENTS = 24`) to increase longitudinal smoothness without over-thickening the tube ring.
- Reduced self-contact artifacts at crossings by changing trefoil proportions:
  - `TREFOIL_TUBE_RADIUS: 18 -> 10`,
  - knot scales increased modestly (`XY 36->42`, `Y 31->36`, `Z 58->66`) so strands separate better visually.
- Updated depth-shading normalization range for the new bounds (`GEOMETRY_DEPTH_RANGE: 220 -> 260`) to keep color falloff stable.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 54)

### Codex — leafy bush parallax switched to line-drawn L-system layers

- Replaced radial-gradient bush blobs in `TorusBanner` with procedural line-drawn foliage layers built from a Lindenmayer-style branch grammar (`F -> FF-[-F+F+F]+[+F-F-F]`).
- Added deterministic procedural generation helpers:
  - seeded PRNG (`mulberry32`),
  - L-system expansion,
  - turtle tracing into SVG branch/leaf path segments,
  - layer export as inline SVG data URIs.
- Built three separate leaf layers (far/mid/near) with different densities and stroke weights, then applied them to parallax layers via CSS custom property (`--leafy-bush-layer`) and layered gradient tinting.
- Kept existing slow pendulum layer motion/duration differences so depth scrolling behavior is preserved.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 53)

### Codex — trefoil knot renderer (torus temporarily disabled)

- Updated `TorusBanner` canvas geometry to support two mesh paths behind a toggle:
  - existing torus mesh preserved as `torusBasePoints`,
  - new trefoil-knot tube mesh added as `trefoilBasePoints`.
- Enabled trefoil mode by default via:
  - `const ENABLE_TREFOIL_KNOT = true;`
  - active mesh selects `trefoilBasePoints` with unchanged granularity (`SEGMENTS = 24`, tube/ring mesh = `24x24`).
- Preserved visual identity from torus renderer:
  - same fill palette (`BASE_COLOR` orange family),
  - same cyan edge wire (`EDGE_COLOR`),
  - same face sorting/shading pipeline with depth range tuned for trefoil bounds.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 52)

### Codex — sine scroller temporarily disabled (code retained)

- Added a local toggle in `TorusBanner`:
  - `const ENABLE_SINE_SCROLLER = false;`
- Wrapped the animated scroller markup in this feature gate so the full sine/scroll implementation remains in code and can be re-enabled instantly by flipping the flag.
- Added a non-animated fallback text line (`torus-scroller-muted`) while disabled to avoid an empty right panel.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 51)

### Codex — torus parallax environment (4 layers, pendulum motion)

- Added a four-layer parallax background scene inside `TorusBanner`:
  - far sky layer with a red sunset horizon glow,
  - distant green bushes,
  - mid-depth leafy bushes,
  - near dense leafy bushes.
- Implemented slow pendulum-style back-and-forth motion (`pendulum-sway`) with staggered durations and directions per layer for depth.
- Switched torus canvas clearing to transparent rendering (`clearRect`) so the animated environment is visible behind the torus geometry.
- Kept torus/scroller content above scene (`z-index`) and added light text shadow for scroller readability against the richer background.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 50)

### Codex — torus area expansion + frame removal hardening

- Refactored `TorusBanner` layout to expand left and vertical footprint:
  - full-bleed horizontal alignment to the left using negative section margins (`-mx-3 sm:-mx-4 lg:-mx-6`),
  - increased minimum heights to `20rem/22rem/24rem` across breakpoints for both torus and scroller zones,
  - switched grid alignment to `items-stretch` and removed inner spacing/gaps to maximize canvas area.
- Removed residual black-frame artifacts by eliminating rounded frame shells and force-disabling panel chrome:
  - removed `rounded-*` wrappers around the torus canvas area,
  - added `.torus-panel-shell` style with `border: 0`, `border-radius: 0`, `box-shadow: none`, and transparent canvas background.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 49)

### Codex — theme icon saturation pass (sun/moon)

- Updated `AdminHeader` theme-toggle glyph color to fully saturated yellow (`#ffff00`) for both sun/moon states.
- Kept explicit black hover color (`hover:text-black`) to provide a clear contrast flip on pointer hover.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 35)

### Codex — logo alignment and theme-icon visibility tweak

- Shifted the `ARTICULATE STOREFRONT` subtitle in `AdminHeader` an additional `0.5rem` to the right (from `0.5rem` to `1rem`) to reduce lockup crowding.
- Lowered wordmark saturation/brightness by setting `RagbazLogo` color to a calmer blue (`#2f9cc8`) in the header.
- Increased theme toggle icon size for both sun/moon states via larger icon font sizing to improve visibility while preserving the no-background/no-circle style.

## 2026-03-19 (cont. 36)

### Codex — header palette correction (brand vs bar)

- Reversed the prior logo dimming: increased `RAGBAZ` wordmark cyan intensity to `#3ecbff` for a clearer, brighter brand tone.
- Lowered menu bar/background saturation + brightness instead:
  - header bg from `hsl(33 48% 44%)` to `hsl(33 34% 37%)`
  - header border from `hsl(33 42% 33%)` to `hsl(33 30% 29%)`
  - hamburger surface/hover adjusted to matching lower-chroma/darker tones.

## 2026-03-19 (cont. 37)

### Codex — subtitle contrast preference update

- Changed the `ARTICULATE STOREFRONT` subtitle text in the admin header lockup from white to black to match the requested contrast style on the amber bar.

## 2026-03-19 (cont. 38)

### Codex — hamburger hotkey hint contrast tweak

- Changed the `Ctrl+Alt+M` hint text under the hamburger icon from a light cream tone to black to align with the updated header text contrast preference.

## 2026-03-19 (cont. 39)

### Codex — theme icon edge outline

- Added a black edge-outline treatment to the sun/moon theme icon glyphs in `AdminHeader` via multi-direction text-shadow so the symbols keep crisp separation against the textured amber header.

## 2026-03-19 (cont. 40)

### Codex — status control visual parity + health link confirmation

- Updated the header `Status` control to use the same amber-dark button surface as the hamburger control (matching background, border, hover, and focus-ring treatment).
- Confirmed `Status` still routes directly to the Health check tab via `switchTab("health")`, and added an explicit accessibility label using the existing `admin.healthCheck` text key.

## 2026-03-19 (cont. 41)

### Codex — header/icon and products i18n cleanup

- Updated `AdminHeader` logo lockup:
  - shifted `ARTICULATE STOREFRONT` subtitle from `1rem` to `1.5rem` left offset (additional `+0.5rem` right move),
  - softened theme icon edge outline from black to dark gray (`#2f2f2f`) for sun/moon glyphs.
- Fixed non-translated Products empty-state copy:
  - replaced hardcoded `"Select an item to configure access"` with `t("admin.selectItemToConfigureAccess")`,
  - added the new key in all locales:
    - EN: `Select an item to configure access`
    - SV: `Välj ett objekt för att konfigurera åtkomst`
    - ES: `Selecciona un elemento para configurar el acceso`
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 42)

### Codex — product image uploader clickable/frame + backend wiring

- Hardened product image picker affordance in `AdminProductsTab`:
  - stronger persistent frame, explicit bottom upload label, improved placeholder contrast, and visible focus ring for keyboard users.
  - applied in both shop-product edit and WP-content access detail cards.
- Fixed backend mismatch for image uploads:
  - added `uploadBackend` prop flow from `AdminProductsTab` to `ImagePickerButton` to `ImageUploader`,
  - `ImageUploader` now posts to `/api/admin/upload?kind=image&backend=<selected>` when backend is selected.
- Outcome: image uploads now follow the active storage target (WordPress/R2/S3) and the clickable image area is always visually obvious.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 43)

### Codex — subtitle micro-alignment tweak

- Shifted `ARTICULATE STOREFRONT` back by `0.25rem` in `AdminHeader` (`marginLeft: 1.5rem -> 1.25rem`) to refine visual balance under `RAGBAZ`.

## 2026-03-19 (cont. 44)

### Codex — measured subtitle alignment against RAGBAZ edges

- Reworked `AdminHeader` logo lockup so subtitle alignment is no longer static-offset-only:
  - wrapped `RAGBAZ` wordmark and subtitle with refs,
  - added width-measure effect on mount/resize/locale change,
  - computes `subtitleScaleX` from `RAGBAZ` width ÷ subtitle base width and applies bounded `scaleX` transform.
- Kept subtitle left edge aligned with `RAGBAZ` left offset (`1.5rem`) and made subtitle base text slightly larger (`9.5px`) for a closer edge-to-edge fit.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 45)

### Codex — Style tab localization + dynamic site preview background

- Finished the postponed Style-tab work in `AdminDashboard`:
  - replaced hardcoded section copy/labels/buttons with i18n keys across the full tab,
  - updated site section heading to child-theme wording (`styleSiteTitle`; SV: `Stilguide, barntema`),
  - clarified admin section heading as admin-only (`styleTitle` now explicitly says admin UI only).
- Made site-style color and font preview dynamic against live theme tokens:
  - reads CSS vars (`--color-background`, `--color-foreground`, `--color-primary`, etc.),
  - uses the actual site background/foreground in heading/body font cards with explicit extra padding.
- Added/translated all required keys in EN/SV/ES (`styleSite*`, site/admin color labels, font labels/samples/tokens, button/badge labels).
- Verification: JSON parse checks for all locales pass; `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 46)

### Codex — Info torus layout + sine scroller redesign

- Reworked `TorusBanner` structure for the Info tab:
  - moved torus canvas to a dedicated left column,
  - removed logo, Info label, descriptive paragraph, and the former dark gradient overlays/panels,
  - expanded vertical torus area (`h-64` / `sm:h-72`) and removed extra dark-area chrome outside the torus panel.
- Updated torus geometry to narrow the center hole:
  - `MAJOR_RADIUS: 110 -> 104`
  - `MINOR_RADIUS: 36 -> 44`
- Added right-side sine scroller animation with exact requested text:
  - `RAGBAZ - standing on the shoulders of giants and bending spoons since 1987`
  - implemented as a repeated scrolling track plus per-character wave animation in component-scoped CSS keyframes.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 47)

### Codex — very-yellow theme glyphs

- Updated the theme-toggle icon color in `AdminHeader` to a strong yellow (`#ffd100`) with lighter yellow hover (`#fff27a`) for both sun and moon glyph states.
- Kept the existing dark-gray icon edge-outline (`textShadow`) unchanged for legibility on the textured amber bar.
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 48)

### Codex — torus frame removal + gruvbox scroller color

- Removed frame visuals around the torus area in `TorusBanner`:
  - dropped outer border container,
  - dropped inner torus panel border/inset shadow.
- Added theme-aware scroller color variable usage:
  - `TorusBanner` scroller text now uses `var(--admin-torus-scroller-color, #111827)`,
  - defined `--admin-torus-scroller-color` in `globals.css`:
    - default admin layout: dark text (`#111827`)
    - gruvbox: white (`#ffffff`)
- Verification: `npm run lint` passes (existing non-blocking `@next/next/no-img-element` warnings only).

## 2026-03-19 (cont. 17)

### Codex — admin header + welcome tone refinements

- Retuned admin header palette from saturated orange to a slightly yellower, lower-saturation amber using explicit HSL values in `AdminHeader`.
- Fixed brand lockup alignment by setting `ARTICULATE STOREFRONT` subtitle offset to `2em` under `RAGBAZ` and removing conflicting left-shift on the wordmark.
- Shifted Welcome story shell from vivid indigo/blue to muted steel gray-blue gradient for a calmer look with preserved white contrast text.
- Added a subtle concrete-like microtexture to the menu bar via new `admin-header-concrete` class in `globals.css` (layered radial/repeating gradients, soft-light blend, non-interactive overlay).

## 2026-03-19 (cont. 18)

### Codex — theme icon consistency tweak

- Restored the previous moon glyph (`🌙`) for the light-mode state in the theme toggle.
- Kept the current styling constraints intact: no circular frame/background and no separate icon chip treatment.

## 2026-03-19 (cont. 19)

### Codex — control-room cards parity + compact layout

- Updated `WelcomeCards` to cover all admin menu destinations, including Docs:
  - `welcome`, `sales`, `stats`, `storage`, `products`, `chat`, `health`, `style`, `info`, `support`, and `/admin/docs`.
- Switched card layout to a denser row-first responsive grid (`2xl` fits in a single row) and reduced card text size/spacing for better compactness.
- Added new card body i18n keys in EN/SV/ES:
  - `admin.cardWelcomeBody`
  - `admin.cardHealthBody`
  - `admin.cardStyleBody`
  - `admin.cardInfoBody`
  - `admin.cardDocsBody`
- Refined header brand lockup by shifting the subtitle left to `0.5rem` offset for cleaner alignment under `RAGBAZ`.
- Kept theme toggle moon glyph as `🌙` (no circle/background styling).

## 2026-03-19 (cont. 20)

### Codex — stronger concrete texture (Perlin-style)

- Reworked `.admin-header-concrete` texture in `src/app/globals.css` from dot/radial grain to dual SVG turbulence layers:
  - `::before`: coarse fractal noise (`feTurbulence`, baseFrequency `0.52`, 4 octaves)
  - `::after`: fine fractal noise (`feTurbulence`, baseFrequency `1.25`, 2 octaves)
- Increased grain visibility with tuned blend and post-filters:
  - overlay + soft-light composition,
  - higher contrast and slightly darker brightness for a rough concrete feel.

## 2026-03-19 (cont. 21)

### Codex — outlined RAGBAZ wordmark

- Extended `RagbazLogo` with optional outline props:
  - `outlineColor`
  - `outlineWidth`
- Applied outline rendering on the `RAGBAZ` text using `WebkitTextStroke` + fallback `text-shadow`.
- Enabled a black 1px outline in `AdminHeader` for the menu-bar `RAGBAZ` wordmark while leaving the rest of the header typography unchanged.

## 2026-03-19 (cont. 22)

### Codex — status tooltip layering/clipping fix

- Fixed admin header status tooltip being partially hidden under page content:
  - changed header container to `overflow-visible` (was `overflow-hidden`),
  - increased tooltip layer to `z-[80]`.
- This keeps the tooltip fully visible below the sticky menu bar while preserving header texture overlays.

## 2026-03-19 (cont. 23)

### Codex — products list/detail readability pass

- Updated both product-related split panes in `AdminProductsTab` to use wider list columns:
  - `lg:grid-cols-[340px_minmax(0,1fr)]` (was `280px` / `300px`).
- Inverted selected-row visuals in both left lists for clearer focus:
  - selected rows now use dark background + light text (`bg-slate-900 text-white`).
  - tuned subtext/badges/status dot colors for selected-state contrast.
- Ensured full selected title is visible in right detail panes:
  - removed truncate-only heading behavior for selected WP/shop titles,
  - added wrapped full-title line (`break-words` / `break-all`) in the right panel headers.

## 2026-03-19 (cont. 24)

### Codex — image crop save robustness + edge upload compatibility

- `ImageUploader` save flow now closes and resets the crop dialog immediately after successful upload response and before invoking parent `onUploaded`, preventing modal-stuck behavior when downstream handlers throw or stall.
- Refactored `src/lib/s3upload.js` AWS SDK usage to lazy dynamic imports (`loadAwsSdk`) and async Node-only client initialization:
  - removed static top-level `@aws-sdk/*` imports,
  - updated Node-path functions to `await` SDK command classes at runtime.
- Goal: avoid edge bundle/runtime pulling Node-only transitive modules (including `fs`) when handling admin image uploads on Cloudflare edge.

## 2026-03-19 (cont. 25)

### Codex — products pane polish (title duplication + empty-image framing)

- Removed duplicate selected-title lines in `AdminProductsTab` detail panes:
  - kept wrapped title display,
  - removed secondary repeated full-title text rows that made names appear twice (e.g. “Kurs: AI i praktiken”).
- Added explicit dark-gray frames for empty image states:
  - strengthened main `ImagePickerButton` border (`border-2 border-gray-700`),
  - added gray border rings to empty thumbnail placeholders in list/detail mini-cards.

## 2026-03-19 (cont. 26)

### Codex — product image picker interaction hardening

- Reworked `ImageUploader` file-open strategy from ad-hoc `document.createElement("input")` to a persistent hidden `<input type="file">` with `ref`, improving reliability across browsers and preserving direct user-gesture semantics.
- Updated product image overlay in `AdminProductsTab`:
  - overlay layer is now `pointer-events-none` so it cannot block click/tap,
  - added an always-visible pen badge in the top-right corner to signal replace action,
  - retained hover darkening + center pen affordance for desktop.

## 2026-03-19 (cont. 27)

### Codex — localized inner Products tabs

- Replaced hardcoded inner tab labels in `AdminProductsTab` with i18n keys:
  - `admin.productsTabAll`
  - `admin.productsTabDigital`
  - `admin.visibleTypesTab`
- Added EN/SV/ES translations:
  - EN: `All products`, `Digital products`, `Visible types`
  - SV: `Alla produkter`, `Digitala produkter`, `Synliga typer`
  - ES: `Todos los productos`, `Productos digitales`, `Tipos visibles`

## 2026-03-19 (cont. 28)

### Codex — finer concrete texture + selective logo offset

- Increased menu-bar concrete texture detail by retuning `.admin-header-concrete` turbulence layers in `globals.css`:
  - higher base frequencies and octaves for finer grain,
  - smaller background tiling for denser texture,
  - contrast/brightness rebalance to keep roughness visible but controlled.
- Shifted only the `RAGBAZ` wordmark to the right by `1.5rem` (`ml-6`) in `AdminHeader`.
- Left `ARTICULATE STOREFRONT` positioning unchanged, as requested.

## 2026-03-19 (cont. 29)

### Codex — image picker robustness follow-up

- Improved browser compatibility for opening the image file chooser in `ImageUploader`:
  - use `input.showPicker()` when available,
  - fallback to `input.click()`,
  - switched hidden file input to off-screen positioning (instead of `display:none`) to avoid picker restrictions in stricter environments.
- Reinforced visual affordances on product image tiles in `AdminProductsTab`:
  - added explicit full-tile ring overlay (`ring-2 ring-gray-700/95`) so the frame remains visible,
  - kept pen badge always visible and above content (`z` layering + white border).

## 2026-03-19 (cont. 30)

### Codex — dark-theme heading contrast fix

- Fixed low-contrast admin titles in gruvbox/dark theme by updating `src/app/globals.css`:
  - force heading elements (`.admin-gruvbox h1..h6`) to white,
  - force Tailwind slate heading utilities (`.text-slate-900`, `.text-slate-800`) to white,
  - keep secondary slate text (`.text-slate-700`, `.text-slate-600`) at lighter foreground tone for hierarchy.

## 2026-03-19 (cont. 31)

### Codex — wording update for digital tab

- Updated inner tab label wording to the more standard “Digital downloads” terminology:
  - EN: `Digital downloads`
  - SV: `Digitala nedladdningar`
  - ES: `Descargas digitales`
- Applied via `admin.productsTabDigital` translations in `en.json`, `sv.json`, and `es.json`.

## 2026-03-19 (cont. 32)

### Codex — Products empty-state color tweak in dark mode

- Updated the “Select an item to configure access” hint in `AdminProductsTab` to use a dedicated class (`admin-soft-yellow`).
- Added gruvbox override in `globals.css`:
  - `.admin-gruvbox .admin-soft-yellow { color: #f5e7b8 !important; }`
- Result: soft-yellow hint on dark theme (better contrast), neutral gray retained in light theme.

## 2026-03-19 (cont. 33)

### Codex — VAT/Moms panel contrast and surface cleanup

- Eliminated white-looking VAT surfaces in gruvbox by adding dedicated dark-theme classes:
  - `admin-vat-panel` for the container background/border
  - `admin-vat-surface` for chips and row cards
- Updated VAT heading/hint emphasis per request:
  - `Moms per kategori` uses `admin-product-title` (white/bold in dark theme),
  - VAT hint text uses `admin-soft-yellow` (soft yellow in dark theme).

## 2026-03-19 (cont. 34)

### Codex — free-access checkbox + user-facing copy simplification

- Added a dedicated free-access toggle in `PriceAccessForm`:
  - checkbox label uses i18n key `admin.freeAccess` (`Fri åtkomst` / `Free access` / `Acceso gratuito`),
  - checking it sets price to `"0"` and disables the price input,
  - unchecking clears price and re-enables manual entry.
- Simplified user-facing price helper copy (removed backend/KV detail):
  - `admin.priceSavedLocally` now plain “saved” phrasing in EN/SV/ES.
- Updated fee-hint wording to match the new checkbox flow:
  - removed “set to 0” instruction from EN/SV since free access is now explicit in UI.

## 2026-03-19 (cont. 11)

### Codex — P0/P1 completion pass + verification

- **WordPress plugin VAT schema parity** (`packages/ragbaz-articulate-plugin/Ragbaz-Articulate.php`):
  - Added `vatPercent` to `CourseAccessRule` GraphQL object fields.
  - Added `vatPercent` to `SetCourseAccessRuleInput`.
  - Added `vatPercent` to `setCourseAccessRule` mutation input fields and threaded it into `ragbaz_set_rule(...)` so plugin-side persistence now matches storefront/admin VAT flows.
- **Course access cleanup** (`src/lib/courseAccess.js`):
  - Removed unused legacy helper (`getWordPressCourseAccessConfigLegacy`) to keep VAT/active fallback logic consolidated in the primary query/mutation paths.
- **Verification pass**:
  - `npm run lint` passes with only existing non-blocking `@next/next/no-img-element` warnings in admin image components.
  - `npm test` passes all 15 suites.

## 2026-03-19 (cont. 12)

### Codex — P2 implementation (live welcome image state + dead-link finder)

- **Welcome image slide realism**:
  - Added shared snapshot storage helper (`src/lib/adminImageGenerationState.js`) and tests.
  - Image generation panel now persists latest run metadata (prompt, size, count, status, generated count, request id) and emits `admin:imageSnapshotUpdated`.
  - Welcome story image slide now shows live quota from `/api/admin/generate-image`, latest run snapshot, and a clear read-only fallback message when API state is unavailable.
- **Dead-link finder**:
  - Added link extraction/classification helpers (`src/lib/deadLinks.js`) with tests.
  - Added `/api/admin/dead-links` scanner route:
    - indexes anchor links from posts/pages/events/courses/products,
    - classifies links as internal / pseudo-external (tenant root domain) / external (+ invalid/unsupported),
    - runs bounded reachability checks with timeout and concurrency control.
  - Added dead-link panel to Support tab with:
    - totals, filters, rescan action,
    - status badges (reachable/broken/unchecked/skipped),
    - pseudo-external translation path hints and source references.
- **i18n sync**:
  - Added EN/SV/ES keys for new welcome live-state text and dead-link panel UI.

## 2026-03-19 (cont. 13)

### Codex — documentation refresh with GUI visuals

- **User-facing docs updated**:
  - Refreshed `README.md` admin operations section to reflect current tabs (`Welcome, Sales, Stats, Storage, Products, Support, Chat, Health, Style, Info`), added a recommended operator sequence, and removed outdated “Advanced” references.
  - Updated technical references:
    - `docs/README.en.md`
    - `docs/README.sv.md`
  - Synced wording with current plugin/runtime reality (Next.js 16 references, plugin install flow, Products tab naming).
- **Visual documentation assets added**:
  - `public/docs/admin/welcome-control-room.svg`
  - `public/docs/admin/products-storage.svg`
  - `public/docs/admin/support-chat.svg`
  - Embedded these visuals directly next to relevant admin workflow sections in README/docs.

## 2026-03-19 (cont. 14)

### Codex — welcome contrast + localized headline tuning

- Improved Welcome story contrast on dark blue backgrounds by restyling the `Ctrl+Alt+M` hint chip for dark mode in `AdminWelcomeTab`.
- Updated `admin.welcomeHeadline` copy to save vertical space and then localized the suffix for non-English locales:
  - EN: `Control Panel`
  - SV: `Kontrollpanel`
  - ES: `Panel de control`

## 2026-03-19 (cont. 15)

### Codex — welcome slide density + hotkey placement polish

- Removed the large story-mode welcome headline to reclaim vertical space for slides.
- Moved the `Ctrl+Alt+M` hotkey hint inline next to the `RAGBAZ Articulate StoreFront` label in both welcome states.
- Tightened top spacing/padding in story mode and adjusted dark-theme chip/keycap colors to maintain high contrast on the blue background (no black text on dark blue).

## 2026-03-19 (cont. 16)

### Codex — fix for Workers AI context loader runtime error

- Resolved runtime noise/failure around `/api/admin/generate-image` where Worker logs showed:
  - `TypeError: Cannot read properties of undefined (reading 'default')`
- Root cause: static top-level import of `@opennextjs/cloudflare` in `src/lib/ai.js` could fail under runtime/module interop scenarios, even when route paths did not need image generation yet.
- Fix implemented:
  - Removed static import.
  - Added guarded lazy loader (`getWorkersAiBinding`) using dynamic `import("@opennextjs/cloudflare")`.
  - Added export-shape fallbacks (`module.getCloudflareContext`, `module.default`, `module.default.getCloudflareContext`).
  - If loader is unavailable, logs a single warning and safely falls back to REST-based Workers AI calls.
- Verification:
  - Targeted lint on `src/lib/ai.js` passes.
  - Tests pass (17/17).

## 2026-03-19 (cont. 10)

### Codex — category extraction + VAT map + digital file heuristics

- Added shared category helpers in `src/lib/contentCategories.js`:
  - GraphQL category extraction from `edges`/`nodes`
  - Category slug normalization
  - Digital-file heuristics from file extension + MIME type (e.g. PDF/document, MP3/audio, MP4/video, ZIP/archive)
- Wired category extraction into WordPress sources:
  - `/api/admin/course-access` now attaches `categories` + `categorySlugs` for WooCommerce, LearnPress, and Events.
  - Uses schema field introspection to include optional fields (`lpCourseCategory`, `eventCategories`) only when present, avoiding hard failures on installs lacking those fields.
  - `src/lib/shopProducts.js` now enriches unified storefront items with categories/categorySlugs from all source types.
- Digital product flow now carries MIME/category metadata:
  - `src/lib/digitalProducts.js` persists `mimeType`, computes category heuristics, and stores category slugs.
  - `/api/digital/products` now exposes `mimeType`, `categories`, and `categorySlugs`.
  - `/api/admin/upload` now returns `mimeType`; admin upload handler saves it on products.
- Implemented VAT/Moms-by-category editor in Products → Access detail panel:
  - Extracted categories are shown on selected item cards.
  - Added editable category→VAT% list with add/remove rows and one-click save.
  - Backed by shop settings (`vatByCategory`) with KV persistence and validation in `src/lib/shopSettings.js`.
  - Added new EN/SV/ES i18n keys and save/error messaging.
- Added tests: `tests/contentCategories.test.js` (category extraction, slug normalization, digital heuristic categorization).

## 2026-03-19

### Mistral — chat history + copy buttons (code review by Claude)

**What landed well:**

- Copy buttons on assistant messages (`ChatMessage.js`) — good UX, clean hover reveal with `group-hover:opacity-100`, i18n done correctly across all three language files with sensible keys (`chat.copyRaw`, `chat.copyMarkdown`, `chat.copyRawShort`, `chat.copyMarkdownShort`).
- The idea of `saveChatHistory`/`getChatHistory` in `cloudflareKv.js` is correct — KV is the right place for this.

**Bugs introduced — all fixed by Claude before push:**

**1. `cloudflareKv.js` — complete rewrite broke 20+ callers (critical)**

You replaced the existing REST API implementation with a `KV` Worker binding global:

```js
const isCloudflare = typeof caches !== "undefined" && typeof KV !== "undefined";
await KV.put(key, JSON.stringify(value));
```

This is wrong for two reasons:

- `KV` is a Cloudflare Worker _binding_, not a global. It only exists when the runtime is a deployed Worker with the binding configured in `wrangler.toml`. It does not exist during local dev (`npm run dev`) or in the Node.js build process.
- You removed four exports — `isCloudflareKvConfigured`, `readCloudflareKvJson`, `writeCloudflareKvJson`, `deleteCloudflareKv` — that are used by `courseAccess.js`, `supportTickets.js`, `digitalProducts.js`, `userStore.js`, and several API routes. The build failed with 48 errors.

**Rule to apply going forward:** Before modifying `cloudflareKv.js`, read how it is imported elsewhere (`grep -r "from.*cloudflareKv"`) and never remove exported symbols. This project uses the Cloudflare REST API (not Worker bindings) so that KV works identically in local dev and production. See `AGENTS.md` "KV storage" section.

**2. `route.js` — `requireAdmin` return value misread (critical)**

```js
// Wrong — requireAdmin returns { session } or { error }, never { adminUserId }
const { adminUserId } = await requireAdmin(request);
getChatHistory(adminUserId); // → getChatHistory(undefined)
```

This silently wrote all chat history to KV key `chat_history:undefined`. Always read a function's return contract before destructuring. `requireAdmin` is defined in `src/lib/adminRoute.js` — two lines to check.

Also: you called `requireAdmin` at the top without checking for the error response. If the user is not authenticated the request would fall through instead of returning 401. The guard pattern in this codebase is:

```js
const auth = await requireAdmin(request);
if (auth?.error) return auth.error;
```

**3. `ChatPanel.js` — duplicate `const` declaration (compile error)**

`const bottomRef = useRef(null)` appeared on both line 8 and line 29. JavaScript does not allow re-declaring a `const` in the same scope — this is a syntax error that crashes the build immediately. Run `node --input-type=module < src/components/admin/ChatPanel.js` before committing to catch these.

**4. `ChatPanel.js` — history loading via POST with empty message (logic error)**

You sent `{ message: "", history: [] }` to `/api/chat` to load history on mount. The route immediately returns 400 for empty messages. The load would always silently fail. Also `setChatMessages` was called inside the component but is not a prop — it's state owned by `AdminDashboard`. History now arrives naturally via the `history` field in each chat response; no separate load call is needed.

**5. `ChatMessage.js` — unhandled clipboard rejection (minor)**

`navigator.clipboard.writeText()` returns a Promise that rejects in non-HTTPS contexts or when permission is denied. Always add `.catch()`:

```js
navigator.clipboard.writeText(text).catch((err) => {
  console.warn("[ChatMessage] clipboard write failed:", err);
});
```

**Process note:**
Run `npm test && npm run build` before pushing. The build error here would have been caught immediately. Also: always `git diff` the files you touched to sanity-check before committing — the duplicate `const` and the wrong destructuring would be obvious in a diff review.

## 2026-03-19

### Codex

- **Chat Modularisation**: Split `route.js` into `src/lib/chat/{rag,detect,intents}.js`. Added 12 new tests for `chunkText`, `cosine`, `detectLanguage`, and intent routing. Route trimmed to ~55 lines.
- **Chat UI Refactor**: Extracted `ChatPanel`, `ChatMessage`, and `ChatMarkdown` components. Markdown rendering now supports tables, lists, code blocks, and inline formatting. Eliminated `m.table` hack.
- **Auto-scroll**: Added smooth auto-scroll to bottom on new messages.
- **i18n**: Updated `stats.workersHint` in EN/SV/ES.
- **Bugfix**: `formatHour` now uses `getUTCHours()` for Cloudflare UTC timestamps.
- **Refactor**: `ProductSection.renderItem` now returns JSX directly.
- **Stripe/Sales Review**: Confirmed `/api/admin/payments` limit param can become `NaN` (non-numeric query) and that the support tab still hands Stripe `payment_intent` IDs instead of the charge ID when downloading receipts. Claude, please adjust the limit sanitization to default to 20 and clamp 1‑100 before calling `compilePayments`, and ensure the support tab passes `receiptId`/charge IDs to `downloadReceipt`.

### Claude

- **Image Gen Polish**: Thumbnails scale to correct aspect ratio, added "Copy prompt" button (i18n), count toggle extended to [1, 2, 3], elapsed-second counter on generate button.
- **Chat Fixes**: Fixed `rows` crash in payments intent, extracted `IMAGE_SYSTEM_PROMPT` as shared constant, capped `body.history` to last 10 turns.
- **KV Health Check**: Added `checkKvStorage()` to admin health route — warns when KV is not configured or unreachable, explaining in-memory fallback and data-loss risk. New i18n keys `health.kvOk/kvNotConfigured/kvFailed` (EN/SV/ES).
- **Brand**: Capitalized RAGBAZ in all user-visible text (i18n values, docs, PHP plugin header/notice, console strings); code identifiers, file names, GraphQL types, and package names left unchanged.
- **Security / Next.js 16**: Fixed 4 high Dependabot CVEs (`fast-xml-parser`, `flatted`, `tar`, `undici`) via `npm audit fix`; upgraded Next.js 15→16.2.0 (clears last moderate CVE; `@opennextjs/cloudflare@1.17.1` supports `^16.1.5`); added missing `stripe` npm dependency. Fixed three latent bugs surfaced by Turbopack 16's stricter parser: broken regex literals in `chat/route.js`, `runtime="edge"` on a route importing `node:crypto` via auth, and undeclared `locale` variable in `AdminHeader` language selector.

---

## 2026-03-18

### Codex

- **StatsChart**: Extracted from `AdminStatsTab` with `maxOf`, `barHeight`, `formatHour` helpers. Added unit tests.
- **Style Tab**: Added (Alt+8), updated legend, EN/SV/ES translations.
- **AGENTS.md**: Created initial version with project overview, key commands, and coordination protocol.

### Claude

- **AI Image Generation**: Implemented `src/lib/imageQuota.js`, `src/lib/ai.js` `generateImage`, `/api/admin/generate-image`, `ImageGenerationPanel`, wired into `AdminDashboard` (shop editor + chat). Refactored auth to Web Crypto API for edge compat. Added 19 unit tests.

---

## 2026-03-17

### Codex

- **Admin UI**: Added hotkeys (Alt+1..8 for tabs, Alt+/ search, Alt+L logout). Updated legend in `AdminHeader.js`.
- **i18n**: Added missing keys for new tabs and hotkeys.

### Claude

- **Stripe Integration**: Completed payments flow with receipts and KV persistence.
- **KV Layer**: Added `cloudflareKv.js` with in-memory fallback for non-CF runtimes.

---

## 2026-03-16

### Both

- **Monorepo Setup**: Initialized with `packages/ragbaz-articulate-plugin/` for WordPress companion plugin.
- **Build System**: Added `npm run plugin:copy`, `cf:build`, `cf:deploy` scripts.
- **Tests**: Configured `node:test` in `tests/`.

---

## 2026-03-19 (cont.)

### Claude — i18n sync + unit tests

- **i18n drift fixed**: 69 keys synced — 66 ES translations across shop/darkMode/comments/s3/footer/nav/resetPassword/metadata, plus 3 missing EN+SV shop keys (`shop.viewCart`, `shop.emptyShop`, `shop.shopHint`).
- **New test suites** (71 tests total, all green):
  - `tests/imageQuota.test.js` — `resolveSize`, `clampCount` (edge cases: NaN, floats, out-of-range, unknown keys)
  - `tests/slugify.test.js` — `slugify` (Unicode/diacritics, punctuation, falsy) + basic `stripHtml`
  - `tests/decodeEntities.test.js` — `decodeEntities` (named, decimal, hex entities, unknowns, non-strings)
  - `tests/stripHtml.test.js` — `stripHtml` (HTML tags, shortcodes, falsy, self-closing)
- **Bug found via tests**: `stripHtml.js` shortcode regex used `\\[` (matching literal backslash + bracket) instead of `\[` — shortcodes like `[gallery ids="1,2"]` were never stripped. Fixed.

---

## 2026-03-19 (cont. 2)

### Claude — Clear Chat + AdminDashboard modularisation

- **Clear Chat implemented**: DELETE /api/chat handler deletes `chat_history:admin` from KV (fail-open). `clearChat()` in AdminDashboard clears local state then fires the DELETE. Button appears in ChatPanel header only when messages exist, disabled while loading. `chat.clear` i18n key added to all three locales.
- **AdminDashboard split**: 3505-line monolith extracted into focused tab components, each lazy-loaded:
  - `AdminProductsTab.js` (995 lines) — products, access, shop settings
  - `AdminSupportTab.js` (376 lines) — tickets, comments, payments
  - `AdminAdvancedTab.js` (365 lines) — deploy, storage, environment, commits, debug log
  - `AdminDashboard.js` reduced to 1967 lines (−44%)
  - All three wrapped with `React.lazy` + `<Suspense>` — tabs not yet visited ship zero JS on initial load
- All 79 tests green, build clean.

---

---

## 2026-03-19 (cont. 3)

### Claude — Stripe fix, Sales tab, Ctrl+Alt hotkeys, type column

- **Stripe self-fetch bug fixed**: `intents.js` was doing HTTP self-fetch to `/api/admin/payments`; on Stripe error the route returned non-JSON (HTML 500), causing `makeFetch` to throw a misleading "Failed to load /api/admin/payments" error in chat. Fix: extracted `getStripe()` + `compilePayments()` to `src/lib/stripePayments.js` and imported directly in `intents.js` — no more internal HTTP round-trip. `route.js` also updated to use the shared module and now surfaces `error.message` instead of a generic string.
- **Sales tab**: New `AdminSalesTab.js` with client-side date filter (All time / Month / Week / Today), email filter, revenue summary by currency, payment table, and two distinct empty states (no payments in date range vs no Stripe data at all). Lazy-loaded in `AdminDashboard`. Nav item added to `AdminHeader`.
- **Ctrl+Alt hotkeys**: Changed from `e.altKey` to `e.altKey && e.ctrlKey` throughout. Tab map updated to include Sales at position 4. Shortcut panel labels updated to `^⌥` notation.
- **Type column in Access & Pricing**: Replaced four IIFE-grouped sections with a single flat sortable list. Compact coloured type badges (WC/LP/EV/SH/URI) per row. Three clickable column headers (Type / Name / Status) toggle sort direction. Filter pill label/count pattern fixed so i18n text and dynamic count are correctly separated.
- **S3/R2 secret key**: Added `secretKey` to `/api/admin/upload-info` response. `AdminAdvancedTab` shows the key with a show/hide toggle (masked by default).
- **Code review verification**: All five bugs from the Mistral session review confirmed resolved — `cloudflareKv.js` exports intact, `requireAdmin` guard correct, no duplicate `const` in `ChatPanel.js`, no empty-POST history load, `.catch()` on clipboard present.
- All i18n keys added to en/sv/es.

---

## 2026-03-20

### Codex

- **Welcome tab**: Added the default welcome tab (Alt+0) powered by impress.js, refreshed the nav + hotkey legend, and translated the story into EN/SV/ES.
- **Storage & Sandbox reorg**: Split the old Advanced panel into a dedicated Storage tab (storage backend choices, upload destination, R2/S3 docs, WinSCP/Cyberduck guidance) plus the renamed Sandbox tab that retains deploy, commit, and debug tooling; nav/hotkey legend and i18n reflect the new labels.
- **Advanced tab banner**: Implemented a rotating torus banner (24×24 quads) with cyan edges, plus a separate `RagbazLogo` component so the StoreFront logo can appear with or without the animation.
- **Ownership handoff**: Claude has handed this iteration over to Codex alone; continuing work under the existing coordination protocols until Claude indicates otherwise.
- **Bucket listing**: Added `/api/admin/storage-objects`, wired the Products tab to fetch it, and show manageable cards beside the digital-file field so Cyberduck/S3 uploads can be copied or assigned.

---

## 2026-03-19 (cont. 4)

### Claude — JetBrains Mono + Gruvbox dark theme + Sales redesign + Stripe tests

- **JetBrains Mono**: `next/font/google` in `src/app/admin/layout.js`, weights 300–700, CSS var `--font-admin` scoped to `.admin-layout`. Ligatures enabled. Public site fonts untouched.
- **AdminThemeWrapper**: `"use client"` wrapper reads `ragbaz-admin-theme` from `localStorage`, listens for `admin:setTheme` events, applies `admin-gruvbox` class.
- **Gruvbox dark theme**: Full CSS palette in `globals.css` under `.admin-gruvbox`. Gruvbox dark hard (`#1d2021`) + Solarized blue accent (`#458588`). Covers all UI regions.
- **Toggle button** in `AdminHeader`: `● gruvbox` / `☀ light`, persists to localStorage.
- **Sales tab redesign**: `Intl.NumberFormat` currency, `MetricCard` with dark accent variant, spinner loader, icon empty state, animated download, `StatusBadge` with ring outlines, zebra+indigo-hover table, all headers i18n.
- **Tab order**: Welcome(^⌥0) → Sales(^⌥1) → Stats(^⌥2) → Shop(^⌥3) → Access(^⌥4)…
- **Stripe API version**: Removed hardcoded `2024-12-18` (now invalid per Stripe). SDK default `2026-02-25.clover` used. Was causing 400 errors in production.
- **Stripe tests**: 36 unit + live smoke tests, all green with real test key. Also fixed `limit=0` bug in payments route.

## Open Questions

- **Streaming chat**: Good UX improvement (token-by-token rendering). Deferred — client wants a robust shop shipped first. Architecture: `ReadableStream` on CF Workers + Mistral `stream: true`, defer `saveChatHistory` until stream end.
- **Dead-link finder**: Scan `<a href>` anchors, classify (internal/anchor/external), HEAD-check externals with per-domain concurrency cap + 3s timeout, present in a new admin panel. Parked for later.

---

## 2026-03-19 (cont. 5)

### Codex — Welcome narrative mocks + hook cleanup + hamburger drawer pass

- **Welcome presentation rebuilt**: `AdminWelcomeTab` now renders a stronger impress.js narrative with a big-picture architecture slide that zooms into three concrete mock screens: Sales (metrics + payment table), Products (catalog cards), and AI Chat (debug/payments/manuals style conversation). Added final landing slide CTA and richer navigation dots/prev/next controls.
- **Welcome escape flow fixed**: `AdminDashboard` now tracks `welcomeStoryVisible` and supports skip/escape/replay. Seen-revision persistence remains tied to `WELCOME_SEEN_KEY`, while the card grid remains available after skipping.
- **Hook warnings resolved**: Cleared all previously reported `react-hooks/exhaustive-deps` warnings in `AdminDashboard` by tightening callback dependencies, removing a redundant support/storage effect, and folding upload-info details into the existing loader path.
- **Hamburger menu restructuring**: `AdminHeader` now uses a proper drawer-style menu with fixed overlay, route-change close, and Escape-to-close behavior. Health label mapping was moved inside the component lifecycle to keep language switching safe.
- **Hotkey legend relocation**: Removed the fixed bottom-left legend from `AdminDashboard`; shortcuts are now displayed inline next to each hamburger menu entry (plus health/logout utility actions) so navigation hints live where users actually choose tabs.
- **Verification**: `npx eslint src/components/admin/AdminDashboard.js src/components/admin/AdminHeader.js src/components/admin/AdminWelcomeTab.js` now returns clean (0 warnings, 0 errors).

### Codex — Hotkey contract + i18n parity tests (points 1 and 5)

- **Shared hotkey source of truth**: Added `src/lib/adminHotkeys.js` with tab hotkeys, action hotkeys (`menuToggle`, `logout`, `search`), and resolver helpers.
- **Runtime wiring**: `AdminDashboard` now resolves tab/search/logout shortcuts through `adminHotkeys` helpers; `AdminHeader` hotkey labels now read from the same module and `Ctrl+Alt+M` toggle uses `isAdminActionHotkey`.
- **New tests**:
  - `tests/admin-hotkeys.test.js` verifies tab combo uniqueness/order and event-to-tab/action mappings.
  - `tests/i18n-admin-parity.test.js` verifies that `sv` and `es` include all `admin.*` keys from `en`.
- **Locale sync for parity**: Added missing Spanish Welcome admin keys (skip/prev-next/enter-dashboard plus split slide tag/sub/paragraph keys) so parity checks pass.
- **Verification**: `npm test` now runs 13 passing suites including the two new tests; targeted ESLint on touched files is clean.

### Codex — Welcome sizing fix + welcome revision test

- **Slideshow scaling fix**: `AdminWelcomeTab` now computes slide dimensions from viewport size (`computeSlideLayout`) and scales impress steps from a base slide size instead of forcing 940×420 across all screens. This prevents oversized rendering on 2K displays where users previously needed browser zoom-out.
- **Welcome revision logic extracted**: Added `src/lib/adminWelcomeRevision.js` with `deriveWelcomeRevisionState`, `persistWelcomeRevision`, and `WELCOME_SEEN_KEY`. `AdminDashboard` now uses this shared logic instead of inline checks.
- **New test**: Added `tests/admin-welcome-revision.test.js` covering unseen/seen/new revision flows and storage persistence behavior.
- **Verification**: `npm test` now passes 14/14 tests and touched-file ESLint is clean.

---

## 2026-03-19 (cont. 6)

### Codex — hash tabs, scroll-fit fixes, Info tab rename, torus/banner polish

- **Hash-based admin tab URIs**: Added stable hash routing for tabs (`/admin#/welcome`, `/admin#/sales`, `/admin#/chat`, etc.) in `AdminDashboard` + `AdminHeader`, including startup parsing and `hashchange` sync.
- **Backward compatibility**: `#/sandbox` now maps to `#/info` so old links still resolve after the tab rename.
- **Impress URL/scroll cleanup**: Welcome story now forces stable `#/welcome` while active and performs best-effort impress teardown on hide/unmount. Added viewport cleanup removing stale `impress-*` classes/styles on `html/body` to avoid post-story scroll lock.
- **Screen fit + scrollability**: Updated admin containers for responsive behavior (`min-w-0`, wrapped header/toolbars, responsive 1→2 column chat layout, products/access grid breakpoints, reduced fixed-width pressure) and added admin-targeted overflow protections in `globals.css`.
- **Hamburger hotkey UX**: Removed busy per-row full hotkey badges; added compact top legend with prominent `Ctrl + Alt` keys and larger single-key mappings.
- **Sandbox → Info**: Renamed the tab label to Info in EN/SV/ES, remapped hotkey tab ID to `info` (`Ctrl+Alt+7`), and kept Info as the last tab in order.
- **Torus banner updates**: Increased rotation speed, brightened torus orange, reduced canvas height, changed cyan tag text to `Info`, explicitly uses the new `RagbazLogo`, and made banner background theme-matched via `--admin-torus-bg` (light/admin and gruvbox variants).
- **Validation**: `npm test -- --runInBand` passed (14/14). `npm run lint` passes with existing `img` optimization warnings only (no errors).

---

## 2026-03-19 (cont. 7)

### Codex — control-room routing, StoreFront naming, card i18n, and order alignment

- **Control-room shortcut target**: Updated the header link so clicking the logo/control-room area always lands in the control panel entry point (`/admin#/welcome`) instead of generic `/admin`.
- **Welcome subtitle naming**: Replaced the “story/berättelse/historia” subtitle label with `RAGBAZ Articulate StoreFront` in EN/SV/ES.
- **Welcome card translations completed**: Removed hardcoded English text for Storage/Support card bodies and added locale keys across all three languages:
  - `admin.cardStorageBody`
  - `admin.cardSupportBody`
- **Ordering requested by user applied**:
  - Drawer/main tab order now uses: `Welcome → Sales → Stats (analysis) → Storage → Products → Chat → Health → Style → Info → Support`
  - Support is last.
  - Storage is before Products.
  - Stats/Analysis appears before Support.
  - Welcome card ordering was adjusted to match the requested section flow.
- **Validation**: `npm test -- --runInBand` remains green (14/14).

---

## 2026-03-19 (cont. 8)

### Codex — bug-hunt stabilization pass (hash/impress, products/access, chat typing)

- **Impress/hash ghost switching hardening**:
  - `AdminHeader.parseTabHash` now accepts only known admin tabs (plus `sandbox -> info` alias), so slideshow step hashes cannot pollute active-nav state.
  - `AdminDashboard` hashchange handler now normalizes unknown hashes back to the current active tab instead of leaving URL drift.
  - `AdminWelcomeTab` got extra cleanup/stability: stronger `tearImpress()` fallback path, a hashchange stabilizer while story mode is active, and `data-hash="false"` along with existing `data-hash-changes="false"`.
- **Chat textbox spacebar fix**:
  - Added `e.stopPropagation()` in `ChatPanel` input `onKeyDown` so global handlers (including lingering impress/hotkey listeners) do not hijack typing; Enter-to-send behavior remains intact.
- **Products/access bugs fixed**:
  - Fixed stale loader condition in `AdminDashboard` (`activeTab === "shop"` -> `activeTab === "products"`), so products-tab shop settings now load correctly.
  - Reworked manual URI entry in `AdminProductsTab` Access tab: added dedicated draft input state and explicit apply action, preventing the one-keystroke self-collapse bug.
  - Added active-state wiring for WP/manual course-access entries:
    - UI toggle in Access detail panel.
    - save payload now includes `active` for non-shop selections.
    - `/api/admin/course-access` now accepts and persists `active`.
    - Access list now displays `Off` status for WC/LP/Event/manual rows when disabled in course config.
  - Storefront aggregation now respects `active === false` on WP-backed items (`shopProducts.js`) so disabled entries are hidden publicly.
- **Operator clarity improvements included in same pass**:
  - Distinct payments error code propagation/state (Dashboard/Sales/Support) so “error loading” is no longer conflated with “no sales yet”.
  - Broken product image fallback icon replaces browser broken-image glyph in admin product listings/editors.
- **Validation**:
  - `npx eslint` on all touched files: 0 errors (existing `<img>` perf warnings only).
  - `npm test -- --runInBand`: 14/14 passing.

---

## 2026-03-19 (cont. 9)

### Codex — product + Stripe bug-hunt hardening pass

- **Admin tab safety / keyboard robustness**:
  - Normalized `admin:switchTab` event payload handling in both `AdminHeader` and `AdminDashboard` so unknown tab IDs are ignored instead of mutating state.
  - Added AltGraph guard in `adminHotkeys` so international keyboard layouts do not accidentally trigger Ctrl+Alt admin shortcuts while typing.
- **Payments route hardening (`/api/admin/payments`)**:
  - Sanitized `email` query parsing (trim + lowercase).
  - Replaced permissive numeric coercion with safe integer parsing and clamping (`limit` defaults to 20, clamped 1–100).
  - Added safe `from` timestamp parsing (invalid values ignored).
  - Mapped Stripe error classes to explicit API codes:
    - `stripe_auth_failed`
    - `stripe_permission_failed`
    - `stripe_connection_failed`
    - fallback `stripe_lookup_failed`
- **Payments UI clarity**:
  - Added missing i18n keys in EN/SV/ES for:
    - `admin.paymentsLoadFailed`
    - `admin.paymentsRetryHint`
    - `admin.paymentsStripeLookupFailed`
    - `admin.paymentsStripeAuthFailed`
    - `admin.paymentsStripePermissionFailed`
    - `admin.paymentsStripeConnectionFailed`
    - `admin.paymentsHttpFailed`
  - Updated `AdminSalesTab` and `AdminSupportTab` to map error codes to user-facing Stripe-specific messages (instead of exposing raw code strings like `stripe_lookup_failed`).
  - Generalized `t()` to support a string fallback as second argument (`t(key, "fallback")`) while keeping object interpolation behavior.
- **Products/access consistency (core issue for visibility toggles)**:
  - Canonicalized course URIs by stripping trailing slashes in `courseAccessStore`.
  - Added equivalent URI normalization in WordPress-backed access flow (`courseAccess.js`) so reads/writes/checks use the same canonical key.
  - Added compatibility fallback for WordPress plugin schemas that don’t yet expose `active` on `courseAccessRules`/`courseAccessConfig`/`setCourseAccessRule`.
- **Storefront guardrails for inactive configured items**:
  - Content page (`src/app/[...uri]/page.js`) now `notFound()` for configured access rules marked `active: false`.
  - Stripe checkout route blocks purchase initiation when content config is inactive.
- **Plugin schema upgrade (`packages/ragbaz-articulate-plugin`)**:
  - Added `active` to `CourseAccessRule`, `SetCourseAccessRuleInput`, and `setCourseAccessRule` mutation input handling.
  - Version bumped to `1.0.1`.
  - Improved rules normalization and made `active` optional/preserved when omitted, so legacy clients do not unintentionally re-enable disabled items.
- **Validation**:
  - `npx eslint` on touched JS files: clean (no errors).
  - `npm test -- --runInBand`: 14/14 passing.
  - Full lint remains clean except existing non-blocking `<img>` optimization warnings in admin image components.

---

## 2026-03-19 (cont. 10)

### Codex — header logo simplification + WordPress price fallback pass

- **Header/logo update**:
  - Moved logo back into the top admin menu bar beside the hamburger button.
  - Simplified branding to a single-word mark: `RAGBAZ`.
  - Added `RagbazLogo` support for `wordmarkOnly` and `noLetterSpacing`; header now renders with no tracking/letterspacing as requested while keeping existing typeface/color.
  - Removed the previous fixed-position external logo block.
- **Products list UX**:
  - Widened list columns in both Products and Access subviews.
  - Added row/name tooltips so long/similar product names remain readable on hover.
  - Access list "configured" status now treats WordPress price data (and shop product price) as valid, not only KV `priceCents`.
- **WordPress price fallback behavior**:
  - `AdminDashboard` now parses WP prices via `parsePriceCents` for selection defaults.
  - `saveUnified` now avoids unnecessary `/api/admin/course-access` writes for WP-backed content when only the default WP price is used and no explicit overrides are set.
  - Paywall page now prefers WP rendered price for `priceCents` when no positive local override exists.
  - Stripe checkout now falls back to WP product/course prices when KV config has no usable price, reducing false "price not configured" failures.
- **Validation**:
  - `npx eslint src/components/admin/AdminHeader.js src/components/admin/RagbazLogo.js src/components/admin/AdminProductsTab.js src/components/admin/AdminDashboard.js src/app/api/stripe/checkout/route.js src/app/[...uri]/page.js` passes (only existing non-blocking `<img>` warning in `AdminProductsTab`).
  - `npm test` passes: 14/14.

---

## 2026-03-19 (cont. 11)

### Codex — Stripe payments bug-hunt follow-up (test-mode visibility)

- **Root-cause class addressed**:
  - `compilePayments()` previously took an email-filter branch through `customers.list(...)` and then `charges.list({ customer })`. This could miss guest/test-mode charges where Stripe has `receipt_email` but no linked customer object.
  - Row keys were based on `payment_intent || charge.id`; repeated attempts on one intent can collapse/overwrite rows in React tables.
- **Payments fetch robustness** (`src/lib/stripePayments.js`):
  - Reworked to page through `stripe.charges.list(...)` directly (up to 20 pages), then filter by `receipt_email`/`billing_details.email` when email filter is set.
  - Keeps sorting by newest first and applies `limit` after filtering.
  - Uses `charge.id` as stable row `id` and adds `paymentIntentId` as a separate field.
- **Checkout fallback robustness** (`src/app/api/stripe/checkout/route.js`):
  - WP price fallback now paginates WooCommerce/LearnPress lookups (not first 100 only), so larger catalogs no longer silently miss prices.
  - Fallback lookup now follows `contentKind` to avoid unnecessary source queries.
  - Currency fallback now uses `DEFAULT_COURSE_FEE_CURRENCY` / `site.defaultCurrency` before hardcoded SEK.
- **Admin save edge-case fix** (`src/components/admin/AdminDashboard.js`):
  - Preserves currency overrides for WP-backed items even when price equals WP default, avoiding skipped persistence in that case.
- **Admin header i18n bug** (`src/components/admin/AdminHeader.js`):
  - Removed stale memoization path so health tooltip text tracks current language after locale changes.
- **Direct verification against Stripe test data** (local env key):
  - `compilePayments(undefined, 20)` returns 3 rows.
  - `compilePayments("tobias@survivors.se", 20)` returns 2 rows.
- **Validation**:
  - `npx eslint` on touched files passes.
  - `npm test` passes: 14/14.

---

## 2026-03-19 (cont. 12)

### Codex — production payments root-cause confirmation + Workers-safe Stripe path

- **Reproduced against deployed worker API**:
  - Login succeeds on `articulate-learnpress-stripe.xyzzybyragbaz.workers.dev`.
  - `/api/admin/payments` returns 500 with `code: stripe_connection_failed`.
  - This confirms the current live error is runtime-side, not missing admin auth.
- **Root cause**:
  - Admin payments/receipt flow was using Stripe Node SDK calls in a Cloudflare Worker deployment path; this produced connection failures in production.
- **Fix implemented (local branch, to be deployed)**:
  - Replaced `src/lib/stripePayments.js` internals with direct Stripe REST `fetch` calls (`/v1/charges`) and explicit error mapping to existing UI codes.
  - Added `fetchStripeCharge(chargeId)` helper via REST for receipt retrieval.
  - Updated `/api/admin/payments` POST to use `fetchStripeCharge` instead of `stripe.charges.retrieve`.
  - Kept `getStripe()` compatibility shim for existing tests/imports.
- **Validation**:
  - `npx eslint src/lib/stripePayments.js src/app/api/admin/payments/route.js` passes.
  - `npm test` passes: 14/14.
  - Live worker still shows old error until deploy of this commit.

---

## 2026-03-19 (cont. 13)

### Codex — Stripe receipt/product clarity + configured-currency display

- **Checkout description wiring**:
  - Updated Stripe checkout session creation to set `payment_intent_data[description]` and `line_items[0][price_data][product_data][description]` so Stripe receipts/charges carry a clear purchased-item label.
  - Mirrored metadata onto payment intent metadata (`payment_intent_data[metadata][*]`) in addition to session metadata for stronger downstream traceability.
  - Added `product_name` metadata for course/event checkout, and explicit description for digital product checkout (`Digital product: ...`).
- **Payments normalization update**:
  - Admin payments now always report configured currency (`DEFAULT_COURSE_FEE_CURRENCY`, fallback `SEK`) instead of raw per-charge Stripe currency values.
  - Payment description now falls back to Stripe metadata fields (`product_name`, `course_title`, `course_uri`) when `charge.description` is empty.
- **Tests**:
  - Updated `tests/stripe-payments.test.js` to match configured-currency behavior and metadata-description fallback.
  - Added assertion for metadata-driven description fallback.
- **Validation**:
  - `npx eslint src/lib/stripe.js src/lib/stripePayments.js src/app/api/digital/checkout/route.js tests/stripe-payments.test.js` passes.
  - `npm test -- tests/stripe-payments.test.js` passes (full suite still green at 14/14).

---

## 2026-03-19 (cont. 14)

### Codex — storage i18n polish + tracked TODOs

- Added explicit TODOs for:
  - Storage docs links navigating outside `/admin` leading to 404.
  - Sales VAT/Moms derivation fallback (product override first, then category map).
  - Full WinSCP/CyberDuck R2/S3 checklist panel requirements.
- Improved Storage-tab localization quality:
  - Refined Swedish (`sv`) strings to remove mixed English phrasing in core storage/upload labels and setup instructions.
  - Tightened Spanish (`es`) storage phrasing for consistency with the same updated terminology.
- Validation:
  - `npm test -- tests/i18n-admin-parity.test.js` passes.

---

## 2026-03-19 (cont. 15)

### Codex — docs routing hardening inside admin

- Fixed admin documentation navigation so links stay under `/admin` and avoid 404 routes:
  - `src/app/admin/docs/page.js` now links to valid slugs per locale/content (`architecture`, `readme-sv/en`, etc.) instead of appending `-sv/-en` to every doc.
  - `src/app/admin/docs/[slug]/page.js` now rewrites broader markdown link formats (`docs/*.md`, `/docs/*.md`, `/README*.md`, etc.) to `/admin/docs/<slug>`.
  - `src/lib/chat/rag.js` manual source URIs now point to `/admin/docs` (previously `/docs`).
- Result: Documentation links used from admin and AI-chat source references no longer jump to broken non-admin routes.
- Validation:
  - `npx eslint src/app/admin/docs/page.js src/app/admin/docs/[slug]/page.js src/lib/chat/rag.js`
  - `npm test -- tests/i18n-admin-parity.test.js tests/contentCategories.test.js`

---

## 2026-03-19 (cont. 16)

### Codex — hamburger shortcut legend cleanup

- Removed the extra “Open menu / Öppna meny” legend chip from the Welcome UI.
- Added a compact plain-text `Ctrl+Alt+M` hint directly beneath the hamburger button in `AdminHeader`.
- Kept the hint intentionally smaller and background-free to reduce visual clutter while preserving discoverability.
- Updated locale headline strings to concise titles:
  - EN: `Control Panel`
  - SV: `Kontrollpanel`
  - ES: `Panel de control`
- Validation:
  - `npx eslint src/components/admin/AdminHeader.js src/components/admin/AdminWelcomeTab.js`

---

## 2026-03-19 (cont. 17)

### Codex — welcome story contrast + mock image slide + header branding

- Replaced the Welcome impress image-generator slide’s live API/snapshot behavior with static mock quota, mock prompt, and a mock SVG preview card so onboarding no longer depends on `/api/admin/generate-image`.
- Updated landing slide sign-off copy from “Welcome is complete” to localized stronger sign-off text:
  - EN: `Control room unlocked`
  - SV: `Kontrollpanelen är upplåst`
  - ES: `Panel de control desbloqueado`
- Enforced story chrome text color outside the slide viewport via `welcome-story-force-white` + `color: #fff !important` so slide title/subtitle row and control labels stay white on dark-blue background.
- Updated menu bar branding to display `RAGBAZ` + white `ARTICULATE STOREFRONT` inline.
- Nudged the `Ctrl+Alt+M` hint slightly lower under the hamburger icon for spacing.
- Validation:
  - `npx eslint src/components/admin/AdminHeader.js src/components/admin/AdminWelcomeTab.js`
  - `npm test -- tests/i18n-admin-parity.test.js`

---

## 2026-03-19 (cont. 18)

### Codex — storage/R2 UX dedup + backend defaults + error scoping groundwork

- Changed course-access backend defaults from WordPress to Cloudflare KV in deploy/example config:
  - `.env.example`: `COURSE_ACCESS_BACKEND=cloudflare-kv`
  - `wrangler.jsonc`: `vars.COURSE_ACCESS_BACKEND = "cloudflare-kv"`
- Made `/api/admin/upload-info` backend-aware (`?backend=wordpress|r2|s3`) and added `CF_ACCOUNT_ID` fallback when deriving R2 endpoint host.
- Updated dashboard upload-info loading to request backend-specific details based on the selected storage backend so R2 fields populate correctly instead of stale WordPress-mode values.
- Redesigned `AdminStorageTab` to remove duplicated R2/S3 credential sections:
  - Keeps one canonical “Client checklist” block with copy controls and secret toggle.
  - WinSCP/Cyberduck accordions now focus on client-specific steps and refer to the checklist values instead of repeating the same host/key/bucket fields.
- Added tab-scoped admin error-state wiring in `AdminDashboard` so global error banners can be restricted to the originating tab and no longer leak across tabs.
- Validation:
  - `npx eslint src/components/admin/AdminStorageTab.js src/components/admin/AdminDashboard.js src/app/api/admin/upload-info/route.js`

---

## 2026-03-19 (cont. 19)

### Codex — admin TDZ runtime crash fix + header overlap fix

- Fixed runtime crash reported as minified `ReferenceError: Cannot access '<symbol>' before initialization` in admin UI.
- Root cause: `runHealthCheck` (`const` + `useCallback`) was referenced in an effect dependency before the callback was initialized in module render order, triggering a temporal dead zone during initial render.
- Fix: moved `runHealthCheck` callback definition above the effect that depends on it in `src/components/admin/AdminDashboard.js`.
- Also fixed header logo text overlap by increasing brand-link gap and enforcing no-wrap for `ARTICULATE STOREFRONT` in `src/components/admin/AdminHeader.js`.
- Validation:
  - `npx eslint src/components/admin/AdminDashboard.js src/components/admin/AdminHeader.js`

---

## 2026-03-19 (cont. 20)

### Codex — additional TDZ sweep and fix

- Ran targeted TDZ sweep on admin code and broad source sweep with:
  - `npx eslint src/components/admin/*.js --rule 'no-use-before-define:[...,variables:true]'`
  - `npx eslint "src/**/*.js" --ignore-pattern "src/.next/**" --rule 'no-use-before-define:[...,variables:true]'`
- Found one additional real TDZ-use in source:
  - `setUploadInfoDetails` used in `loadUploadInfo` before the state hook declaration in `AdminDashboard`.
- Fix applied:
  - Moved `const [uploadInfoDetails, setUploadInfoDetails] = useState(null);` up into the primary state-hook block before `loadUploadInfo` callback definition.
- Result:
  - No remaining source-level TDZ errors under the strict `no-use-before-define` check (excluding `.next` compiled artifacts).

---

## 2026-03-19 (cont. 21)

### Codex — Storage docs-mode bug fix (client env misuse)

- Bug identified: `AdminStorageTab` used server-only `process.env.*` inside a client component to infer Cloudflare mode (`isCloudflare`), which can resolve incorrectly in the browser and show mismatched docs links.
- Fix:
  - Removed client-side `process.env` checks.
  - Added deterministic `backendMode` resolution from runtime state:
    - `uploadBackend` selection (primary)
    - `uploadInfoDetails.isR2` (API response)
    - `uploadInfo.r2/s3` capability fallback
  - `showR2Docs` / `showS3Docs` now map strictly to resolved backend mode.
- Validation:
  - `npx eslint src/components/admin/AdminStorageTab.js`

---

## 2026-03-19 (cont. 22)

### Codex — menu logo stack redesign

- Updated header brand block to remove persistent overlap concerns:
  - Increased `RAGBAZ` size via `RagbazLogo` `scale` prop (`1.75`).
  - Changed layout from horizontal lockup to vertical stack.
  - Positioned `ARTICULATE STOREFRONT` directly below `RAGBAZ` in white, tighter subtitle sizing for visual balance inside the menu bar.
- Added generic `scale` support to `RagbazLogo` so size increases affect actual layout width/height rather than relying on CSS transform scaling in the header.
- Validation:
  - `npx eslint src/components/admin/AdminHeader.js src/components/admin/RagbazLogo.js`

---

## 2026-03-19 (cont. 23)

### Codex — admin chunk-load self-recovery

- Addressed recurring runtime failure: `Failed to load chunk ...` in admin after deploys.
- Updated `src/app/admin/error.js` to:
  - Detect chunk-load signatures (`ChunkLoadError`, `Loading chunk`, `Failed to load chunk`).
  - Auto-attempt one guarded recovery reload using cache-busting query param (`/admin?reload=<timestamp>`), tracked with sessionStorage guard.
  - Keep manual “Reload admin” button but make it perform the same cache-busted reload path and clear guard before retry.
- UX improvement:
  - Chunk-specific explanatory message shown instead of generic error copy.
- Validation:
  - `npx eslint src/app/admin/error.js`

---

## 2026-03-19 (cont. 24)

### Codex — menu lockup micro-alignment tweak

- Applied a small visual alignment tweak in `AdminHeader`:
  - Shifted `RAGBAZ` wordmark ~14px to the right (`className="ml-[14px]"`) while keeping `ARTICULATE STOREFRONT` on the line beneath.
- Goal: improve perceived left-edge alignment between the oversized brand glyphs and subtitle lockup in the menu bar.
- Validation:
  - `npx eslint src/components/admin/AdminHeader.js`

---

## 2026-03-19 (cont. 25)

### Codex — welcome branding cleanup

- Removed `RAGBAZ Articulate StoreFront` from Welcome-screen content chrome so the brand text is no longer repeated outside the menu bar.
- Applied in both Welcome modes:
  - Story mode (dark-blue header row above impress frame)
  - Non-story mode (card dashboard intro header)
- Validation:
  - `npx eslint src/components/admin/AdminWelcomeTab.js src/components/admin/AdminHeader.js`

---

## 2026-03-19 (cont. 26)

### Codex — orange header/menu palette

- Re-themed admin header/menu bar from blue to orange:
  - Top bar background/border moved to `bg-orange-700` / `border-orange-800`.
  - Hamburger and theme buttons moved to orange variants.
  - Drawer shell + hotkey card + legend text + language select panel switched from indigo tokens to orange tokens for consistent chroma.
- Goal: satisfy requested orange menu identity while preserving existing contrast and layout behavior.
- Validation:
  - `npx eslint src/components/admin/AdminHeader.js`

---

## 2026-03-19 (cont. 27)

### Codex — numeric menu hotkeys + directional tab cycling

- Updated tab hotkey mapping to numeric ascending order aligned with drawer menu order:
  - `Welcome=0`, `Sales=1`, `Stats=2`, `Storage=3`, `Products=4`, `Chat=5`, `Health=6`, `Style=7`, `Info=8`, `Support=9`.
- Removed the dedicated drawer hotkey legend panel.
- Added per-item key badges directly on each menu option row (numbers shown next to the option labels).
- Added directional shortcut synonyms for navigation:
  - Next tab: `Ctrl+Alt+Right` and `Ctrl+Alt+Down`
  - Previous tab: `Ctrl+Alt+Left` and `Ctrl+Alt+Up`
- Implemented wrap-around next/previous tab switching in `AdminDashboard` key handler.
- Updated hotkey tests to verify new numeric mapping and directional action-key detection.
- Validation:
  - `npx eslint src/lib/adminHotkeys.js src/components/admin/AdminDashboard.js src/components/admin/AdminHeader.js tests/admin-hotkeys.test.js`
  - `npm test -- tests/admin-hotkeys.test.js`

---

## 2026-03-19 (cont. 28)

### Codex — extra menu navigation chords + theme toggle hotkey

- Added additional admin action hotkeys in shared contract:
  - `Ctrl+Alt+Right` and `Ctrl+Alt+Down` => next tab
  - `Ctrl+Alt+Left` and `Ctrl+Alt+Up` => previous tab
  - `Ctrl+Alt+T` => theme toggle
- Implemented wrap-around next/prev navigation in `AdminDashboard` key handler.
- Updated `isAdminActionHotkey` to support multi-matcher actions (`match: [...]`) so synonyms can map to one action.
- Updated tests to cover `menuNext` synonyms, `menuPrev` synonyms, and `themeToggle`.
- Theme switcher visual tweak in header:
  - Removed circular background/border styling and switched moon icon to `☾` (plain glyph) to avoid circular look.
  - Kept keyboard focus ring for accessibility.
- Validation:
  - `npx eslint src/lib/adminHotkeys.js src/components/admin/AdminHeader.js src/components/admin/AdminDashboard.js tests/admin-hotkeys.test.js`
  - `npm test -- tests/admin-hotkeys.test.js`

---

## 2026-03-19 (cont. 29)

### Codex — header status indicator + tooltip behavior

- Updated header status control presentation:
  - Moved colored health dot to the right of the status label.
  - Kept button clickable to Health tab.
- Added contextual status tooltip (hover/focus):
  - Shows current health summary text (`green/amber/red` mapping).
  - Includes explanatory hint text for what health status represents.
  - Adds direct “Control check” action button that navigates to Health tab.
- Validation:
  - `npx eslint src/components/admin/AdminHeader.js`

---

## 2026-03-20 (cont. 30)

### Codex — public style revision history + restore

- Added simple revision control for public-facing style settings in shop settings storage:
  - `siteStyle` tokens (colors + heading/body font stacks).
  - `siteStyleHistory` (most recent first, capped at 40, normalized/validated).
  - Automatic revision snapshots when published style changes.
- Extended Admin Style tab to edit/publish site style tokens and restore prior revisions from a history table.
- Added public endpoint `/api/site-style` and client-side style bootstrap in root layout so storefront pages load latest published style (with local cache + refresh).
- Added EN/SV/ES i18n copy for style save/restore/history UX.
- Validation:
  - `npm run lint` (warnings only)
  - `npm test` (pass)
  - `npm run build` (pass)

---

## 2026-03-20 (cont. 31)

### Codex — public storefront performance pass (caching + latency)

- Refactored shared public header auth path to remove server-side session reads from `Header`:
  - Added `HeaderNavClient` to resolve user session on the client via `/api/auth/session`.
  - Kept inventory link behavior for logged-in users and preserved desktop/mobile auth controls.
  - Added memoized menu fetch (`cache(...)`) in `src/lib/menu.js`.
- Catch-all content route performance:
  - Removed explicit `force-dynamic` on `src/app/[...uri]/page.js`.
  - Added cached shared node resolver (`resolveNodeByUri`) used by both `generateMetadata` and page render to avoid duplicate upstream content fetches.
  - Parallelized fallback lookups (`fetchRestFallback` + `fetchCourseFallback`) after `nodeByUri` miss.
- GraphQL request overhead:
  - Changed default `GRAPHQL_DELAY_MS` fallback from `150` to `0` in `src/lib/client.js` and `src/lib/courseAccess.js` (still env-configurable).
  - Expanded debug toggle to support server-side `WORDPRESS_GRAPHQL_DEBUG=1` (with existing `NEXT_PUBLIC_*` fallback).
- Shop latency reduction:
  - Added `listAccessibleCourseUris(...)` in `src/lib/courseAccess.js` to batch access checks.
  - Replaced per-item `hasCourseAccess(...)` fan-out in `src/app/shop/page.js` with the new batched call.
- Media delivery + bootstrap fetch:
  - Re-enabled image optimization in storefront cards/detail by removing `unoptimized` and adding `sizes` in `ShopIndex` and `ShopProductDetail`.
  - Changed layout site-style bootstrap fetch from `cache: 'no-store'` to default cache behavior (`/api/site-style` already serves public cache headers).
- Build output hardening:
  - Made `productionBrowserSourceMaps` opt-in (`PRODUCTION_BROWSER_SOURCEMAPS=1`).

- Local verification snapshots (post-change, `next start`):
  - `/`, `/courses`, `/events`, `/blog` now return `x-nextjs-cache: HIT` with `Cache-Control: s-maxage=1800, stale-while-revalidate=31534200`.
  - `TTFB` for cached public routes dropped to low milliseconds locally (~2–7ms after warmup); `/shop` remains dynamic as expected.

- Validation:
  - `npx eslint` (targeted touched files)
  - `npm test` (pass)
  - `npm run build` (pass)

---

## 2026-03-20 (cont. 32)

### Codex — GraphQL debug default-off + WP production tuning docs

- Switched local runtime default to non-verbose GraphQL logging by setting `.env` `NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG=0`.
- Extended `.env.example` with explicit production-safe GraphQL defaults:
  - `NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG=0`
  - `WORDPRESS_GRAPHQL_DEBUG=0`
  - `GRAPHQL_DELAY_MS=0`
- Updated docs to clarify debugging vs production mode:
  - `docs/README.en.md`: expanded Debugging table and added `wp-config.php` production flags (`WP_DEBUG`, `WP_DEBUG_LOG`, `SCRIPT_DEBUG`, `SAVEQUERIES`, `GRAPHQL_DEBUG` all `false`).
  - `docs/README.sv.md`: same guidance in Swedish.
- Validation:
  - Reviewed targeted diffs only for `.env.example`, `docs/README.en.md`, `docs/README.sv.md`.

---

## 2026-03-20 (cont. 33)

### Codex — added dedicated performance + SEO documentation playbook

- Added new documentation file:
  - `docs/performance-and-seo.md`
- Content covers:
  - Web Vitals targets (LCP/INP/CLS/TTFB) and Lighthouse interpretation.
  - Roundtrip analysis and common bottlenecks (with `/shop` highlighted as current dynamic hotspot).
  - Quantified payload snapshot (HTML transfer samples, JS/CSS/font totals, static image totals) from local current build/start probes.
  - Implemented optimizations already landed in this repo (header auth split, menu cache, catch-all dedupe/parallel fallback, batched access checks, image optimization, source-map opt-in, debug-delay defaults).
  - Directional comparison to plain WordPress (uncached/cached architectural tradeoffs).
  - SEO section covering classic ranking factors, PageRank context, technical SEO already present, and future roadmap tradeoffs.
- Linked the new guide in existing docs indexes:
  - `README.md` detailed documentation table.
  - `docs/README.en.md` (`Focus Guides` section).
  - `docs/README.sv.md` (`Fokuserade guider` section).
- Validation:
  - Manually verified new links and headings render in all three index documents.

---

## 2026-03-20 (cont. 34)

### Codex — welcome performance slide + WP runtime/version probes

- Welcome impress update:
  - Added new `PerformanceGainsSlide` in `src/components/admin/AdminWelcomeTab.js`.
  - Slide includes graphic blocks for:
    - Before/after operations (`GRAPHQL_DELAY_MS` default `150ms -> 0ms`, shop access checks sample `8 -> 1` batch).
    - Local TTFB bar chart snapshot (`/`, `/courses`, `/events`, `/blog`, `/shop`).
    - Transfer mix graphic (JS/fonts vs CSS/HTML emphasis).
  - Inserted slide into the story flow (`story-performance`) and shifted subsequent slide coordinates to keep spacing clean.

- WordPress plugin runtime checks + graphql essentials:
  - Updated plugin version to `1.0.3`:
    - `packages/ragbaz-articulate-plugin/Ragbaz-Articulate.php`
    - `packages/ragbaz-articulate-plugin/package.json`
    - `packages/ragbaz-articulate-plugin/readme.txt` (stable tag/changelog)
  - Added runtime check helpers in plugin:
    - `WP_DEBUG`, `WP_DEBUG_LOG`, `SCRIPT_DEBUG`, `SAVEQUERIES`, `GRAPHQL_DEBUG`
    - Query Monitor active, Xdebug loaded
    - Persistent object cache enabled, OPcache loaded
    - Derived booleans: `debugFlagsOk`, `debugToolsOk`, `okForProduction`
  - Added wp-admin info screen:
    - `Tools -> RAGBAZ Articulate`
    - Minimal table + production summary + GraphQL query snippet.
  - Added GraphQL exposure:
    - New object type: `RagbazWpRuntime`
    - New root fields:
      - `ragbazWpRuntime` (terse runtime essentials)
      - `ragbazPluginVersion` (explicit plugin version)
    - Extended `ragbazInfo` with `wpRuntime`.

- Validation:
  - `npx eslint src/components/admin/AdminWelcomeTab.js` (pass)
  - `php -l` could not run in this environment (`php: command not found`), so PHP syntax check is pending runtime validation in WP environment.

---

## 2026-03-20 (cont. 35)

### Codex — Info tab now surfaces WP runtime safety + cache-readiness with measures

- Extended WP plugin runtime probe to include cache-readiness detail signals:
  - Added fields in `ragbazWpRuntime`:
    - `objectCacheDropInPresent`
    - `redisPluginActive`
    - `memcachedPluginActive`
    - `cacheReadinessOk`
  - Kept existing runtime safety fields (`WP_DEBUG`, `WP_DEBUG_LOG`, `SCRIPT_DEBUG`, `SAVEQUERIES`, `GRAPHQL_DEBUG`, Query Monitor, Xdebug, OPcache, object cache).
  - Updated the wp-admin plugin info screen GraphQL snippet to include the new cache fields.

- Extended `/api/admin/health` runtime probe payload:
  - Health route now requests and forwards the richer runtime object through `checks.ragbazWpRuntime.details.runtime`.
  - Keeps graceful behavior if runtime fields are unavailable on older plugin versions.

- Added a new runtime panel in Admin Info → Overview:
  - File: `src/components/admin/AdminInfoHubTab.js`
  - New section: **WordPress runtime posture**
  - Shows:
    - Plugin version
    - Runtime safety score (`x/7 safe`)
    - Cache readiness score (`x/5 signals`)
    - Detailed breakdown rows for runtime safety flags and cache signals
    - Availability matrix of GraphQL fields (`ragbazInfo`, `ragbazPluginVersion`, `ragbazWpRuntime`, `ragbazInfo.wpRuntime`)
    - Actionable **Measures and next actions** text based on current readings
  - Added “Run check” action directly in this panel.
  - Overview now auto-triggers health check when needed so readings appear without first opening the Health subtab.

- Validation:
  - `npm run lint` (pass; existing unrelated `<img>` warnings remain).
  - PHP runtime lint unavailable in this environment (`php` binary missing).

---

## 2026-03-20 (cont. 36)

### Codex — Root build now copies plugin zip into `ragbaz.xyz/release`

- Updated root build pipeline in `package.json`:
  - Added `postbuild` hook: `npm run plugin:copy` (so `npm run build` now also emits plugin artifacts).
  - Refactored `plugin:copy` to use a dedicated Node script instead of inline shell copy.

- Added `scripts/copy-plugin-zip.mjs`:
  - Verifies source zip exists at `packages/ragbaz-articulate-plugin/dist/Ragbaz-Articulate.zip`.
  - Copies the artifact to both destinations:
    - `public/downloads/ragbaz-articulate/Ragbaz-Articulate.zip`
    - `ragbaz.xyz/release/Ragbaz-Articulate.zip`

- Validation:
  - `npm run plugin:copy` (pass; zip rebuilt and copied to both destinations).
  - Verified resulting files exist in both target paths.

---

## 2026-03-20 (cont. 37)

### Codex — `ragbaz.xyz` now serves tenant draft previews on gifted hex subdomains

- Implemented host-based tenant routing in the nested `ragbaz.xyz` Cloudflare Worker app:
  - `register` (`POST /api/v1/home`) now mints a per-peer `giftKey` (hex) and returns:
    - `account.giftKey`
    - `account.tenantPreviewUrl` (`https://{giftKey}.ragbaz.xyz`)
  - Added persistent gift-key lookup mapping in storage:
    - `home:gift:{giftKey} -> accountId`
  - Host router now resolves `https://{giftKey}.ragbaz.xyz/` to the mapped peer and renders a draft frontend page.

- Added new tenant draft page renderer:
  - File: `ragbaz.xyz/src/lib/pages.js`
  - New export: `renderGiftDraftPage(...)`
  - Draft view includes:
    - Source WordPress URL known from onboarding/heartbeat payload
    - Capability matrix (WPGraphQL, Ragbaz WP plugin bridge, Smart Cache, object cache)
    - Suggested page blueprint for an optimized frontend
    - Generated draft manifest JSON
    - Priority actions based on current runtime/performance recommendations

- Configuration/docs updates in nested repo:
  - `ragbaz.xyz/wrangler.toml` adds `RAGBAZ_TENANT_BASE_DOMAIN`.
  - `ragbaz.xyz/README.md` documents gifted subdomain behavior and API response fields.
  - `ragbaz.xyz/.gitignore` now ignores generated `release/` artifacts.

- Validation:
  - `cd ragbaz.xyz && npm test` (pass, 4/4).
  - Extended test in `ragbaz.xyz/tests/home-api.test.js` now verifies:
    - Gift key + tenant preview URL are returned
    - `https://{gift}.ragbaz.xyz/` returns tenant draft HTML
  - `node -e "import('./src/index.js')..."` smoke check (pass).

- Nested repo commit pushed:
  - `ragbaz.xyz` `master`: `3e54194` — `feat: serve gifted tenant drafts on hex.ragbaz.xyz`

---

## 2026-03-20 (cont. 38)

### Codex — Tenant hosts now expose the same `/admin` surface via proxy under `[tenant_hex].ragbaz.xyz/admin`

- Extended `ragbaz.xyz` host-based tenant routing:
  - For gifted tenant hosts (`{gift_key}.ragbaz.xyz`), requests to:
    - `/admin`
    - `/admin/*`
    - `/api/admin/*`
    are now proxied to a shared upstream admin origin.

- New configuration:
  - `RAGBAZ_TENANT_ADMIN_ORIGIN` (plus fallback aliases `RAGBAZ_ARTICULATE_ADMIN_ORIGIN` / `RAGBAZ_ADMIN_ORIGIN`)
  - Added to `ragbaz.xyz/wrangler.toml` sample vars and documented in `ragbaz.xyz/README.md`.

- Proxy behavior details:
  - Preserves request method/path/query and forwards upstream response body/status.
  - Injects tenant context headers upstream:
    - `x-ragbaz-tenant-gift`
    - `x-ragbaz-tenant-host`
    - `x-ragbaz-tenant-base-domain`
    - `x-ragbaz-tenant-account-id`
  - Adds response marker headers:
    - `x-ragbaz-tenant-proxy: 1`
    - `x-ragbaz-tenant-gift: {gift_key}`
  - If admin origin is not configured, returns a deterministic `501` for tenant admin routes.

- Validation:
  - Extended `ragbaz.xyz/tests/home-api.test.js` with:
    - `tenant hex host proxies /admin to configured admin origin`
  - `cd ragbaz.xyz && npm test` passes (5/5).

- Nested repo commit pushed:
  - `ragbaz.xyz` `master`: `94b91b5` — `feat: proxy tenant hex admin paths to shared admin origin`
