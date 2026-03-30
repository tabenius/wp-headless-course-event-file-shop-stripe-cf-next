# Claude + Codex Co-Working Log

## 2026-03-30 (Codex) — welcome panel rebuilt to reality-first control room (no impress slides)

### Codex — removed onboarding story deck and aligned Welcome with current admin state

**Delivered:**
- Replaced the large `AdminWelcomeTab` story/impress slideshow implementation with a compact reality-based control panel:
  - direct quick links to active tabs,
  - live snapshot rows based on current loaded admin data (WP content counts, catalog count, users, tickets, upload backend, health status),
  - docs context links retained.
- Removed Welcome story mode plumbing from `AdminDashboard`:
  - no `showStory`/`hideStory`/`replayStory` flow,
  - no full-bleed story layout branch,
  - feedback strip now behaves consistently on Welcome like other tabs.
- Dropped stale impress-specific CSS leftovers in `src/app/admin/admin.css` (`.impress-enabled` overflow branch + `.welcome-story-force-white`) to prevent hidden story-era style coupling.
- Styling direction for Welcome now avoids custom accent gradients/hardcoded palette blocks and stays within admin theme surfaces/utilities.

## 2026-03-30 (Codex) — events UX pass: clear passed-state + home upcoming-only

### Codex — aligned event list behavior with date intent on `/events` and `/`

**Delivered:**
- `/events`: event cards now visibly flag passed events with a high-contrast status pill (`Passed` / `Passerat` / `Finalizado`) and subtle passed-state styling.
- `/events`: ordering now prioritizes upcoming events first and moves passed events after upcoming ones.
- Home event list: now strictly filters to upcoming events only (events with ended dates are excluded; undated fallback items are no longer shown as upcoming).
- Added shared date helpers in `src/lib/eventDates.js`:
  - `isEventUpcoming(event, now?)`
  - `isEventPassed(event, now?)`
- Added i18n key parity for passed-state label in EN/SV/ES (`common.eventPassed`).

## 2026-03-30 (Codex) — real-data-only GraphQL availability logging guard + build/protocol warnings

### Codex — kept static pages safe while preserving real GraphQL telemetry from dynamic contexts

**Delivered:**
- Kept `GRAPHQL_AVAILABILITY_AUTO_RECORD` gated off-by-default in `src/lib/client.js`.
- Hardened request-context gating for GraphQL availability ingestion:
  - logging now fails closed when request context is unknown (no ALS store),
  - static generation and ISR revalidation contexts are explicitly excluded.
- Added build-time warning in `scripts/build-with-lock.mjs` when `GRAPHQL_AVAILABILITY_AUTO_RECORD=1` is present.
- Updated `AGENTS.md` protocol with a mandatory warning rule:
  - before enabling `GRAPHQL_AVAILABILITY_AUTO_RECORD=1`, agents must warn both user and peer agent in coop, and treat it as temporary diagnostics only.
- Rejected synthetic probe ingestion path for now to keep GraphQL availability logs based on real GraphQL call data only.

## 2026-03-30 (Codex) — fix static→dynamic runtime error on `/` from GraphQL availability KV reads

### Codex — made availability settings reads static-safe and isolated logging from static/ISR renders

**Delivered:**
- Added configurable KV read options in `src/lib/cloudflareKv.js` via:
  - `readCloudflareKvJsonWithOptions(key, { cacheMode, revalidateSeconds })`
  - existing `readCloudflareKvJson(key)` now delegates to the default (`no-store`) path for backward compatibility.
- Updated `src/lib/graphqlAvailability.js` to read availability settings/temp-window keys through cached/static-safe reads (`force-cache` + bounded revalidate) instead of hard `no-store`.
- Added an island-style guard in `src/lib/client.js`:
  - availability datapoints are not recorded during static generation / ISR revalidation request contexts (`globalThis.__openNextAls` store checks),
  - prevents telemetry side-effects from turning static page renders dynamic.

**Validation:**
- `npx eslint src/lib/cloudflareKv.js src/lib/graphqlAvailability.js src/lib/client.js` (pass)
- `npm run cf:build` (pass; `/` remains static in route output, no static-to-dynamic error during build path)

## 2026-03-30 (Codex) — docs follow-up: always-visible cache copy button + refresh impact guidance

### Codex — corrected usability gap in /docs performance page (ragbaz.xyz)

**Delivered (in `ragbaz.xyz` repo):**
- Moved the cache-refresh command card (with copy button) to render outside the collapsible mermaid block so it is visible without opening the diagram.
- Added an explicit section in EN/SV/ES explaining impact tradeoffs:
  - refresh now vs waiting for TTL,
  - user-facing consistency impact,
  - backend load implications.
- Deployed and verified live markers on `/docs/en/performance-explained`:
  - `Impact of refresh now vs waiting for TTL`
  - `Cache refresh command (WP-CLI)` visible above `Mermaid diagram`.

**Release:**
- `ragbaz.xyz` commit: `4751195`
- Worker version: `ddab87cb-f017-483d-b169-af44b403593e`

## 2026-03-30 (Codex) — docs cache-timing update + mermaid + cache-refresh action (ragbaz.xyz)

### Codex — updated multilingual /docs guidance with concrete cache rules and deployed to ragbaz.xyz

**Delivered (in `ragbaz.xyz` repo):**
- Enhanced `performance-explained` docs (EN/SV/ES) with explicit default cache timings and rules:
  - GraphQL edge cache `60s` + `120s` stale,
  - menu snapshot `5m`,
  - menu URI existence `5m`,
  - sitemap cache `10m`,
  - GraphQL probe cache `15m`,
  - `/shop` ISR `300s`, and note about common `1800s` content revalidation.
- Replaced the simple weekly-loop mermaid with a clearer cache + web-vitals flow diagram.
- Added a copyable cache-refresh action adjacent to the mermaid diagram (`wp cache flush && wp transient delete --all`) so readers can execute refresh directly from docs context.
- Expanded `technical-manual` (EN/SV/ES) with a cache matrix + invalidation rules section and explicit `Server-Timing` diagnostics guidance (`app_ms`, `wp_ms`, `menu_ms`).
- Updated docs rendering to support per-article diagram actions in `renderDocsMermaid`.

**Release:**
- Committed/pushed in `ragbaz.xyz`: `0a4c96d`.
- Deployed to Cloudflare Workers; version `21b5a3cc-a70f-4f29-8045-b0b121dfff5f`.
- Verified live at `/docs/en/performance-explained` (new cache section + cache-refresh command present).

## 2026-03-30 (Codex) — worker Server-Timing diagnostics (`app_ms`, `wp_ms`, `menu_ms`)

### Codex — added lightweight response timing headers for production TTFB diagnosis (commit pending)

**Delivered:**
- Added request-scoped timing accumulator helper:
  - `src/lib/serverTiming.js`
  - stores per-request aggregates in CF request context (`ctx.__ragbazTiming`) when available.
- Instrumented GraphQL client latency:
  - `src/lib/client.js` now records aggregate upstream WordPress GraphQL time as `wp_ms` (+ `wp_count`).
- Instrumented navigation resolution latency:
  - `src/lib/menu.js` now records `getNavigation()` wall time as `menu_ms` (+ `menu_count`) including snapshot/fallback paths.
- Extended CF worker post-build patching:
  - `scripts/patch-cf-worker.mjs` now injects a tiny `Server-Timing` header emitter into `.open-next/worker.js`.
  - Header now includes:
    - `app_ms` total worker handling time,
    - `wp_ms` aggregate WordPress GraphQL latency during request,
    - `menu_ms` menu resolution time.
  - Preserves existing `Server-Timing` values if present by appending.

**Validation:**
- `npm run lint` (pass; existing warnings only)
- `npm run cf:build` (pass; patch step logs `added server-timing response headers`)

## 2026-03-30 (Codex) — TTFB stabilization pass: non-blocking menu cold path + restore ISR defaults

### Codex — removed global forced-dynamic rendering and de-risked header menu fetch path (commit pending)

**Delivered:**
- Changed root layout from forced dynamic (`dynamic = "force-dynamic"`, `revalidate = 0`) back to Next.js default route behavior so ISR/static can work where safe instead of penalizing all routes.
- Refactored `src/lib/menu.js` to reduce cold-request blocking:
  - menu URI existence checks are now non-blocking by default when sitemap cache is cold (`MENU_NON_BLOCKING_URI_EXISTENCE=1` default fail-open),
  - added background-only sitemap warmup path,
  - added throttled background menu snapshot refresh (`MENU_COLD_START_BG_REFRESH=1`, `MENU_REFRESH_MIN_INTERVAL_MS`) so first request returns quickly while refresh happens asynchronously,
  - extracted shared upstream/fallback builders to keep the blocking path minimal.
- Kept a strict fallback path available by env toggle: disabling cold-start background refresh reverts to synchronous fetch path.

**Validation:**
- `node --test tests/menu.test.js` (pass)
- `npm run lint` (pass; existing warnings only)
- `npm run cf:build` (pass; `/shop` shows ISR `Revalidate 5m`, middleware deprecation warning unchanged)

## 2026-03-30 (Codex) — storefront suspense + full-page skeleton loading pass

### Codex — implemented broad storefront loading skeleton architecture (commit pending)

**Delivered:**
- Added reusable storefront skeleton primitives/components in:
  - `src/components/common/StorefrontSkeletons.js`
  - variants: article, list, grid, detail, home (all with pulsing header/image/body placeholders).
- Added global skeleton styling in `src/app/globals.css`:
  - `.storefront-skeleton` + shimmer/pulse animation.
- Added route-level loading boundaries (`loading.js`) so full page transitions show skeleton mocks immediately:
  - `/` (`src/app/loading.js`)
  - catch-all content (`src/app/[...uri]/loading.js`)
  - `/blog`, `/category/[...slug]`, `/tag/[...slug]`
  - `/courses`, `/events`
  - `/shop`, `/shop/[slug]`
- Added nested Suspense boundaries on key storefront routes so shell can stream while data fetches:
  - `src/app/page.js` (home events + home content split)
  - `src/app/[...uri]/page.js` (content resolver wrapped)
  - `src/app/blog/page.js`
  - `src/app/category/[...slug]/page.js`
  - `src/app/tag/[...slug]/page.js`
  - `src/app/courses/page.js`
  - `src/app/events/page.js`
  - `src/app/shop/page.js`
  - `src/app/shop/[slug]/page.js`

**Validation:**
- Targeted eslint on all changed pages/loading/components (pass)
- `npm run cf:build` (pass; existing middleware/proxy deprecation warning unchanged)

## 2026-03-30 (Codex) — products UI thumbnail size pass

### Codex — made thumbnails visible in product list and enlarged detail thumbnails (commit pending)

**Delivered:**
- Updated Products → list rows to always render a thumbnail preview when available (WooCommerce/LearnPress/Events/shop items), with a robust fallback icon if missing/broken.
- Increased product-list row visual height (about 2x compared to prior compact rows) to accommodate the thumbnail and improve scanning.
- Increased title/meta readability in list rows to match the new denser visual layout.
- Doubled detail header thumbnail size for:
  - selected WordPress item detail card
  - selected shop/download product detail card
- Extended `ImagePickerButton` with a `sizeClass` prop so image picker sizing can be controlled per context.

**Validation:**
- `npx eslint src/components/admin/AdminProductsTab.js` (pass; existing `@next/next/no-img-element` warning only)

## 2026-03-30 (Codex) — BUGS follow-up: admin loading placeholders + status tooltip persistence

### Codex — implemented the latest two BUGS.md items (commit pending)

**Delivered:**
- Replaced generic `Loading…` fallbacks in admin tab Suspense boundaries with tab-shaped skeleton placeholders (`AdminSuspenseFallback`) for:
  - Welcome, Media, Products, Support, Sales, Style, Info, Chat.
- Added skeleton variants (`split`, `metrics`, `style`, `chat`) so placeholder structure matches expected panel layouts and improves perceived readiness/FCP.
- Fixed header status tooltip interaction so actions remain usable without hover fragility:
  - tooltip now supports click-pinning,
  - closes on outside click or `Esc`,
  - no longer collapses immediately on focus transitions.
- Updated `BUGS.md` by marking both corresponding items as complete:
  - admin suspense placeholder feature
  - status tooltip persistence bug

**Validation:**
- `npx eslint src/components/admin/AdminDashboard.js src/components/admin/AdminHeader.js` (pass)
- `npm run cf:build` (pass; existing middleware deprecation warning remains)

## 2026-03-29 (Codex) — header ticker + account pill + feedback strip compaction

### Codex — moved stats ticker into main header row and made account/logout always visible (commit pending)

**Delivered:**
- Moved the admin stats ticker from a dedicated second header row into the center of the main header bar (`AdminHeader`), preserving the existing rolling ticker feed and cadence.
- Added a visible actionable account pill in the main header that:
  - fetches current admin session identity from `GET /api/admin/session`,
  - shows the logged-in admin email (with truncation),
  - exposes one-click logout directly in the pill.
- Kept the previous logout paths intact (drawer entry + `Ctrl+Alt+L`) while adding localized account/logout labels for EN/SV/ES.
- Relocated UI feedback controls out of the main content stack into a compact strip directly below the header (the previous ticker area), and tightened spacing/padding for denser flow.
- Added header/feedback strip CSS tokens and classes (`admin-header-ticker-inline`, `admin-header-account-pill`, `admin-feedback-strip`) to keep styling consistent with the current admin theme.

**Validation:**
- `npm run lint` (pass; existing warnings only)
- `npm run cf:build` (pass)

## 2026-03-29 (Codex) — admin header status control clarification fix

### Codex — switched pre-check header state to unknown + actionable translated tooltip (commit `d8e9b7d`)

**Delivered:**
- Changed admin header status semantics so it no longer shows red before any health check has run:
  - `deriveHealthStatus(null|empty) -> "unknown"` in `AdminDashboard`
  - header default state now `unknown` with gray dot.
- Added a header-triggered health-check action path:
  - header emits `admin:runHealthCheck`
  - dashboard listens and runs `runHealthCheck()` without requiring a manual tab visit first.
- Fixed status tooltip interaction so it is actually actionable:
  - moved hover visibility ownership to the wrapper (button + popover) so the popover no longer disappears when moving cursor from button to tooltip.
- Updated tooltip UX copy and actions:
  - unknown-state explanatory hint,
  - translated buttons: `Run now` and `Open checks`.
- Added/updated i18n keys in EN/SV/ES for:
  - `healthStatusUnknown`
  - `healthTooltipHint`
  - `healthTooltipHintUnknown`
  - `healthRunNow`
  - `healthOpenChecks`

**Validation:**
- `npm run lint` (pass; existing warnings only)
- `node --experimental-test-module-mocks --test tests/i18n-admin-parity.test.js` (pass)
- `npm run cf:build` (pass)

## 2026-03-29 (Codex) — secret/env tab continuation after sales-trend verification

### Codex — verified sales trend is live and completed secret/env tab (commit `2ddf156`)

**Verification first (requested):**
- Confirmed sales trend diagram is already implemented and wired:
  - component: `src/components/admin/SalesTrendChart.js`
  - helpers: `src/components/admin/salesTrendHelpers.js`
  - integration: `src/components/admin/AdminSalesTab.js`
  - tests: `tests/sales-trend-chart.test.js`
- Marked BUGS entry as done for the sales trend feature.

**Delivered (Secret/Env continuation):**
- Added shared admin env catalog with expanded coverage (including previously missing vars like `CF_KV_NAMESPACE_ID`) in:
  - `src/lib/adminEnvCatalog.js`
- Extended env-status endpoint to:
  - source values from real env first, then KV overrides,
  - return source/override metadata per variable,
  - use unified catalog groups.
  - file: `src/app/api/admin/env-status/route.js`
- Added KV-backed secret/env override API with admin password confirmation:
  - `GET/POST /api/admin/settings/secrets`
  - file: `src/app/api/admin/settings/secrets/route.js`
- Extended settings store for generic env overrides:
  - `readEnvOverrides`, `saveEnvOverride`
  - file: `src/lib/adminSettingsStore.js`
- Added a new **Secret** section in Info hub navigation and full panel UI:
  - file: `src/components/admin/AdminSecretsPanel.js`
  - wired in `src/components/admin/AdminInfoHubTab.js`
  - supports known variables + custom env names, per-row save/clear, password-confirmed writes, and show/hide controls.
- Updated Storage → Environment table visibility behavior:
  - all set variables now support show/hide toggling in the table.
- Added i18n keys for EN/SV/ES for the new Secret UI copy.
- Marked BUGS entry as done for the “new secret tab + password confirmation + fill missing env vars” feature.

**Validation:**
- `npm run lint` (pass; existing warnings only)
- `node --experimental-test-module-mocks --test tests/i18n-admin-parity.test.js tests/sales-trend-chart.test.js` (pass)
- `npm run cf:build` (pass)

## 2026-03-29 (Codex) — admin responsiveness + docs-help cleanup stabilization

### Codex — immediate admin loading feedback, hotkey/help cleanup, and compatibility fixes (commit `ecbf5ad`)

**Delivered:**
- Added route-level admin loading shell for immediate visual feedback while admin page/data hydrate:
  - new `src/components/admin/AdminLoadingShell.js`
  - new `src/app/admin/loading.js`
  - `src/app/admin/page.js` now dynamically imports `AdminDashboard` with loading fallback.
- Removed duplicated context-help rendering in admin:
  - removed global `<AdminDocsContextLinks />` banner injection from `AdminDashboard` (each tab keeps its own context links).
  - removed extra field-level `?` helper in Sales filter row to avoid duplicate “Need help?” surfaces.
- Simplified `AdminFieldHelpLink` behavior:
  - removed non-working `F1`/`?` key hint and related key handlers, keeping clear click/open behavior only.
- Landed short-term stability fixes tied to current failing checks:
  - restored `themeToggle` in `src/lib/adminHotkeys.js` so hotkey test contract passes.
  - fixed ESM test import compatibility by replacing path-alias imports in Stripe settings/payment helpers with local relative imports (`stripePayments.js`, `stripe.js`, `adminSettingsStore.js`).
  - expanded ESLint ignore set to skip hidden tool directories (`.*/**`) and avoid OOM scan regressions.
- Kept `src/middleware.js` (edge middleware) as compatibility path for OpenNext Cloudflare builds; documented why in-session.
- Marked the three newly reported BUGS entries as completed in `BUGS.md`:
  - in-context helper hotkey mismatch,
  - overly generic helper behavior,
  - duplicated Sales “Need help?” block.

**Validation:**
- `npm run lint` (pass; existing warnings only).
- `node --experimental-test-module-mocks --test tests/admin-hotkeys.test.js tests/stripe-payments.test.js` (pass).
- `npm run cf:build` (pass; OpenNext + worker patch complete).

## 2026-03-29 (Codex) — admin/storefront CSS separation

### Codex — moved admin styling to route-scoped stylesheet (commit `c05ae2d`)

**Delivered:**
- Created `src/app/admin/admin.css` and moved all admin-only selectors there:
  - admin layout shell/reset (`.admin-layout`, `main:has(.admin-layout)`),
  - admin token and surface mappings,
  - admin header chrome and ticker animation.
- Removed those admin blocks from `src/app/globals.css` so global stylesheet is now storefront/base-focused.
- Updated `src/app/admin/layout.js` to import `./admin.css` so admin styles are loaded only on admin routes.
- Removed unused admin font import wiring in `admin/layout.js` while keeping `AdminThemeWrapper` behavior intact.

**Validation:**
- `npm run lint` (pass; existing warnings only).

## 2026-03-29 (Codex) — admin UI standardization follow-up

### Codex — simplify header chrome + fix form-state styling leaks (commit `dd9e2e1`)

**Delivered:**
- Removed textured/ornamental admin header surface treatment to keep the top bar visually standard and calmer.
- Switched admin typography from monospaced display to standard sans-serif defaults for better readability/scannability.
- Fixed admin form-control selector so only text-like inputs are force-styled; checkboxes/radios now keep proper native semantics and checked-state clarity.
- Strengthened Products visibility list state differentiation by adding explicit left-border state markers on selected rows.

**Validation:**
- `npm run lint` (pass; existing warnings only).

## 2026-03-28 (Codex) — admin UI stabilization (remove purple + stop storefront CSS bleed)

### Codex — neutral admin palette + CSS scope hardening (commit `93f0a39`)

**Delivered:**
- Scoped storefront-only styling away from admin in `src/app/globals.css`:
  - dark-mode storefront rules now gated behind `body:not(:has(.admin-layout))`,
  - global CTA button rule now excluded from admin (`body:not(:has(.admin-layout)) :where(button, ...)`),
  - storefront icon/button rules are no longer applied when admin layout is present.
- Simplified admin theme override layer by removing the broad purple/violet/fuchsia remap block and reducing hidden class-level style coercion.
- Shifted admin token accents/docs pills to neutral slate/gray for clearer standard UI behavior and improved readability.
- Replaced hardcoded admin `purple/violet/fuchsia/indigo` utility classes with neutral `slate` variants across key admin surfaces:
  - Products, Media Library, Sales, Style, Info, Welcome, GraphQL panel, image generation/upload, R2 panels, and related helpers.
- Removed remaining purple category metadata in derivation operation registry (`effects` now uses `slate`).

**Validation:**
- `npm run lint` (pass; existing warnings only: manual stylesheet include in layout + expected `<img>` warnings in admin image-heavy surfaces).

## 2026-03-28 (Codex) — build mode upstream bypass for rate-limited WordPress/Varnish

### Codex — default build-time upstream skip (`SKIP_UPSTREAM_DURING_BUILD=1`) (commit `4aec6dc`)

**Delivered:**
- Added `src/lib/buildUpstreamGuard.js` with:
  - `isBuildPhase()`
  - `shouldSkipUpstreamDuringBuild()` (default enabled in build phase unless explicitly set to `0`/`false`)
- Updated `src/lib/client.js` so `fetchGraphQL()` returns early during build when skip mode is active, preventing all build-time GraphQL upstream calls.
- Updated `src/lib/menu.js` to bypass WordPress sitemap/URI existence probing and GraphQL menu fetch during build-skip mode; falls back to local `site.navigation` + ensured core links.
- Updated `src/app/page.js` to render setup fallback during build-skip mode instead of attempting upstream-backed homepage resolution.
- Documented new flag in `.env.example` (`SKIP_UPSTREAM_DURING_BUILD=1`) and README configuration table.

**Validation:**
- `npx eslint src/lib/buildUpstreamGuard.js src/lib/client.js src/lib/menu.js src/app/page.js`
- `node --check` on the same files

## 2026-03-28 (Codex) — admin runtime hook-safety pass (TDZ-adjacent risk sweep)

### Codex — removed stale-callback/exhaustive-deps suppressions in admin UI (commit `71a8f1d`)

**Delivered:**
- `src/components/admin/ImageGenerationPanel.js`:
  - Replaced mount-only prompt-generation effect suppression with dependency-safe effect (`initialPrompt`, `description`, `generatePrompt`) plus one-shot ref guard (`hasAutogeneratedPromptRef`) to avoid repeated generation loops.
- `src/components/admin/AdminProductsTab.js` (`PriceAccessForm`):
  - Replaced suppressed auto-save effect with latest-callback ref pattern (`latestSaveUnifiedRef`) so `autoSaveTrigger` executes the freshest `saveUnified` function without stale closure risk or dependency suppression.

**Validation:**
- `npx eslint src/components/admin/ImageGenerationPanel.js src/components/admin/AdminProductsTab.js --rule "react-hooks/exhaustive-deps: 1" --rule "no-use-before-define: [2, {\"functions\": false, \"classes\": true, \"variables\": true}]"`
- `node --check src/components/admin/ImageGenerationPanel.js src/components/admin/AdminProductsTab.js`

## 2026-03-28 (Claude) — shop catalog split + image pipeline defaults

### Claude — shop catalog split (commits `bf6b170`..`c712a86`)

**Delivered:**
- Aligned `SHOP_CATALOG_CACHE_TTL_MS` default from 120s to 300s to match ISR revalidation, eliminating unnecessary GraphQL refetches within an ISR cycle.
- Replaced disabled "Checking…" button with pulsing skeleton pill (`animate-pulse`) in `ShopIndex.js` for lighter ownership loading state.
- Added `GET /api/admin/cache-info` endpoint returning ISR, catalog, GraphQL edge, and SWR cache TTL values.
- Added Cache Configuration section to admin Info tab (`AdminInfoHubTab.js`) displaying cache TTLs in a read-only table.

### Claude — image pipeline defaults (commits `b0b8c2f`..`a57a1fc`)

**Delivered:**
- Created `src/lib/uploadPipeline.js` with pure helpers (`shouldSkipPipeline`, `buildVariantDefs`, `buildVariantFilename`) and `runUploadPipeline` orchestration function.
- Auto-generates WebP compressed + responsive variants (sm 50%, md 100%, lg 150%) on admin image upload.
- Skip conditions: non-image MIME, GIF, <320px either dimension. Already WebP/AVIF sources skip format conversion but still get responsive sizes.
- Wired pipeline into all three upload backends (R2, S3, WordPress) in `route.js`. Best-effort: variant failures don't block the original upload response.
- Variants registered via existing `registerUploadedAsset` and returned in `variants` array in upload response.

**Validation:**
- `node --test tests/shop-catalog-split.test.js tests/upload-pipeline.test.js` — 19 tests, all pass
- Branch: `feat/shop-catalog-image-pipeline` (9 commits, ready for merge)

**Specs and plans:**
- `docs/superpowers/specs/2026-03-28-shop-catalog-split-design.md`
- `docs/superpowers/specs/2026-03-28-image-pipeline-defaults-design.md`
- `docs/superpowers/plans/2026-03-28-shop-catalog-split.md`
- `docs/superpowers/plans/2026-03-28-image-pipeline-defaults.md`

## 2026-03-28 (Claude) — font laboratory review + sales trend chart

### Claude — font laboratory review (commit on main)

**Delivered:**
- Added "Vintage" typography theme preset to `typographyThemes.js` (Playfair Display, Cormorant Garamond, Lora — all variable, warm old-style serifs).
- Added collapsible CSS panel per font role card in `AdminStyleTab.js` showing `@font-face` declaration and Google Fonts CDN URL with copy buttons.
- Added cross-role font awareness to `AdminFontBrowserModal.js`: accepts `usedFonts` prop, shows role badges (e.g., "Display", "Heading") next to fonts already used by other roles.

### Claude — sales trend chart (commit `5d81dc3`)

**Delivered:**
- Created `salesTrendHelpers.js` with pure data processing helpers: `dominantCurrency`, `aggregateDailyRevenue`, `computeSMA`, `computeRSI`.
- Created `SalesTrendChart.js` — compact SVG chart rendering daily revenue over last 365 days with MA20 (indigo) and MA200 (gray dashed) moving average overlays, quarter markers (Q1–Q4), and RSI-14 oscillator with 75/25 reference lines.
- Integrated chart into `AdminSalesTab.js` between metric cards and payment table.
- No external charting libraries — pure SVG matching existing `StatsChart.js` pattern.

**Validation:**
- `node --test tests/sales-trend-chart.test.js` — 14 tests, all pass
- `npx next build` — clean build

**Specs and plans:**
- `docs/superpowers/specs/2026-03-28-font-laboratory-review-design.md`
- `docs/superpowers/specs/2026-03-28-sales-trend-chart-design.md`
- `docs/superpowers/plans/2026-03-28-sales-trend-chart.md`

## 2026-03-28 (Codex) — follow-up 3→6 batch after settings + ownership hardening

### Codex — shop catalog cache + asset-variant storefront rendering (commits `d82f886`, `518ea57`)

**Delivered:**
- Added short-lived aggregated shop cache (`SHOP_CATALOG_CACHE_TTL_MS`) in `src/lib/shopProducts.js` so repeated catalog assembly (WP + KV + settings) reuses server-side results between refresh windows.
- Extended asset persistence in `src/lib/avatarFeedStore.js` to keep variant history (`variants`) instead of only the last uploaded source, while still exposing a single preferred `source`.
- Wired asset-mode digital products to resolve stored asset variants and expose `imageSources` to storefront rendering.
- Updated `src/components/shop/ShopIndex.js` image rendering to use a width-aware loader over responsive variants (`sm/md/lg`) when available, with safe fallback to single-source image URLs.

**Validation:**
- `npx eslint src/lib/avatarFeedStore.js src/lib/shopProducts.js src/components/shop/ShopIndex.js`
- `node --check` on the same files

### Codex — font payload trimming + performance budget gate scaffold (commits `518ea57`, `e63a825`)

**Delivered:**
- Added core-weight font CSS mode in `src/app/api/site-fonts/route.js` backed by new helpers in `src/lib/downloadedFonts.js`:
  - `parseFontWeightList`
  - `getAllFontFaceCss(..., { trimToWeights })`
- Added tests for font-weight parsing/trimming in `tests/downloadedFonts.test.js`.
- Added bundle budget script `scripts/check-performance-budgets.mjs` and npm script `npm run perf:budget`.
- Documented new knobs and status updates in `.env.example`, `README.md`, and `docs/performance-and-seo.md`.

**Important push note:**
- Directly committing workflow-file updates is blocked by current PAT scope (`workflow` permission missing).
- Budget script and docs are pushed; workflow hook change was intentionally reverted in follow-up commit `e63a825` so branch push could proceed.

**Validation:**
- `npx eslint src/lib/downloadedFonts.js src/app/api/site-fonts/route.js scripts/check-performance-budgets.mjs`
- `node --experimental-test-module-mocks --test tests/downloadedFonts.test.js`
- `npm run perf:budget`
- Full suite run observed one existing unrelated failure in `tests/stripe-payments.test.js` (`ERR_MODULE_NOT_FOUND` alias import path issue in that test path); not introduced by this batch.

## 2026-03-27 (Codex) — prioritized 1→5 implementation batch

### Codex — R2 bindings + CF bundle-size migration (commit `1258caa`)

**Delivered:**
- Added Worker-native R2 binding accessor (`src/lib/r2Bindings.js`) and switched storage operations to prefer `R2_BUCKET` binding first, then edge-signed R2 requests, then AWS SDK fallback.
- Updated OpenNext/CF patch scripts:
  - externalized AWS SDK packages from Worker bundle path,
  - deduplicated inlined i18n blobs in generated handler.
- Added R2 bucket binding in `wrangler.jsonc`.

**Validation:**
- `npx eslint src/lib/s3upload.js src/lib/r2Bindings.js scripts/patch-opennext.mjs scripts/patch-cf-worker.mjs`
- `node --check src/lib/s3upload.js src/lib/r2Bindings.js scripts/patch-opennext.mjs scripts/patch-cf-worker.mjs`

### Codex — media/derivation UX hardening (commit `148ccba`)

**Delivered:**
- Fixed async auth callsites in admin media API to await WordPress GraphQL auth correctly.
- Added derivation quick-add operator buttons for common operations.
- Added derivation panel keyboard shortcuts (`Alt+/`, `Alt+N`, `Alt+E`, `Alt+Shift+E`).
- Added i18n keys for new derivation panel controls in EN/SV/ES.

**Validation:**
- `npx eslint src/components/admin/AdminMediaLibraryTab.js src/app/api/admin/media-library/route.js`
- i18n JSON validation for EN/SV/ES.

### Codex — image pipeline defaults + responsive variants (commit `b482c8f`)

**Delivered:**
- Changed derivation default output fallback from JPEG to WebP (`resolveOutputFormat`).
- Enforced non-original upload variant default to `compressed` (instead of `original`) and expanded accepted responsive variant kinds.
- Upgraded `ImageUploader` to save responsive variants (`sm`, `md`, `lg`) from one crop flow while keeping original upload lineage.
- Added UI hint about automatic responsive variants and aligned variant-type messaging.

**Validation:**
- `npx eslint src/components/admin/ImageUploader.js src/lib/photonPipeline.js src/app/api/admin/upload/route.js tests/photon-pipeline.test.js`
- `node --test tests/photon-pipeline.test.js`

### Codex — static `/shop` shell + async ownership enrichment API (commit `ae2bf50`)

**Delivered:**
- Converted `/shop` page to a static catalog shell (`revalidate = 300`) without per-request auth/access gating.
- Added `/api/shop/ownership` POST endpoint that handles:
  - session-aware ownership enrichment,
  - checkout success confirmation/grants,
  - batched WP URI access checks.
- Updated `ShopIndex` to load ownership/checkout state asynchronously on client while keeping purchase flow behavior.

**Validation:**
- `npx eslint src/app/shop/page.js src/components/shop/ShopIndex.js src/app/api/shop/ownership/route.js`

### Codex — tiered settings + WC proxy + Stripe key overrides (commit `80a651d`)

**Delivered:**
- Added KV-backed settings store helper (`src/lib/adminSettingsStore.js`) for:
  - `settings:wc_proxy`
  - `settings:stripe_key_overrides`
- Added admin settings APIs:
  - `GET/POST /api/admin/settings/wc-proxy`
  - `GET/POST/DELETE /api/admin/settings/stripe-keys`
- Added new Info tab section and UI panel (`AdminSettingsPanel`) with progressive tiers:
  - Basic
  - Advanced (WC proxy relay)
  - Developer (Stripe key overrides)
- Wired runtime usage:
  - Stripe key resolution now supports KV overrides with cache,
  - Stripe-dependent admin/receipt/refund/stats/health paths consume the resolved key,
  - Stripe webhook can forward payloads to WC proxy endpoint when enabled.

**Validation:**
- `npx eslint` over all touched settings/stripe/admin route files
- `node --check` on new settings component/store/routes

## 2026-03-27 (Codex)

### Codex — enforced product-name capitalization standard (homepage + docs copy)

**Delivered:**
- Applied user-facing naming standard across rendered copy:
  - `RAGBAZ-Bridge`
  - `RAGBAZ-StoreFront`
- Updated homepage, Articulate overview text, and docs guide copy/diagram labels where these product names are shown to users.
- Kept technical paths/slugs/download URLs unchanged (`/downloads/ragbaz-bridge/ragbaz-bridge.zip`) to avoid breakage.

**Publish:**
- `ragbaz.xyz` commit: `18b714d` (`ui copy: enforce RAGBAZ-Bridge and RAGBAZ-StoreFront capitalization`)
- Deployed worker version: `47fb357a-7074-4f36-a538-0dc2ee162445`

### Codex — continued PRO admin elaboration (boundary + adoption guidance)

**Delivered:**
- Continued the `/articulate` PRO admin documentation with:
  - `OSS vs PRO Admin Boundary (At a Glance)` table (area-by-area OSS scope vs PRO scope),
  - `When Teams Usually Adopt PRO Admin UI` section (practical adoption signals for operators).
- This keeps the edition split explicit at decision-time, not just as a static feature list.

**Publish:**
- `ragbaz.xyz` commit: `183f1bb` (`articulate: add oss/pro admin boundary and pro adoption signals`)
- Deployed worker version: `76facda6-50a8-43be-95f6-6392608bd882`

### Codex — further expansion of PRO storefront admin UI feature detail

**Delivered:**
- Continued elaboration of `/articulate` PRO admin documentation with three additional structured sections:
  - `PRO Admin UI Modules` (module/capabilities/operator-outcome table),
  - `PRO Operator Workflows` (daily ops, campaign/content, incident loops),
  - `Feature Matrix Maintenance` (explicit update discipline to keep OSS/PRO split current).
- Kept this data-driven in `renderArticulatePage` so future feature updates remain centralized and fast to maintain.

**Publish:**
- `ragbaz.xyz` commit: `48c68e8` (`articulate: add pro admin modules, workflows, and update discipline`)
- Deployed worker version: `b1870f0c-6b72-4419-90d9-d0a6ef2a6a8e`

### Codex — expanded PRO storefront admin UI feature documentation

**Delivered:**
- Extended `/articulate` with a more detailed PRO storefront admin UI section:
  - added explicit `PRO Storefront Admin UI (Detailed)` block,
  - documented control-room navigation scope, diagnostics/remediation flow, media/derivation operations, access/commerce controls, storage governance, keyboard ergonomics, role-aware docs/help, and readability/theme controls.
- Kept this tied to the storefront matrix model so updates remain centralized and maintainable.

**Publish:**
- `ragbaz.xyz` commit: `42a90ae` (`articulate: expand pro storefront admin ui feature detail`)
- Deployed worker version: `90e2642b-fc3b-4093-a6ea-0eda4110ee43`

### Codex — Articulate storefront matrix (OSS vs PRO/FULL) + diacritics fix

**Delivered:**
- Expanded `/articulate` with a dedicated storefront feature matrix:
  - clear split between `OSS storefront` and `PRO/FULL storefront`,
  - shared baseline capabilities section,
  - explicit `Feature matrix updated` date stamp for maintenance cadence.
- Added implementation pattern that is easy to keep current:
  - centralized feature lists (`baseline`, `oss`, `pro`) in renderer data structure,
  - single update point for feature-tier changes.
- Fixed SV/ES diacritics across docs content and labels so characters render correctly:
  - Swedish: `åäöÅÄÖ` now appears correctly in docs strings.
  - Spanish accents/ñ restored (e.g. `Español`, `Documentación`, `técnico`, `diagnóstico`, `más`, `qué`).
- Verified live:
  - `/articulate` shows `Storefront Features (OSS vs PRO/FULL)` with both editions.
  - `/docs/sv/changelog` and `/docs/es/changelog` show proper accented characters.

**Publish:**
- `ragbaz.xyz` commit: `e183fa5` (`articulate: add oss vs pro storefront matrix; fix sv/es diacritics`)
- Deployed worker version: `009cef6c-0187-41ab-b987-b4348eced883`

### Codex — Mermaid contrast fix + Ctrl+Alt hotkey restore on ragbaz.xyz docs

**Delivered:**
- Fixed Mermaid readability issue in docs technical manual for darker themes (notably water/fire/aether):
  - added explicit high-contrast Mermaid theme variables at render init based on active CSS theme tokens,
  - added SVG-level Mermaid CSS overrides for text, arrows, arrowheads, node fills, and edge-label backgrounds.
- Fixed `Ctrl+Alt+T` (theme rotate) and `Ctrl+Alt+F` (font rotate) not firing on some keyboard layouts:
  - updated both shared shell and home-page key handlers to allow the hotkeys even when `AltGraph` is reported, while still ignoring unrelated AltGraph combos.
- Verified live technical-manual HTML includes both the new Mermaid contrast selectors and updated hotkey logic.

**Publish:**
- `ragbaz.xyz` commit: `8dd90dd` (`docs ui: fix mermaid contrast and restore ctrl+alt theme/font hotkeys`)
- Deployed worker version: `df8669b4-796a-453e-b893-4187a6d6ae05`

### Codex — changelog expanded + translated (SV/ES) on ragbaz.xyz docs

**Delivered:**
- Expanded weekly changelog narrative to be more descriptive while staying non-technical and user/admin-outcome focused.
- Added full Swedish and Spanish changelog coverage (metadata + article body), removing English-only fallback behavior for this guide.
- Updated docs article metadata so changelog title/summary/audience are localized in EN/SV/ES.
- Verified live pages:
  - `/docs/sv/changelog` (localized title, lead, weekly sections)
  - `/docs/es/changelog` (localized title, lead, weekly sections)

**Publish:**
- `ragbaz.xyz` commit: `1fc8bf6` (`docs changelog: expand weekly narrative and add sv/es translations`)
- Deployed worker version: `d2ab0666-1f85-433c-a90f-3d6a8c2ff7bb`

### Codex — docs safety strip guide submenu (direct document jump)

**Delivered:**
- Extended docs article safety strip so `Guide` (active doc slug, e.g. `changelog`) now has a subtle hover/focus submenu.
- Submenu lists all docs articles and links directly to each guide in the current language.
- Active guide is highlighted (`aria-current="true"`), matching the language submenu behavior.

**Publish:**
- `ragbaz.xyz` commit: `33deddd` (`docs safety strip: add guide submenu for direct doc navigation`)
- Deployed worker version: `93def01e-5617-4c44-b825-47ca7d455987`

### Codex — docs safety strip language submenu (subtle hover)

**Delivered:**
- Updated `ragbaz.xyz/src/lib/pages.js` safety-strip renderer to support optional submenu items per safety cell.
- Wired docs language safety item to show `en/sv/es` as a subtle hover/focus submenu from the `Language en` value.
- Kept `/docs` as a separate direct safety-strip link (`Base /docs`) exactly as before.
- Added matching submenu styles in both page shell style blocks for consistent rendering.
- Verified generated docs HTML includes:
  - `.safety-menu-trigger` with current lang value
  - `.safety-menu-panel` with `en/sv/es` options
  - unchanged `/docs` safety link

**Publish:**
- `ragbaz.xyz` commit: `439ee75` (`docs safety strip: add subtle language hover submenu`)
- Deployed worker version: `bdd73b49-d7d8-49f1-853d-fcc337e91e2f`

### Codex — published weekly changelog on ragbaz.xyz docs

**Delivered:**
- Added docs article `changelog` to `ragbaz.xyz` docs content (`src/lib/pages.js`) and deployed worker.
- Verified live pages:
  - `/docs/en/changelog` shows Weekly Changelog timeline content
  - `/docs` index now links to the changelog article
- Deployment version:
  - `ragbaz-xyz` worker `df2848e8-2701-42f6-8ea1-669348ae74fa`

### Codex — protocol update: changelog uses shared docs lock + helper flow

**Delivered:**
- Updated `AGENTS.md` shared-doc protocol scope to include `docs/CHANGELOG.md`.
- Updated lock example commands to include changelog in acquire/add steps.
- Updated changelog protocol rules to explicitly require the same lock + pull + commit/push + release helper flow for changelog edits.

### Codex — AGENTS protocol update for weekly changelog + ragbaz.xyz publish

**Delivered:**
- Updated `AGENTS.md` protocol with a required changelog workflow:
  - keep `docs/CHANGELOG.md` updated week by week,
  - keep content user/admin-experience focused,
  - publish changelog updates to `ragbaz.xyz` docs whenever changed,
  - treat deploy + live verification as part of changelog completion,
  - log changelog update/publish actions in coop notes.

### Codex — image operator usability pass + new Instagram-style tilt shift

**Delivered:**
- Added new image operator `tiltShift` (Instagram-style radial focus blur) in derivation registry:
  - `centerX`, `centerY`, `focusRadius`, `variance`, `intensity`, `blurRadius`
  - sensible defaults via `buildDefaultParams`
- Implemented `tiltShift` in the photon pipeline using a performant single-blur + radial blend approach:
  - new exported helper `computeTiltShiftBlendFactor(...)`
  - blended original/blurred pixels with smoothstep falloff to keep center sharp and edges blurred
- Expanded derivation editor usability in `AdminMediaLibraryTab`:
  - typed parameter controls for `select` and `color` params
  - color picker + RGB channel editing for object color params
  - explicit bind/unbind actions for operation params
  - operation actions: move up/down, duplicate, remove
  - keyboard step reordering hotkey: `Alt+ArrowUp/Alt+ArrowDown`
  - grouped “Add operation” picker by category with operator icons
- Improved matrix readability for object params (e.g. duotone colors now render as hex values instead of `[object Object]`).
- Added/updated photon pipeline tests for tilt-shift blend math in `tests/photon-pipeline.test.js`.

**Validation:**
- `npx eslint src/components/admin/AdminMediaLibraryTab.js src/lib/photonPipeline.js src/components/admin/DerivationEditor/operationRegistry.js src/lib/mediaLibraryHelpers.js tests/photon-pipeline.test.js` (pass, existing `no-img-element` warning only)
- `node --test tests/photon-pipeline.test.js` (pass)

### Codex — tilt shift linear mode + fast/full preview quality toggle

**Delivered:**
- Extended `tiltShift` operator with mode selector:
  - `mode: radial | linear` (default radial)
  - linear mode preserves a horizontal in-focus band and blurs top/bottom
- Added preview-quality control in derivation apply UI:
  - `Full` (default) and `Fast`
  - request payload now includes `previewQuality`
- Added fast preview optimization in derivation apply route:
  - when `previewQuality=fast`, source image is downscaled to max dimension `1600` before pipeline
  - NDJSON progress now emits `preview_downscale`
  - done event returns `previewQuality` for UI messaging
- Added UI hint when preview was generated in fast mode, warning that output may be downscaled.

**Validation:**
- `npx eslint src/components/admin/AdminMediaLibraryTab.js src/app/api/admin/derivations/apply/route.js src/lib/photonPipeline.js src/components/admin/DerivationEditor/operationRegistry.js` (pass, existing `no-img-element` warning only)
- `node --test tests/photon-pipeline.test.js` (pass)

### Codex — one-click full-quality save flow for derivations

**Delivered:**
- Added one-click action in Media → Derivations:
  - `Apply full-quality and save`
- Refactored apply/save flow in `AdminMediaLibraryTab`:
  - centralized apply runner `runDerivationApply({quality})`
  - shared uploader `uploadDerivedBlobToLibrary(blob, {qualityHint})`
- Added explicit guardrail so `Fast` previews cannot be saved by mistake:
  - regular `Save to library` is disabled when current preview quality is `fast`
  - inline warning explains to use full-quality save path
  - backend upload helper also rejects fast-quality save attempts defensively

**Validation:**
- `npx eslint src/components/admin/AdminMediaLibraryTab.js` (pass, existing `no-img-element` warning only)
- `node --test tests/photon-pipeline.test.js` (pass)

### Codex — derivation operator UI ergonomics pass (collapse/search/reset)

**Delivered:**
- Added operation-card ergonomics for long derivations:
  - per-step `Fold/Open` toggle
  - global `Collapse all` / `Expand all`
  - compact folded summaries that show bound/unbound parameter values
- Added quick per-step editing actions:
  - `Bind` (fill missing params from operator defaults)
  - `Reset` (replace all params with defaults)
- Added add-operation search/filter:
  - search input filters operators by type/label/tip/techTip
  - grouped results remain category-based
  - add button disables when no matching operator is selectable

**Validation:**
- `npx eslint src/components/admin/AdminMediaLibraryTab.js` (pass, existing `no-img-element` warning only)
- `node --test tests/photon-pipeline.test.js` (pass)

### Codex — keyboard shortcuts for focused derivation step actions

**Delivered:**
- Added focused-step keyboard controls in Media derivation editor:
  - `Alt+F` fold/unfold current step
  - `Alt+B` bind missing params from defaults
  - `Alt+R` reset current step to defaults
  - existing `Alt+ArrowUp/Down` step move retained
- Added visible focus ring/highlight on the active operation card.
- Made operation cards focusable (`tabIndex=0`) and track focused index via `onFocusCapture`.
- Updated per-step shortcut hint text to include all supported key combos.

**Validation:**
- `npx eslint src/components/admin/AdminMediaLibraryTab.js` (pass, existing `no-img-element` warning only)
- `node --test tests/photon-pipeline.test.js` (pass)

### Codex — user/admin experience changelog document (weekly timeline)

**Delivered:**
- Added a new high-level weekly changelog document:
  - `docs/CHANGELOG.md`
- Content focus is product/admin experience and major feature outcomes (not code details), using a week-by-week timeline.
- Scope currently summarizes major progress from week of 2026-03-02 through week of 2026-03-23.

### Codex — aether status-pill contrast fix on ragbaz.xyz

**Delivered:**
- Fixed low-contrast status labels in `aether` theme on ragbaz.xyz (affected `good/warn/bad` pills used by labels such as `GraphQL source`, `SSR draft`, `detected`, `missing`, `Fetched (200)`).
- Added explicit `:root[data-theme="aether"] .pill.*` overrides with stronger foreground/background/border contrast in `ragbaz.xyz/src/lib/pages.js`.

**Validation:**
- `node --check src/lib/pages.js` (pass)

**Commit:**
- `ragbaz.xyz` `c686561` — `Improve aether pill contrast for status labels`

**Deploy:**
- Deployed ragbaz.xyz worker (`Version ID: 34901f08-f42f-44a4-8807-93ae0ad0f0bc`).

### Codex — admin in-context docs links/tooltips (EN/SV/ES aware), phase 1

**Delivered:**
- Added locale-aware docs URL helper in main:
  - `src/lib/ragbazDocs.js`
  - language normalization (`en/sv/es`)
  - tab-to-guide context mapping
  - URL generation to `https://ragbaz.xyz/docs/{lang}/{slug}`
- Added reusable admin docs-link UI:
  - `src/components/admin/AdminDocsContextLinks.js`
  - contextual guide chips with tooltips opening ragbaz.xyz docs in a new tab
- Wired links into admin flow:
  - global context row in `AdminDashboard` (shown per active tab)
  - compact in-tab help chips in `AdminMediaLibraryTab`, `AdminProductsTab`, `AdminSupportTab`, and `AdminSalesTab`
- Added EN/SV/ES i18n keys for docs-link labels and tooltip copy:
  - `src/lib/i18n/en.json`
  - `src/lib/i18n/sv.json`
  - `src/lib/i18n/es.json`

**Validation:**
- `node --check` pass for all modified JS files
- i18n JSON parse check pass for EN/SV/ES

**Commit:**
- `main` `bd5e436` — `Add locale-aware admin docs help links with contextual tooltips`

### Codex — admin in-context docs links/tooltips, phase 2 (broader surface + no legacy docs focus)

**Delivered:**
- Extended docs-link integration to additional high-traffic admin surfaces:
  - `AdminStyleTab`
  - `AdminWelcomeTab` (dashboard mode)
  - `ChatPanel`
  - `AdminInfoHubTab`
- Updated Info Hub docs panel to prioritize direct ragbaz.xyz docs cards (localized), removing emphasis on old `/admin/docs` cards per latest direction (no backward-compatibility requirement).
- Added missing localized i18n labels for external docs cards in EN/SV/ES.

**Validation:**
- `node --check` pass for all modified JS files
- i18n JSON parse check pass for EN/SV/ES

**Commit:**
- `main` `01f5297` — `Expand admin docs links across info, style, welcome, and chat`

### Codex — admin field-level docs help links, phase 3

**Delivered:**
- Added reusable field-level `?` helper control for contextual docs:
  - `src/components/admin/AdminFieldHelpLink.js`
- Wired field-level localized help links into high-edit-density forms:
  - `AdminProductsTab` (content/access title, course fee, VAT override, shop visibility)
  - `AdminMediaLibraryTab` (derivation templates title, name/description, applicable types, add operation)
- Added new localized accessibility label key in EN/SV/ES:
  - `admin.docsOpenGuideAria`

**Validation:**
- `node --check` pass for:
  - `src/components/admin/AdminFieldHelpLink.js`
  - `src/components/admin/AdminProductsTab.js`
  - `src/components/admin/AdminMediaLibraryTab.js`
- i18n JSON parse checks pass for EN/SV/ES

**Commit:**
- `main` `55b75df` — `Add field-level docs help links in products and derivations`

### Codex — admin field-level docs help links, phase 4 (sales + support)

**Delivered:**
- Extended inline field-level docs `?` helpers into additional operator-heavy admin tabs:
  - `AdminSalesTab`: email filter control and date-filter controls
  - `AdminSupportTab`: new-ticket section, priority selector, status selector, comments section
- Added missing localized label key used by Sales filter metadata:
  - `admin.dateFilter` in EN/SV/ES

**Validation:**
- `node --check src/components/admin/AdminSalesTab.js` (pass)
- `node --check src/components/admin/AdminSupportTab.js` (pass)
- i18n JSON parse checks pass for EN/SV/ES

**Commit:**
- `main` `a833eca` — `Add field-level docs helpers in sales and support`

### Codex — removed legacy `/admin/docs` routes and re-linked manual sources

**Delivered:**
- Deleted obsolete in-admin documentation routes and renderer components:
  - `src/app/admin/docs/page.js`
  - `src/app/admin/docs/[slug]/page.js`
  - `src/app/admin/docs/[slug]/ArchitectureDiagram.js`
- Updated RAG manual metadata to use direct `ragbaz.xyz/docs/{lang}` targets instead of legacy `/admin/docs` source links:
  - `src/lib/manuals.js`
  - `src/lib/chat/rag.js`
- Added configurable docs base handling in manuals via `NEXT_PUBLIC_RAGBAZ_DOCS_BASE_URL` fallback to `https://ragbaz.xyz/docs`.

**Validation:**
- `node --check src/lib/manuals.js` (pass)
- `node --check src/lib/chat/rag.js` (pass)
- `rg -n "/admin/docs" src` now returns no runtime references.

**Commit:**
- `main` `dab5e74` — `Remove legacy admin docs route and link manuals to ragbaz docs`

### Codex — field-level docs helpers expanded across info/health/stats/style

**Delivered:**
- Added additional field-level `?` docs helpers in System/Info surfaces:
  - `AdminInfoHubTab`: runtime posture, storage backend, upload destination, environment variables, dead-link finder
  - `AdminConnectorsTab`: health-check header + Stripe webhook + plugin install blocks
  - `AdminStatsTab`: top-level stats section + traffic panel
  - `AdminStyleTab`: site-style heading, typography/themes controls, revision history, button-style controls
- Added localized stats helper subtitle key in EN/SV/ES:
  - `admin.statsSubtitle`

**Validation:**
- `node --check` pass:
  - `src/components/admin/AdminInfoHubTab.js`
  - `src/components/admin/AdminConnectorsTab.js`
  - `src/components/admin/AdminStatsTab.js`
  - `src/components/admin/AdminStyleTab.js`
- i18n JSON parse checks pass for EN/SV/ES

**Commit:**
- `main` `c58459f` — `Expand field-level docs helpers across info, health, stats, and style`

### Codex — sandbox/system panel docs helper pass

**Delivered:**
- Added contextual docs guidance to `AdminSandboxTab` so advanced operators have in-place help while handling cache/deploy and diagnostics:
  - Added section-level docs chips in the sandbox header
  - Added field-level `?` helpers for sandbox settings, environment block, recent commits, and recent requests

**Validation:**
- `node --check src/components/admin/AdminSandboxTab.js` (pass)

**Commit:**
- `main` `f21de42` — `Add docs helpers in sandbox system panel`

### Codex — localized helper labels + keyboard docs shortcuts

**Delivered:**
- Localized remaining helper labels in Style/Sandbox surfaces that pair with docs `?` links:
  - `AdminStyleTab`: typography/themes/button-style labels now use i18n keys
  - `AdminSandboxTab`: recent-requests label now uses i18n key
- Added keyboard affordances directly on field-level docs links in `AdminFieldHelpLink`:
  - `F1` and `?` open the linked guide when the `?` control is focused
  - added `aria-keyshortcuts="Shift+Slash F1"`
  - localized tooltip now includes hotkey guidance
- Added EN/SV/ES i18n keys:
  - `admin.docsOpenGuideTooltipFor`
  - `admin.docsOpenGuideHotkeyHint`
  - `admin.styleThemesLabel`
  - `admin.styleButtonStyle`
  - `admin.recentRequests`

**Validation:**
- `node --check` pass:
  - `src/components/admin/AdminFieldHelpLink.js`
  - `src/components/admin/AdminStyleTab.js`
  - `src/components/admin/AdminSandboxTab.js`
- i18n JSON parse checks pass for EN/SV/ES

**Commit:**
- `main` `3284274` — `Localize style/sandbox helper labels and add docs-link hotkeys`

### Codex — ragbaz.xyz tenant draft canonicalization + Mermaid rendering fix

**Delivered (nested repo `ragbaz.xyz`):**
- Canonicalized tenant draft URLs so `/tenant/{domain}/...` now redirects to `/tenant/{domain}` (admin routes remain handled by existing `/tenant/{domain}/admin...` proxy branch).
- Fixed docs diagram rendering by replacing raw Mermaid code blocks with `.mermaid` containers and enabling client-side Mermaid rendering on docs pages.
- Enabled Mermaid only for docs routes via `shell(..., { enableMermaid: true })`.

**Validation:**
- `node --check src/index.js` (pass)
- `node --check src/lib/pages.js` (pass)

**Commit:**
- `ragbaz.xyz` `d990944` — `Canonicalize tenant draft URLs and render docs Mermaid diagrams`

### Codex — ragbaz.xyz docs IA scaffold under /docs (EN/SV/ES)

**Delivered:**
- Added multilingual documentation routes on ragbaz.xyz:
  - `/docs` (default EN index)
  - `/docs/{lang}` where `lang in {en, sv, es}`
  - `/docs/{lang}/{slug}`
  - short EN fallback: `/docs/{slug}`
- Implemented localized docs index + article rendering in `ragbaz.xyz/src/lib/pages.js`.
- Added initial article set required by Option C docs restructure:
  - `quick-start`
  - `product-value` (non-technical features/use-cases/value)
  - `performance-explained` (non-technical speed/usability impact and actions)
  - `technical-manual` (developer + AI-agent extension guidance)
- Added cross-links and discoverability:
  - Default top nav now includes `Docs`.
  - Home page top nav and head-menu include docs entry points.
  - Articulate page CTA now links to `/docs`.
- Added language switchers and mermaid code-block sections in docs pages for flow/hierarchy communication.

**Validation:**
- `node --check src/lib/pages.js` (pass)
- `node --check src/index.js` (pass)

**Commit:**
- `ragbaz.xyz` `4e2e264` — `Add multilingual /docs scaffold with localized guide routes`

**Deploy + live checks:**
- Deployed ragbaz.xyz worker after merge (`Version ID: ea7b88f2-8a2b-40ef-af94-c068e0edf9e2`).
- Verified:
  - `GET https://ragbaz.xyz/docs` -> `200` and docs title rendered.
  - `GET https://ragbaz.xyz/docs/en/quick-start` -> contains expected article content (`Quick Start`, `Copyable command`).

### Codex — ragbaz.xyz global font-theme system (Option C, phase 1)

**Delivered:**
- Implemented a site-wide font-theme system in `ragbaz.xyz/src/lib/pages.js` for both render paths (`shell(...)` and `renderHomePage(...)`) so typography is consistent across all pages.
- Added five named font themes with heading/body pairs and CSS-variable wiring:
  - `elegant`, `formal`, `casual`, `creative`, `contemporary`.
- Added a global font selector (`Font`) in the top controls next to the elemental theme selector.
- Added persisted font preference (`localStorage` key: `ragbaz_home_font_theme`) and keyboard rotation hotkey `Ctrl+Alt+F` (theme hotkey `Ctrl+Alt+T` retained).
- Kept typography change purely presentation-level (no API/data path changes).

**Validation:**
- `node --check src/lib/pages.js` (pass)

**Commit:**
- `ragbaz.xyz` `82aefe5` — `Add global font themes with persisted selector and hotkeys`

### Codex — storefront dark-mode submenu contrast + locale fix + stronger admin cache purge

**Delivered:**
- Fixed unreadable storefront submenus in dark mode by introducing explicit dark-surface classes and overrides for:
  - desktop dropdown panels/links (`storefront-nav-dropdown*`),
  - mobile menu panel/links/hamburger lines (`storefront-mobile-nav-*`).
- Fixed homepage events heading locale drift on storefront routes:
  - admin locale persistence (`ragbaz-admin-locale`) now applies only on `/admin*`,
  - storefront pages now fall back to site/default locale instead of inheriting admin language preference.
- Improved cache controls and purge effectiveness:
  - removed global `force-dynamic` from layout and catch-all route, while forcing request-bound rendering for paid/session paths only (`noStore()` in `src/app/[...uri]/page.js`).
  - added cache epoch invalidation (`src/lib/storefrontCache.js`) wired into GraphQL edge cache keying (`src/lib/client.js`).
  - upgraded `/api/admin/purge-cache` to use `requireAdmin`, clear in-memory caches, bump cache epoch, and revalidate key storefront paths.
  - exposed a prominent purge button in the Info section header for faster operator access.

**Validation:**
- `npm run lint` (pass; existing warnings only)
- `npm test` (pass, 25/25)

### Codex — implemented GraphQL roundtrip reduction items (4,3,1,5)

**Delivered:**
- **(4) Sitemap consolidation:** merged sitemap WP content fetches into one primary GraphQL query (`pages + posts + lpCourses`) with a core fallback query (`pages + posts`) when LearnPress types are missing.
  - File: `src/app/sitemap.js`
- **(3) Removed preflight introspection on `/courses`:** dropped `hasGraphQLType("LpCourse")` precheck and switched to optimistic course fetch with graceful fallback UI on query failure.
  - File: `src/app/courses/page.js`
- **(1) Shop core aggregation:** replaced split WooCommerce/LearnPress/Event query path + schema-field introspection with:
  - one combined shop core query in the common case,
  - mode-cached fallback to split legacy queries only when combined shape fails.
  - File: `src/lib/shopProducts.js`
- **(5) Menu source decoupling:** added menu snapshot layer (in-memory + KV-backed best-effort persistence) so public nav can be served from snapshot before hitting WP GraphQL.
  - File: `src/lib/menu.js`
- Updated admin cache purge to clear/purge menu snapshot state as part of cache clear flow.
  - File: `src/app/api/admin/purge-cache/route.js`

**Validation:**
- `npm run lint` (pass; existing warnings only)
- `npm test` (pass, 25/25)

## 2026-03-26 (Codex)

### Codex — home events calendar visibility fixed and re-deployed (version 0.1.1)

**Delivered:**
- Hardened home/events GraphQL compatibility so event rendering no longer depends on stricter schema support:
  - `src/lib/homeEvents.js` now uses compatibility-first querying (`events(first: 50)`), with a minimal fallback query (`id/title/uri`) that still renders widget entries when enriched date fields are unavailable.
  - `src/app/events/page.js` fallback query was reduced to minimal safe fields to avoid empty lists when optional date fields are rejected upstream.
  - Removed fragile optional `date` selections from shared Event fragments to prevent schema-validation breakage on Event detail/list queries.
- Deployed storefront worker after patch.

**Commit:**
- `main` `eba38fe` — `Harden home/events queries for broader WPGraphQL compatibility`

**Deploy verification:**
- `npm run cf:deploy` succeeded.
- Current worker version: `7c8bdc83-8c84-41fc-b36e-2d60dffe44e0`.
- Live HTML checks:
  - `https://xtas.ragbaz.xyz/` includes top calendar section (`calendar_sections=1`) with event links.
  - `https://xtas.ragbaz.xyz/events/` includes explicit date readouts (`aria-label="Event date"`), e.g. `9 mars 2026 11:03–11:03`.

### Codex — event visibility/date pass + storefront version bump to 0.1.1

**Delivered:**
- Removed `Event` schema-introspection gating on homepage events and `/events` page so event rendering no longer depends on WPGraphQL introspection being enabled.
- Added robust event-date normalization/display across storefront event surfaces:
  - new shared helper `src/lib/eventDates.js` reads multiple likely date fields (`startDate`, `date`, etc.),
  - homepage calendar/list now uses normalized dates where available,
  - `/events` cards now show readable event date labels,
  - single event view meta now includes date label when present.
- Bumped storefront package version:
  - `package.json` `version: 0.1.1`
  - `package-lock.json` root/package mirror updated.

**Commits:**
- `45f2204` — `Remove Event introspection gate for home and events pages`
- `191bf8f` — `Show event dates across home calendar and event pages`
- `698b425` — `Bump storefront version to 0.1.1`

### Codex — homepage event-calendar widget hardened (render only when events exist, links to real event URIs)

**Delivered:**
- Kept the homepage event widget at the top of `/` and tightened data shaping so it only renders with valid event entries (requires non-empty `title` + normalized internal `uri`).
- Hardened `fetchHomeEvents()` in `src/lib/homeEvents.js`:
  - normalizes event URIs (absolute WP URLs -> internal paths),
  - filters out malformed event rows,
  - retains fallback query path (`events(first: 50)`) when custom date fields are unavailable,
  - preserves widget visibility when events exist but none are upcoming (falls back to sorted known events instead of returning empty).
- Updated `src/components/home/EventCalendar.js` heading logic:
  - shows `Upcoming Events` when future-dated events exist,
  - falls back to `Events` when only undated/past events are available.

**Commit:**
- `main` `e9060b2` — `Add home event calendar gating and real-event link hardening`

**Verification run:**
- `npx eslint src/lib/homeEvents.js src/components/home/EventCalendar.js src/app/page.js` (pass)
- `npm test -- tests/menu.test.js` (suite invokes full `node --test`; existing unrelated failures remain in `admin-hotkeys`, `downloadedFonts`, `fontDownload`, `googleFontsCatalog` due `mock.module` runtime support in current Node setup)

### Codex — fixed sitemap-based menu validation to support redirects and multiple generators

**Delivered:**
- Updated sitemap discovery in `src/lib/menu.js` to be provider-agnostic and redirect-tolerant.
- Validation now probes multiple root candidates:
  - `/sitemap_index.xml`
  - `/wp-sitemap.xml`
  - `/sitemap.xml`
- Instead of trusting the first non-empty sitemap, it now computes candidate path sets and keeps the richest valid set.
- This prevented false-negative filtering that temporarily reduced nav to `/shop` only when one sitemap endpoint was incomplete.

**Commit:**
- `main` `1bc6e7c` — `Make sitemap menu validation provider-agnostic`

**Verification run:**
- live checks after deploy:
  - `/shop` present
  - `/blog` present
  - `/events` present
  - `/courses` present
  - `/relationsterapi-for-par` present
  - `/om-sofia-cerne-tantra-relationer-coachning` present

### Codex — emergency storefront 500 hotfix for WP URI pages

**Delivered:**
- Resolved live `500 Internal Server Error` regressions on WP-URI storefront pages (example: `/kursen-rora-och-berora/`) by ensuring the catch-all route is fully dynamic at runtime.
- In `src/app/[...uri]/page.js`:
  - enforced runtime rendering (`dynamic = "force-dynamic"`, `revalidate = 0`),
  - removed `generateStaticParams()` export that kept route behavior in static mode.
- Preserved diagnostic logging while avoiding render-time KV/static conflicts:
  - added `persist` option to `appendServerLog` (`src/lib/serverLog.js`),
  - switched storefront render-path log calls to `persist: false` (memory-only/failsafe),
  - switched core GraphQL client error logs to `persist: false` for render-safe behavior.
- Deployed storefront worker after fix and rechecked affected URLs.

**Commit:**
- `main` `3f017e8` — `Fix storefront URI 500 by forcing dynamic route and render-safe server logs`

**Verification run:**
- `npx eslint src/app/[...uri]/page.js src/lib/serverLog.js src/lib/client.js` (pass)
- `npm run build` (pass; route table shows `ƒ /[...uri]`)
- `npm run cf:deploy` (pass; current deployed version `3b511d92-bfe1-476f-8841-09dcb3e645a1`)
- live checks:
  - `https://xtas.ragbaz.xyz/` → `200`
  - `https://xtas.ragbaz.xyz/kursen-rora-och-berora/` → `200`
  - `https://xtas.ragbaz.xyz/om-xtas/` → `404` (no longer `500`)
  - `https://xtas.ragbaz.xyz/kontakt/` → `404` (no longer `500`)

### Codex — validated menu links before render to suppress stale internal URLs

**Delivered:**
- Added pre-render navigation filtering in `src/lib/menu.js` so menu items are validated before render instead of blindly emitted.
- Added URI-existence probing against WP `nodeByUri` for internal links with:
  - URI normalization + trailing-slash variant checks,
  - in-memory TTL cache (`MENU_URI_CHECK_TTL_MS`, default `300000ms`),
  - fail-open behavior when upstream is unavailable (to avoid collapsing nav on transient `503/429`).
- Added frontend-route allowlist to keep known app routes (admin/auth/profile/shop, etc.) from false negatives.
- Added pure helper module `src/lib/menuFilter.js` and unit tests `tests/menu.test.js` for stale-link filtering behavior (including parent-with-children fallback to non-clickable group).
- Deployed storefront worker and verified stale links were removed from live nav output while valid links remained.

**Verification run:**
- `npx eslint src/lib/menu.js src/lib/menuFilter.js tests/menu.test.js` (pass)
- `node --test tests/menu.test.js` (pass)
- `npm run cf:deploy` (pass; current deployed version `3969fb6a-e6e7-4409-afa4-bee1482a3a75`)
- live HTML checks:
  - `/kontakt` absent
  - `/om-xtas` absent
  - `/shop` present
  - `/blog` present

### Codex — reduced build-time GraphQL pressure + guaranteed `/shop` menu + icon contrast fix

**Delivered:**
- Implemented user-requested mitigation lane:
  - **(1 replacement)** switched menu existence checks from GraphQL `nodeByUri` to **sitemap-based validation** with TTL caching (`MENU_SITEMAP_*` settings) in `src/lib/menu.js`.
  - **(2)** kept hard fallback so top-level nav always contains `/shop` labeled `Shop` when missing (`src/lib/menuFilter.js` + tests).
  - **(3)** added build-phase GraphQL throttling/backoff in `src/lib/client.js`:
    - `GRAPHQL_BUILD_DELAY_MS` (default `180ms`),
    - `GRAPHQL_BUILD_TIMEOUT_MS` (default `15000ms`),
    - stronger backoff on varnish/rate-limit responses during build.
- Marked root layout runtime-dynamic (`src/app/layout.js`: `dynamic="force-dynamic"`, `revalidate=0`) to reduce expensive WP pre-render data pulls.
- Fixed storefront header utility icon visibility against purple CTA button theming:
  - added `storefront-icon-button` class to theme/user icon buttons,
  - added explicit contrast override styles in `src/app/globals.css`.

**Commit:**
- `main` `f54779c` — `Reduce build-time GraphQL load and harden storefront nav controls`

**Verification run:**
- `npx eslint src/app/layout.js src/lib/client.js src/lib/menu.js src/lib/menuFilter.js src/components/layout/DarkModeToggle.js src/components/layout/UserMenu.js tests/menu.test.js` (pass, 1 existing layout warning)
- `node --test tests/menu.test.js` (pass)
- `npm run build` (pass; dynamic routes remain `ƒ`)
- `npm run cf:deploy` (pass; deployed version `5ce71597-f252-4ed6-954d-fe6541ab85bb`)
- live checks:
  - `/shop` present in rendered nav output,
  - `/kontakt` absent,
  - `/om-xtas` absent,
  - `storefront-icon-button` class present in homepage HTML.

### Codex — fixed tenant draft route base-pathing for `/tenant/{domain}` pages

**Delivered:**
- Fixed tenant draft route generation in `ragbaz.xyz` so draft navigation no longer escapes to root when opened from `/tenant/{domain}`.
- Draft links now stay under domain route namespace:
  - `/tenant/{domain}/`
  - `/tenant/{domain}/shop`
  - `/tenant/{domain}/inventory`
  - `/tenant/{domain}/profile`
- Extended tenant route matching in worker router to support nested draft paths (`/tenant/{domain}/*`) while keeping existing `/tenant/{domain}/admin` and `/tenant/{domain}/api/admin/*` proxy paths intact.
- Updated tests to assert:
  - domain draft page emits namespaced links,
  - nested route `/tenant/xtas.nu/shop` resolves and renders draft content.
- Deployed `ragbaz.xyz` worker and verified live:
  - `/tenant/xtas.nu` outputs links to `/tenant/xtas.nu/{shop,inventory,profile}`,
  - `/tenant/xtas.nu/shop` returns `200`.

**Commit:**
- `ragbaz.xyz` `b6396fd` — `Fix tenant draft routes to stay under /tenant/{domain}`

**Verification run:**
- `ragbaz.xyz`: `npm test` (pass, 13/13)
- live check: `curl https://ragbaz.xyz/tenant/xtas.nu` link assertions + `curl -w "%{http_code}" https://ragbaz.xyz/tenant/xtas.nu/shop` = `200`

### Codex — bridge plugin 1.2.1 released, connect-first tab order, explicit slug-claim step

**Delivered:**
- Bumped `ragbaz-bridge` plugin version to `1.2.1` across plugin header/constant, package metadata, and readme stable tag/changelog.
- Reordered admin tabs so **Connect to RAGBAZ** renders first.
- Promoted tenant slug claiming into the main recommended Connect flow (no longer hidden behind advanced settings):
  - visible slug input with no-dot guidance,
  - visible `Claim / reserve slug` action in-step.
- Rebuilt plugin artifacts and refreshed published zips copied to:
  - `main/public/downloads/ragbaz-bridge/ragbaz-bridge.zip`
  - `ragbaz.xyz/release/ragbaz-bridge.zip`
- Verified live deployment issue and fixed it:
  - before deploy, `https://ragbaz.xyz/downloads/ragbaz-bridge/ragbaz-bridge.zip` served `1.2.0`,
  - deployed `ragbaz.xyz` worker,
  - re-verified live route now serves `1.2.1` with Connect-first tab order and slug-claim UI marker.

**Commits:**
- `main` `25f729a` — `Bump bridge to 1.2.1 and surface slug claim in Connect flow`

**Verification run:**
- `main`: `php -l packages/ragbaz-bridge-plugin/ragbaz-bridge.php` (pass)
- `main`: `npm run plugin:copy` (pass)
- remote check: downloaded live zip and confirmed `Version: 1.2.1` + `connect` tab before `overview` (pass)

### Codex — claimed/reserved tenant slug aliases (gift-key interchangeable) in plugin + ragbaz.xyz

**Delivered:**
- Added authenticated slug-claim endpoint in `ragbaz.xyz`:
  - `POST /api/v1/home/slug-claim`
  - validates slug format (`a-z`, `0-9`, `-`; no dots),
  - blocks reserved route slugs (`api`, `admin`, `articulate`, etc.),
  - enforces uniqueness (returns `409 slug_already_claimed` for cross-tenant conflicts),
  - stores alias mapping so slug and gift key can be used interchangeably in site-info/admin routes.
- Extended `ragbaz.xyz` API descriptor with `claimSlug`.
- Added end-to-end tests for:
  - successful slug reservation,
  - slug-based site-info lookup parity with gift-key lookup,
  - conflict on second tenant claiming same slug.
- Added bridge-plugin Connect UI + action for slug reservation:
  - new `Tenant slug alias` setting (explicit no-dot guidance),
  - `Claim / reserve slug` action button,
  - auto-onboard now attempts slug claim when a slug is preset,
  - slug-based preview/info links shown alongside gift-key links.
- Plugin now emits preferred slug in home payload and exposes `tenantSlug` in `ragbazHomeConnection` GraphQL type.

**Commits:**
- `ragbaz.xyz` `9d209f9` — `Add unique tenant slug claim API and alias reservation flow`
- `main` `5f08037` — `Add bridge UI/action for claiming reserved tenant slug aliases`

**Verification run:**
- `main`: `php -l packages/ragbaz-bridge-plugin/ragbaz-bridge.php` (pass)
- `main`: `npm run plugin:copy` (pass; plugin zip refreshed/copied)
- `ragbaz.xyz`: `npm test` (pass, 2/2)

### Codex — relay-secret onboarding/auth lane landed in `main` (commit `b33ad91`)

**Delivered:**
- Expanded `ragbaz-bridge` Connect flow to support a dedicated GraphQL relay lane:
  - auto-generated relay secret,
  - explicit relay enable/disable toggle,
  - relay secret rotation action,
  - simplified quick-start card with advanced overrides collapsed by default.
- Extended plugin heartbeat payload + GraphQL connection metadata with relay config fields.
- Extended plugin GraphQL auth hook to accept relay secret header (`x-ragbaz-relay-secret`) alongside site secret for `/graphql` requests.
- Updated storefront GraphQL auth strategy (`src/lib/wordpressGraphqlAuth.js`) with relay-secret header support:
  - env vars: `RAGBAZ_GRAPHQL_RELAY_SECRET` (+ optional header-name override),
  - auth priority now includes relay-secret lane before Basic/Bearer fallback.
- Updated operator docs and env examples (`README.md`, `docs/README.en.md`, `.env.example`) for the simplified single-secret relay flow.
- Rebuilt/published plugin zips from the updated plugin source (`dist` + public download copy).

**Verification run:**
- `php -l packages/ragbaz-bridge-plugin/ragbaz-bridge.php` (pass)
- `npx eslint src/lib/wordpressGraphqlAuth.js src/lib/ragbazHomeRelay.js` (pass)
- `npm test` in `main` currently has pre-existing failures unrelated to this slice (`mock.module` unsupported in current Node runtime + existing `admin-hotkeys` failure); relay-auth touched files validated via php/lint.

### Codex — tenant draft link hardening + relay status visibility in `ragbaz.xyz` (commit `901e2a3`)

**Delivered:**
- Added relay metadata normalization and safe display in diagnostics:
  - `graphqlRelay.enabled/mode/headerName/graphqlUrl`,
  - secret presence + preview only (no raw secret echo in UI).
- Hardened tenant draft link handling for base-path resilience:
  - rewrites same-site absolute URLs to relative draft-local paths,
  - rewrites upstream host-included URLs to relative local draft paths,
  - keeps external links available, marks them as `external`, and opens them in new tab/window (`target="_blank" rel="noopener noreferrer"`).
- Added request-path aware relative-link computation for both gift-host (`/`) and domain draft (`/tenant/{domain}`) rendering contexts.
- Added draft-local nav model for tenant draft pages (`./`, `./shop`, `./inventory`, `./profile`) while preserving an explicitly marked upstream-origin external link.
- Updated tests to verify:
  - relay metadata normalization behavior,
  - relative rewrite behavior on tenant draft pages,
  - external-link marker + new-tab attributes.

**Verification run:**
- `ragbaz.xyz`: `npm test` (pass, 2/2).

### Codex — path-based tenant admin proxy (no subdomain required) in `ragbaz.xyz` (commit `935a9d3`)

**Delivered:**
- Added path-based admin proxy routes on `ragbaz.xyz` so storefront admin is reachable without tenant subdomain:
  - `/tenant/{domain}/admin`
  - `/tenant/{domain}/admin/*`
  - `/tenant/{domain}/api/admin/*`
  - `/articulate/sites/{gift_or_alias}/admin`
  - `/articulate/sites/{gift_or_alias}/admin/*`
  - `/articulate/sites/{gift_or_alias}/api/admin/*`
- Reused existing tenant binding lookup and proxy transport path:
  - domain-based lookup uses `resolveTenantByDomain`,
  - gift/alias route uses existing gift/subdomain resolution logic,
  - requests are forwarded to configured tenant admin origin with tenant context headers and proxy marker headers.
- Extended API descriptor output with path-based admin endpoint hints:
  - `tenantAdminByDomain`
  - `tenantAdminBySiteKey`
- Added regression coverage in `ragbaz.xyz/tests/home-api.test.js` for:
  - host-based tenant admin proxy,
  - domain-path tenant admin proxy,
  - site-key path tenant admin proxy,
  - `/tenant/{domain}/api/admin/*` path/query forwarding behavior.

**Verification run:**
- `ragbaz.xyz`: `npm test` (pass, 2/2).

## 2026-03-26 (Codex)

### Codex — connected-sites tenant jump + collapsible draft advanced panels (commit `cf055fb` in `ragbaz.xyz`)

**Delivered:**
- Added a domain-based tenant jump form on `/articulate/sites`:
  - searchable domain input with datalist suggestions from connected sites,
  - keyboard-friendly submit behavior that normalizes domain/URL input and navigates to `/tenant/{domain}`.
- Added collapsible advanced sections on tenant draft pages:
  - `Advanced: Priority actions`
  - `Advanced: Draft frontend manifest`
  These are collapsed by default to improve first-screen scan speed.
- Added shared styling in shell CSS for jump-form controls and disclosure panels.
- Updated tests (`ragbaz.xyz/tests/home-api.test.js`) to assert:
  - tenant jump UI presence and navigation script,
  - advanced collapsible sections rendered in draft pages.
- Verification run:
  - `ragbaz.xyz`: `npm test` (pass, 12/12).

### Codex — tenant draft UI flow polish for domain routes (commit `c44cbf6` in `ragbaz.xyz`)

**Delivered:**
- Updated `ragbaz.xyz` tenant UI routing so domain pages now render the draft storefront view:
  - `GET /tenant/{domain}` now resolves the tenant and renders `renderGiftDraftPage` (instead of connected-site info page).
  - Added domain candidate fallback in tenant lookup (`domain`, `www.domain`, and stripped `www`) to reduce “not found” friction.
- Added upstream likeness capture in worker runtime:
  - fetches and caches upstream HTML snapshot metadata (`title`, `description`, `canonical`, final URL/status/error) for 5 minutes.
  - wired snapshot into gift-host draft rendering and domain-route draft rendering.
- Expanded draft UI (`renderGiftDraftPage`) with:
  - upstream snapshot status panel,
  - preliminary storefront likeness card based on upstream metadata,
  - faster operator navigation actions (`Peer diagnostics`, `Connected site info`, `Open upstream site`).
- Improved connected-site UI (`renderConnectedSitePage`) with explicit domain-route guidance and `Open draft by domain` quick action.
- Updated docs/tests:
  - `ragbaz.xyz/README.md` now describes `/tenant/{domain}` as a draft storefront page with score meters + upstream likeness.
  - `tests/home-api.test.js` updated to assert draft rendering for `/tenant/xtas.nu` and `/tenant/www.xtas.nu`.
- Verification run:
  - `ragbaz.xyz`: `npm test` (pass, 12/12).

### Codex — peer recommendations wording clarity (commit `aad43d0` in `ragbaz.xyz`)

**Delivered:**
- Reworked failed-check recommendation titles in `ragbaz.xyz/src/lib/payload.js` so they state the actual failure condition instead of the expected-good phrasing.
  - Example: `Persistent object cache is not enabled` (instead of ambiguous positive-title wording).
- Added `observed` telemetry passthrough for failed runtime/cache checks into recommendation objects.
- Updated `ragbaz.xyz/src/lib/pages.js` recommendations renderer to display `Observed` values when available.
- Added regression assertions in `ragbaz.xyz/tests/payload.test.js` to lock in unambiguous recommendation titles for cache/runtime failure paths.
- Verification run:
  - `ragbaz.xyz`: `npm test` (pass, 12/12).

### Codex — peer page now recomputes insights from payload at render time (commit `5fa2d85` in `ragbaz.xyz`)

**Delivered:**
- Updated `ragbaz.xyz/src/lib/pages.js` (`renderPeerPage`) to recompute insights from `latestReport.payload` on each request instead of trusting stored `latestReport.insights` only.
- This makes recommendation phrasing and scoring logic update immediately for older peer rows, without requiring a new plugin heartbeat.
- Verification run:
  - `ragbaz.xyz`: `npm test` (pass, 12/12).

### Codex — GraphQL history strict 200/non-200 coloring + expandable rows

**Delivered:**
- Updated `GraphqlAvailabilityPanel` status rendering to use strict HTTP status handling:
  - `200` rows/dots render green,
  - any non-`200` rows/dots render red.
- Removed special orange rate-limit color path so all non-`200` responses are visually unified as failures.
- Made every request row foldable (`Expand` / `Collapse`), not only failures.
- Expanded detail panel now supports both outcomes:
  - `200` entries show green success summary,
  - non-`200` entries keep diagnostic guidance.
- Verification run:
  - `npx eslint src/components/admin/GraphqlAvailabilityPanel.js` (pass).

### Codex — dead-link scan opt-in + throttled checks + GraphQL failure diagnostics UI

**Delivered:**
- Dead-link finder no longer auto-runs on panel load (`AdminInfoHubTab`); scan now starts only from explicit button action (`Scan now`), then switches to `Rescan`.
- Added idle-state copy and localized strings in EN/SV/ES for first-run dead-link behavior.
- Added backend link-check pacing in `GET /api/admin/dead-links`:
  - global paced request scheduler (`minIntervalMs=200`),
  - reduced concurrent workers (`concurrency=4`),
  - policy surfaced in response as `linkCheckPolicy`.
- Expanded GraphQL availability logging payload (`src/lib/graphqlAvailability.js` + `src/lib/client.js`) for failure diagnostics:
  - operation name,
  - failure kind (`graphql-syntax`, `graphql-validation`, `graphql-auth`, `rate-limited`, etc.),
  - query/variables preview,
  - upstream response preview,
  - normalized GraphQL errors.
- Upgraded GraphQL history UI (`GraphqlAvailabilityPanel`) with:
  - gruvbox-dark syntax highlighting for GraphQL query documents,
  - per-failure inspector drawer,
  - explicit diagnostic cards with `Should be`, `Was`, and `Recommended` guidance for missing fields, malformed fragments, unknown args, missing variables, syntax/auth/general errors.
- Verification run:
  - `npx eslint src/components/admin/GraphqlAvailabilityPanel.js src/lib/client.js src/lib/graphqlAvailability.js src/components/admin/AdminInfoHubTab.js src/app/api/admin/dead-links/route.js` (pass).
  - `node --test tests/dead-links.test.js` (pass).
  - JSON parse validation for `src/lib/i18n/en.json|sv.json|es.json` (pass).

### Codex — storefront Web Vitals relay to ragbaz.xyz + event-to-report ingestion (commits `be2d2bb` in `main`, `f977604` in `ragbaz.xyz`)

**Delivered:**
- Added privileged GraphQL home-connection exposure in bridge plugin (`RootQuery.ragbazHomeConnection`) so server-side storefront code can read `baseUrl/accountId/passkey/giftKey` when authenticated as `manage_options`.
- Added storefront relay path from `POST /api/admin/page-performance` to ragbaz home events:
  - new helper `src/lib/ragbazHomeRelay.js`,
  - emits `storefront_web_vitals` events to `/api/v1/home/events`,
  - includes `ttfb/lcp/inp/cls/fcp/domComplete`, URL, host, UA, and severity classification.
- Extended client vitals collection to include INP + CLS in `usePagePerformanceLogger`.
- Extended local perf logging shape (`graphqlAvailability` store) to persist INP + CLS.
- Updated `ragbaz.xyz` event ingestion so vitals events now patch `peer.latestReport.payload.performance`, recompute insights, append report history entry, and persist to D1 snapshot/history.
- Added/updated automated coverage in `ragbaz.xyz/tests/home-api.test.js` for vitals event -> latestReport performance propagation.
- Verification run:
  - `main`: `php -l packages/ragbaz-bridge-plugin/ragbaz-bridge.php` (pass), targeted eslint on touched files (pass).
  - `ragbaz.xyz`: `npm test` (pass, 2/2).
- Deployment:
  - `ragbaz.xyz` deployed after merge, Worker version `238f88fd-da7b-4f89-ae07-1ceb452314c0`.

### Codex — ragbaz-bridge plugin auto onboarding flow for ragbaz.xyz (commit e5af4da)

**Delivered:**
- Added first-time auto onboarding in `packages/ragbaz-bridge-plugin/ragbaz-bridge.php`:
  - new GET/POST JSON request helper (`ragbaz_home_request_json`),
  - canonical JSON signer (`ragbaz_canonical_json`) matching worker payload-signature expectations,
  - `ragbaz_auto_onboard_home()` challenge -> signed register flow against `/api/v1/home`,
  - automatic persistence of returned `accountId`, `passkey`, and `giftKey` into plugin options.
- Extended Connect actions with `ragbaz_connect_action=auto_onboard`, including status persistence and success/failure notices.
- Updated Connect-tab UX copy and controls to prioritize auto onboarding before manual credential entry.
- Verification run:
  - `php -l packages/ragbaz-bridge-plugin/ragbaz-bridge.php` (no syntax errors).

### Codex — ragbaz.xyz D1-centric control-plane foundation (commit 9e080f7, repo: `../ragbaz.xyz`)

**Delivered:**
- Implemented D1-first control-plane storage in `ragbaz.xyz`:
  - added `src/lib/controlPlaneD1.js` and `migrations/0001_control_plane.sql`,
  - wired register/heartbeat/events/tenant-claim to dual-write KV + D1,
  - added D1-first peer and tenant resolution paths with KV fallback.
- Added new JSON operational endpoints:
  - `GET /api/v1/home/sites`
  - `GET /api/v1/home/history`
- Added scheduled retention prune path (`HOME_RETENTION_DAYS`, default 30d) and Wrangler cron trigger.
- Updated `ragbaz.xyz` README + Wrangler config for D1 setup/migration instructions.
- Added test coverage for the new `/api/v1/home/sites` and `/api/v1/home/history` routes.
- Verification run:
  - `ragbaz.xyz`: `npm test` (pass, 2/2).

### Codex — storefront-first GraphQL ragbaz probe + Wrangler-tail URI logging (commit 3984ab8)

**Delivered:**
- Added `src/lib/storefrontGraphqlProbe.js` with a dedicated first-query probe:
  - Runs an introspection query focused on ragbaz plugin surface (`RootQuery` ragbaz-prefixed fields + `RagbazInfo` type fields).
  - Emits structured log lines to `console.log` (visible in `wrangler tail`) under `[StorefrontGraphQLProbe]`.
  - Log payload includes `intendedUri` (requested URI target before content lookup), plus ragbaz field availability.
- Wired the probe as the first storefront GraphQL call before `nodeByUri` lookups:
  - Home route: `src/app/page.js` probes before the existing `nodeByUri("/")` + home-events fetch.
  - Catch-all route: `src/app/[...uri]/page.js` probes before query construction and `nodeByUri` variant attempts.
- Verification run:
  - `npx eslint src/lib/storefrontGraphqlProbe.js src/app/page.js src/app/[...uri]/page.js` (pass).

### Codex — BUGS.md items complete: welcome story fullscreen flow + high-contrast flow diagram (commit 9a3cbbc)

**Delivered:**
- Completed Welcome story fullscreen behavior in `src/components/admin/AdminWelcomeTab.js`:
  - added best-effort auto fullscreen attempt when story mode opens,
  - added fullscreen state tracking via `fullscreenchange`,
  - added fixed lower-right high-contrast toggle button (`Fullscreen` / `Not fullscreen`),
  - unified story close behavior so exit paths also attempt to leave fullscreen.
- Increased flow-slide visual contrast and scale in the same file:
  - larger heading/body sizing,
  - bigger and darker flow boxes/labels/connectors,
  - increased diagram panel height and spacing for better use of surface area.
- Added i18n keys for fullscreen control text in EN/SV/ES:
  - `admin.welcomeEnterFullscreen`
  - `admin.welcomeExitFullscreen`
- Marked corresponding BUGS backlog entries as done in `BUGS.md`:
  - fullscreen auto/exit control item,
  - flow diagram contrast/size item.
- Verification run:
  - `npx eslint src/components/admin/AdminWelcomeTab.js` (pass).
  - `node -e "..."` JSON parse for `src/lib/i18n/en.json|sv.json|es.json` (pass).
  - `node --test tests/i18n-admin-parity.test.js` (pass).

### Codex — BUGS.md item complete: shared-hosting WP URL migration guidance in plugin Connect UI (commit aed6eda)

**Delivered:**
- Added an instructional guidance block to `packages/ragbaz-bridge-plugin/ragbaz-bridge.php` (Connect tab) covering:
  - moving from apex host to `wp.<domain>` in shared hosting,
  - DNS + docroot setup,
  - two strategies (move directory vs symlink to existing codebase),
  - updating `home/siteurl`,
  - permalink + `/graphql` verification,
  - storefront advanced WordPress URL update to the new origin.
- Marked the corresponding BUGS line as done in `BUGS.md` (shared-hosting subdirectory/subdomain instruction request).
- Verification run:
  - `php -l packages/ragbaz-bridge-plugin/ragbaz-bridge.php` (no syntax errors).

### Codex — BUGS.md item complete: KV-backed admin UI feedback controls with Sofia/Tobias role behavior (commit 2c83588)

**Delivered:**
- Added a new admin feedback capability for major tab surfaces:
  - UI component: `src/components/admin/AdminUiFeedbackBar.js` (three actions: 👍 adequate, ❤ good, 👎 needs improvement).
  - Dashboard integration: `src/components/admin/AdminDashboard.js` renders a per-tab feedback bar (`tab:<activeTab>` field id), loads current feedback, and persists updates.
- Added a new admin API endpoint:
  - `GET/POST /api/admin/ui-feedback` in `src/app/api/admin/ui-feedback/route.js`.
  - Data persisted via new KV-backed store `src/lib/adminUiFeedbackStore.js` (`CF_UI_FEEDBACK_KV_KEY` or default key `admin-ui-feedback`, with in-memory fallback).
- Implemented requested edit policy:
  - Sofia accounts can write feedback (`session.email` starts with `sofia`).
  - Tobias (and all non-Sofia admin accounts) are read-only in the feedback UI.
- Extended admin session identity payload:
  - `src/auth.js` now stores/returns admin email in session token.
  - `src/app/api/admin/login/route.js` now writes email into admin session token.
  - `src/app/api/admin/session/route.js` fixed missing `await` on session decode and now returns full session shape reliably.
- Added EN/SV/ES i18n keys for feedback labels/help text.
- Marked the matching BUGS line as done in `BUGS.md` (thumbs/heart feedback feature).
- Verification run:
  - `npx eslint` on all touched JS routes/components/libs (pass).
  - i18n JSON parse check for EN/SV/ES (pass).
  - `node --test tests/i18n-admin-parity.test.js` (pass).

### Codex — BUGS.md items complete: earth/lollipop admin themes + 4-step cycle (commit ea355d4)

**Delivered:**
- Extended admin theme state from 2 to 4 steps (`light -> gruvbox -> earth -> lollipop`) in:
  - `src/components/admin/AdminHeader.js` (cycle logic, icon mapping, aria label text),
  - `src/components/admin/AdminThemeWrapper.js` (theme normalization, persistence, wrapper class assignment).
- Added requested theme icons in cycle UI:
  - Earth uses globe icon (`🌍`),
  - Lollipop uses star icon (`⭐`).
- Implemented new visual theme classes in `src/app/globals.css`:
  - `admin-earth` (sepia/umbra palette),
  - `admin-lollipop` (pink/purple palette),
  with dedicated header chrome overrides (`admin-header-shell/control/popover/drawer/ticker/select`) and content surface/border/text tuning.
- Added i18n labels for cycle naming in EN/SV/ES (`themeCycleTo`, `themeNameLight`, `themeNameGruvbox`, `themeNameEarth`, `themeNameLollipop`).
- Marked both related BUGS lines as done in `BUGS.md` (earth and lollipop theme feature lines).
- Verification run:
  - `npx eslint src/components/admin/AdminHeader.js src/components/admin/AdminThemeWrapper.js` (pass).
  - JSON parse check for EN/SV/ES i18n files (pass).
  - `node --test tests/i18n-admin-parity.test.js` (pass).

### Codex — BUGS.md item complete: advanced WP URL override is now honored (commit ec2cd42)

**Delivered:**
- Added `src/lib/wordpressUrl.js` with shared URL resolution (`ragbaz_wp_config` cookie override first, env fallback to `NEXT_PUBLIC_WORDPRESS_URL`/`WORDPRESS_API_URL`) so local advanced settings can override default tenant URL while preserving default behavior when no override is set.
- Refactored `src/lib/client.js` and `src/lib/wordpressGraphqlAuth.js` to use shared URL resolution, aligning GraphQL endpoint calls and SiteToken exchange with the same effective WordPress host.
- Updated route resolution surfaces to use the same effective URL:
  - `src/app/page.js` now decides setup-vs-content based on resolved URL (cookie/env), not env alone.
  - `src/app/[...uri]/page.js` REST/LearnPress fallback paths now receive resolved URL, avoiding env-only fallback drift.
- Marked the matching BUGS line as done in `BUGS.md` (`if we change the advanced setting for wordpress url...`).
- Verification run:
  - `npx eslint src/lib/wordpressUrl.js src/lib/client.js src/lib/wordpressGraphqlAuth.js src/app/page.js src/app/[...uri]/page.js` (pass, 0 errors).

### Codex — BUGS.md item complete: lighter theme-toggle hover outline (commit 5abbee2)

**Delivered:**
- Reduced admin header theme icon hover outline thickness from `3px` to `2px` in `src/components/admin/AdminHeader.js` (`THEME_ICON_OUTLINE_HOVER`), matching the “1–2px tops” request.
- Marked the matching BUGS backlog line as done in `BUGS.md` (sun/moon hover outline thickness item).
- Verification run:
  - `npx eslint src/components/admin/AdminHeader.js` (pass, 0 errors).

### Codex — ragbaz-bridge connect UX polish + sepia branding alignment (commits a4ac1bc / 4c6ffc6 / 06a6772)

**Delivered:**
- Improved `main/packages/ragbaz-bridge-plugin/ragbaz-bridge.php` Connect tab UX with clearer “Connect & Phone Home” framing, a primary `Phone home now (send heartbeat)` CTA, credential readiness indicators, friendlier status notices, and cleaned event severity controls.
- Applied sepia branding to the plugin settings header logo/title treatment and switched the storefront admin wordmark palette to sepia in `main/src/components/admin/AdminHeader.js` (plus matching change in `wp-cf-front-oss/src/components/admin/AdminHeader.js`).
- Expanded `ragbaz.xyz` front-page themes in `ragbaz.xyz/src/lib/pages.js` to elemental `air/fire/earth/water/aether`, added keyboard rotation via `Ctrl+Alt+T`, persisted theme migration from legacy `light/dark`, and added sepia wordmark styling.
- Added `ragbaz.xyz/tests/home-api.test.js` coverage for elemental theme controls and hotkey marker text.
- Verification run:
  - `ragbaz.xyz`: `npm test` (pass, 2/2).
  - `main`: `npx eslint src/components/admin/AdminHeader.js` (pass), `php -l packages/ragbaz-bridge-plugin/ragbaz-bridge.php` (no syntax errors).
  - `wp-cf-front-oss`: `npx eslint src/components/admin/AdminHeader.js` could not be completed due local dependency/config mismatch (`eslint-config-next/core-web-vitals` not resolvable in this environment).

### Codex — GraphQL/REST `nodeByUri` stability hardening for `src/app/[...uri]/page.js` (commit 4e3e078)

**Delivered:**
- Hardened URI lookup normalization in `src/app/[...uri]/page.js` (`normalizeUriForLookup` + `buildUriLookupAttempts`) so `fetchContent` consistently retries both trailing-slash variants from a canonical URI.
- Improved `fetchContent` failure handling/logging: non-rate-limit lookup exceptions are logged per candidate URI and do not abort fallback resolution, while `RateLimitError` is rethrown immediately.
- Updated `resolveNodeByUri` to normalize URIs up front and preserve 429 behavior by rethrowing `RateLimitError` instead of swallowing it in GraphQL/fallback catch paths.
- Fixed `src/lib/client.js` 429 propagation so `fetchGraphQL` throws `RateLimitError` immediately on HTTP 429 and rethrows it through outer catch logic.
- Verification run:
  - `npx eslint src/app/[...uri]/page.js src/lib/client.js` (pass, 0 errors).
  - `npm test` (fails due pre-existing unrelated suite issues: `admin-hotkeys` and Node `mock.module` failures in font tests).

### Codex — admin header health-state sync fix (commit 069119f)

**Delivered:**
- Fixed a regression where the main menu-bar health badge stayed `amber` even after successful health checks by wiring `healthChecks` updates to `emitHealthStatus(deriveHealthStatus(...))` in `AdminDashboard`.
- Marked the corresponding BUG entry as done in `BUGS.md` (`main menu bar status showed partial despite green integration checks`).
- Verification run:
  - `npm run lint` (fails due pre-existing issue in `src/components/setup/WordPressSetupPage.jsx`: `@next/next/no-html-link-for-pages`).
  - `npm test` (fails due existing suite issues unrelated to this patch: `admin-hotkeys` expectation drift, `mock.module` availability in several font tests, and one `photon-pipeline` expectation mismatch).

### Codex — storefront dark-mode contrast bootstrap + icon visibility (commit d755dc4)

**Delivered:**
- Added an early theme bootstrap script in `src/app/layout.js` to apply `.dark-mode` before hydration when `localStorage.theme === "dark"`, preventing initial dark-text flash in dark mode.
- Updated dark-mode header button color behavior in `src/app/globals.css` to use `var(--btn-color, #fff7ed)`, restoring visible sun/moon and user-head icons on purple header buttons.
- Marked the two corresponding `/` BUG entries as done in `BUGS.md`.
- Verification run:
  - `npx eslint src/app/layout.js src/app/globals.css src/components/layout/DarkModeToggle.js src/components/layout/UserMenu.js` (0 errors; warnings only: `layout.js` known manual stylesheet warning, CSS file ignored by ESLint config).

### Codex — admin docs mermaid rendering fix (commit e766fa3)

**Delivered:**
- Added mermaid-code-block rendering support in `src/app/admin/docs/[slug]/page.js` by detecting `language-mermaid` fences and rendering diagram images via `https://mermaid.ink/img/<base64>`.
- Kept non-mermaid code blocks unchanged and preserved existing markdown link rewrite behavior.
- Marked the two docs-related BUG entries as done in `BUGS.md` (`/admin/docs/readme-sv` and broader `/admin/docs` mermaid rendering).
- Verification run:
  - `npx eslint src/app/admin/docs/[slug]/page.js` (pass, 0 errors/warnings).

## 2026-03-25 (Claude) — Bundle size reduction + Derivation editor redesign

### Claude — CF Workers bundle size reduction (commits pending push)

**Delivered:**
- `src/lib/r2Bindings.js` — R2 bucket binding accessor via `getCloudflareContext()`, falls back to null for local dev
- `src/lib/s3upload.js` — full rewrite: every operation tries R2 binding → edge R2 signing → AWS SDK fallback
- `scripts/patch-opennext.mjs` — added Patch 2: externalize `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` from esbuild bundle
- `scripts/patch-cf-worker.mjs` — added Section 4: i18n JSON dedup (3 copies × 3 locales → 1 copy each, ~323 KB raw saved)
- `wrangler.jsonc` — added R2 bucket binding (`R2_BUCKET` → `sofiacerne`)
- Bundle size: 2993 KB gz → 1886 KB gz (1186 KB headroom under 3072 KB free-tier limit)

### Claude — Derivation editor redesign (in progress)

**Spec:** `docs/superpowers/specs/2026-03-25-derivation-editor-redesign-design.md` (committed)
- Extract DerivationEditor from AdminMediaLibraryTab into 7 focused components
- Visual grid picker with 22 categorized operations (Transform, Color & Tone, Effects, Artistic)
- Slider parameter controls with deferred preview
- Drag-and-drop pipeline reordering (HTML5 DnD, zero dependencies)
- Wire up 12 missing photon operations + intensity blending for sepia/grayscale/invert
- Implementation plan being written now

---

## Active TODO Backlog (priority x impact)

DONE [P1 | High]: Font browser + typography system — Google Fonts catalog (API + KV-cached snapshot), R2 font download, `@font-face` CSS serving, 5 font roles with palette color slots, link hover variants, 5 built-in themes, AdminFontBrowserModal, admin role-card UI. Plan: `docs/superpowers/plans/2026-03-22-font-browser.md`. All 12 tasks complete (Claude, 2026-03-22).
DONE [P0 | Very High]: Image generation runtime reliability — `/api/admin/generate-image` now returns classified diagnostics (`code`, `hint`, `requestId`) with timeout handling, provider error classification, partial-success warnings, and improved admin toast reporting.
DONE [P0 | Very High]: Receipt PDF validity — Stripe receipt proxy now enforces HTTPS Stripe-host allowlist, verifies `%PDF`, traces response provenance (status/content-type/final URL/elapsed), extracts embedded PDF URLs from HTML wrappers, and falls back to invoice PDF URLs.
DONE [P1 | High]: VAT/Moms completion across all product sources — per-item VAT override persists through admin save/API/store/WordPress backend, checkout metadata now carries VAT, and sales VAT/net use tax-inclusive math with metadata/product/category VAT precedence.
DONE [P2 | Medium]: Welcome story data realism — replaced the mock image-generator slide with live quota + latest-run snapshot state and a read-only fallback when live API state is unavailable.
DONE [P2 | Medium]: Dead-link finder panel — added admin scanner (content `<a href>` extraction + internal/pseudo-external/external classification + reachability checks) and surfaced it in Support with filters and source traces.
DONE [P3 | Medium]: Documentation UX pass — added GUI visuals alongside key sections, reordered operator instructions for average-user relevance, and synced wording with current tab names/flows.
DONE [P2 | Medium]: Admin header stats ticker — scrolling bar added below nav row; endpoint GET /api/admin/stats-ticker aggregates Stripe revenue/transactions/customers/salesPerUser + CF weekly avg hits/day with graceful fallback; refreshes every 5 min (commit bd6c051).
DONE [P3 | Medium]: Post-implementation code review — full quality/usability audit completed 2026-03-21 (Claude); top-priority fixes implemented same session (see audit-fixes commit 1cb27ff).
DONE [P2 | Medium]: Admin UX polish follow-up — all 4 items already implemented by Codex: focus trap in hamburger drawer (AdminHeader.js:257-298), Ctrl+Alt guard while typing (shouldIgnoreAdminHotkeys/isEditableTarget), media table keyboard nav (handleMediaTableKeyDown), numeric param hard-validation (derivationInvalidParameters disables Apply). Verified by Claude 2026-03-21.
DONE [P2 | Medium]: WordPress plugin media metadata surface — plugin now registers attachment `ragbaz_asset_*` meta for REST/GraphQL, exposes normalized `ragbaz_asset` on `/wp/v2/media`, and resolves `original` + `variants` chains (`assetId`, `size`, `dimensions`, `mime`, `hash`) for WP attachment assets (commit `3e3d361`).
DONE [P2 | Medium]: WordPress plugin presence/version GraphQL signal — added `ragbazCapabilities` query (`pluginPresent`, `pluginVersion`, `pluginSemver`, asset-meta capability flags/schema version) and wired admin health runtime probe to ingest that signal before metadata-dependent flows (commit `3e3d361`).
DONE [P2 | Medium]: AdminMediaLibraryTab.js refactor (phase 1) — extracted utility functions to `mediaLibraryHelpers.js`, `R2ConnectionPanel`, `MediaViewerPanel`; main file 3942 → 3205 lines (Claude, 2026-03-23). See entry below.
DONE [P2 | Medium]: WP setup page + 429 rate-limit UX + availability/perf logging + chat beta gate — commit `356a96f` (Claude, 2026-03-23). See entry below.

## 2026-03-23 (Claude) — AdminMediaLibraryTab refactor phase 1

### Claude — AdminMediaLibraryTab.js modularization (commits 858403d, 3e6722e, f1dc7ba)

**Delivered:**
- `src/lib/mediaLibraryHelpers.js` — all 30+ pure utility functions and constants extracted from AdminMediaLibraryTab (extFromFileName, formatBytes, formatResolution, formatUpdatedAt, sourceLabel, sourceBadgeClass, PRESET_CROP_OPTIONS, buildPseudoDerivationName, getUnboundParameters, describeOperationParameters, formatParameterValue, isInvalidNumericParam, getInvalidOperationParameters, canPreviewImage, isImageFile, detectAssetKind, isSupportedUploadFile, canOpenDataViewer, resolveAssetType, parseTimestamp, parseSize, buildUploadHistoryEntry, defaultR2ObjectKey, normalizeEditorValue, normalizeEditorMultiline, normalizeOwnerUri, normalizeAssetSlug, toEditorState, stampOpenAndGetPrevious, isNewAsset, escXml, generateCyberduckBookmark, downloadCyberduckBookmark, LS_LAST_OPENED_KEY, plus size/history constants).
- `src/components/admin/R2ConnectionPanel.js` — S3/R2 connection checklist + GUI client guides (WinSCP/CyberDuck accordion); owns `showSecret`/`copiedField` state and all derived connection logic (uploadBackend/clientDetails/backendMode/checklistRows/copyValue).
- `src/components/admin/MediaViewerPanel.js` — asset data viewer (JSON/YAML/CSV/Markdown/SQLite/text); accepts viewerItem/viewerLoading/viewerError/viewerData/onClose props; owns ReactMarkdown/remarkGfm imports.
- `AdminMediaLibraryTab.js` shrank from **3942 → 3205 lines** (−737 lines). All three cf:build passes.

**Remaining in AdminMediaLibraryTab:** upload zone, media table, focused-item/editor panel, derivation panel, R2 manual ingest panel, metadata editor — these are deeply interlinked and will be extracted in a follow-up.

---

## 2026-03-23 (Claude)

### Claude — WP setup page, 429 UX, availability logging, chat beta gate (commit 356a96f)

**Delivered:**
- `WordPressSetupPage` shown at `/` and `/setup` when `NEXT_PUBLIC_WORDPRESS_URL` is not set; saves WP URL + secret to localStorage and sets `ragbaz_wp_config` cookie for SSR via `POST /api/config`.
- `RateLimitPage` shown on HTTP 429 from GraphQL: raw response body in `<pre>`, color-coded request history table with date/time/status per attempt, reload button.
- Build resilience: `page.js` + `[...uri]/page.js` guard all GraphQL calls with `RateLimitError` try/catch; `fetchGraphQL` returns `{}` when WP URL is absent; build never requires a live GraphQL server.
- `src/lib/graphqlAvailability.js` — opt-in KV-backed logging for GraphQL availability + page performance (shared toggle, 500-entry cap, 7-day TTL).
- `GET/POST/DELETE /api/admin/graphql-availability` and `POST/GET/DELETE /api/admin/page-performance`.
- `GraphqlAvailabilityPanel` — toggle switch, 4 stat cards, 120-bucket timeseries dots (green/orange/red), recent-requests table.
- `PagePerformancePanel` — avg TTFB/DOM/LCP/FCP cards, recent page loads table.
- `usePagePerformanceLogger` hook — Navigation Timing API + PerformanceObserver (LCP/FCP); sends via `sendBeacon`/`fetch keepalive` 1.5s post-load.
- Chat tab beta-gated: hidden from nav by default; toggle in Admin → Info → Beta & monitoring; `AdminHeader` syncs via localStorage storage event.
- Dead-link finder moved from its own section into Beta & monitoring.
- i18n: 7 new keys added to en/sv/es (all in sync, 1010 keys each).

## 2026-03-22 (Claude)

### Claude — Font browser + typography system (all 12 tasks)

**Plan:** `docs/superpowers/plans/2026-03-22-font-browser.md`

**Delivered:**
- `src/lib/downloadedFonts.js` + tests — KV CRUD for downloaded font records + `getAllFontFaceCss()`.
- `src/lib/googleFontsCatalog.js` + `googleFontsSnapshot.json` — catalog fetch with KV cache, API, and 18-font snapshot fallback; `scripts/fetch-fonts-snapshot.mjs` for refresh.
- `src/lib/fontDownload.js` — Google Fonts CSS fetch → woff2 parse → R2 upload → record return.
- `src/lib/shopSettings.js` extended — `normalizeFontRole`, `normalizeTypographyPalette`, `normalizeLinkStyle`, backward compat for legacy string font values.
- `/api/admin/fonts/catalog` (GET) and `/api/admin/fonts/download` (POST).
- `/api/site-fonts` (public GET) — serves `@font-face` CSS for downloaded fonts.
- `src/app/globals.css` — h1–h6 per-role CSS vars, button font, 7 link hover variant styles.
- `src/app/theme.generated.css` — new CSS var defaults for display/subheading/button/color roles.
- `src/app/layout.js` — inline `<link>` to `/api/site-fonts`, new inline script handling font role objects + legacy strings + palette + link style + CTA.
- `src/lib/typographyThemes.js` — 5 built-in themes: Clean, Editorial, Technical, Warm, Haute.
- `src/components/admin/AdminFontBrowserModal.js` — full-screen modal with catalog search/filter, CDN preview, infinite scroll, download + weight picker, select.
- `src/components/admin/AdminDashboard.js` — replaced 2-dropdown font UI with 5 role cards + palette strip + themes strip + link style panel + modal integration; updated user preset save/apply to new state.
- i18n: 40 new keys added to en/sv/es (all in sync, 1002 keys each).

## 2026-03-21 (Claude)

### Claude — Photon pipeline + full admin audit + top-priority fixes

**Photon image pipeline (landed earlier this session):**
- Implemented `src/lib/photonPipeline.js` — edge-compatible WASM pipeline with pure helpers (`resolveOutputFormat`, `parsePresetCrop`, `guardSourceSize`, `clampSaturation`, `isAvifSource`), pixel mask (`applyCircleMask`), operator executor (`executeOperations`), and serializer (`serializeImage`).
- Rewrote `src/app/api/admin/derivations/apply/route.js` to fetch source → AVIF guard → size guard → Photon pipeline → return binary image blob.
- Added 10 predefined derivations to `src/config/image-derivations.json` and `config/image-derivations.json`.
- Added 25-test suite in `tests/photon-pipeline.test.js` (all pass).

**Full admin UI audit + top-priority fixes (commit 1cb27ff):**
- SECURITY: Added `requireAdmin` to `GET /api/admin/derivations` (was publicly accessible).
- SECURITY: Added SSRF protection to `/api/admin/derivations/apply` (https-only + origin/WP/R2 host allowlist).
- RELIABILITY: `executeOperations` now frees intermediate PhotonImage on throw.
- RELIABILITY: `cropCircle` diameter clamped to `min(srcW, srcH)`.
- BUG: `crop` operator now respects caller `x1`/`y1`; falls back to center-crop.
- BUG: `applySelectedDerivation` now consumes binary blob response + creates object URL inline preview.
- BUG: `savePreviewToLibrary` uploads blob to `/api/admin/upload?backend=` (query string fix).
- BUG: `loadDerivations` wrapped in `useCallback`; stale closure + blob URL memory leak fixed.
- SCHEMA: Removed phantom `amount` from `sharpen` schema, `intensity` from `sepia` schema.
- CONFIG: `og-image` preset corrected from `2:1` to `191:100`.
- DX: Removed duplicate `MAX_SOURCE_BYTES` from apply route.
- i18n: Added 4 missing `welcomeSlideNBody` keys to en/sv; all 909 keys in sync.

**Stats ticker landed** (commit bd6c051). **UX polish verified already done by Codex.** Now starting: WordPress plugin media metadata surface (P2).

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

### Codex — derivation preview matrix + parameter guardrails

- Added derivation summary badges/screens in the Media tab: pseudo-name, concrete vs abstract state, unbound-parameter chips, and an operation matrix table that highlights which parameters are preset and which are left open.
- Prevented `Apply derivation` from running while parameters remain unbound and documented the requirement in README/AGENTS to keep abstract chains reusable until a concrete asset is chosen.

### Codex — WP attachment asset metadata + capability signal (commit 3e3d361)

- Extended the WordPress plugin (`packages/ragbaz-bridge-plugin/ragbaz-bridge.php`) with attachment-asset metadata registration and normalization:
  - registers `ragbaz_asset_*` attachment meta keys for REST and GraphQL,
  - adds REST field `ragbaz_asset` with normalized asset record (`assetId`, `uri`, `ownerUri`, `variantKind`, `hash`, `mime`, `size`, `dimensions`, `original`, `variants`),
  - resolves variant lists by shared `ragbaz_asset_id` so original↔derived chains are queryable per attachment.
- Added GraphQL capability probe:
  - `ragbazCapabilities` query and `RagbazCapabilities` type expose `pluginPresent`, `pluginVersion`, `pluginSemver`, and asset-meta surface flags/schema version,
  - `MediaItem.ragbazAsset` exposes normalized attachment asset metadata directly in WPGraphQL.
- Updated admin integration:
  - `src/app/api/admin/media-library/route.js` now requests `ragbaz_asset` from WordPress REST and prefers it over raw `meta` when present,
  - `src/app/api/admin/health/route.js` runtime probe now reads `ragbazCapabilities` and stores availability/capability details for compatibility checks.
- Verification:
  - `npm run lint -- src/app/api/admin/media-library/route.js src/app/api/admin/health/route.js` (pass; existing `no-img-element` warnings unchanged),
  - `php -l` unavailable in this environment (`php: command not found`), so plugin syntax must be linted on a machine/container with PHP installed.

### Codex — asset-lineage UI for faster sourcing (commit 4b84551)

- Improved Media tab selected-asset UX by surfacing lineage controls directly in the purple detail panel:
  - shows an `Asset lineage` block when attachment lineage metadata is available,
  - shows `Original` attachment jump action (or fallback URL when the original row is not in current list),
  - lists all known variants with compact chips (`variantKind · format · sourceId`) and highlights the current selection.
- Added one-click variant/original navigation:
  - selecting lineage chips re-focuses the corresponding table row and keeps keyboard-flow continuity (no manual re-search required).
- Added locale strings for the new lineage block in EN/SV/ES (`mediaAssetLineage*`, `mediaVariant`, `mediaCurrent`), keeping admin i18n parity intact.
- Verification:
  - `npm run lint -- src/components/admin/AdminMediaLibraryTab.js` (pass; existing repo-wide `no-img-element` warnings unchanged),
  - `npm test -- tests/i18n-admin-parity.test.js` (pass; full suite executed by project script, 169 pass / 0 fail / 3 skipped).

### Codex — CyberDuck-to-R2 ingest flow with preview + KV save (commit acebee5)

- Added a new manual R2 ingest API route (`src/app/api/admin/media-library/cyberduck-r2/route.js`) and KV-backed registry (`src/lib/mediaAssetRegistry.js`):
  - validates/admin-gates R2 object-key lookups,
  - previews object metadata from R2 (`key`, URL, mime, size, updated time),
  - persists normalized asset records in a KV-backed registry (fallback memory),
  - writes canonical `asset_*` metadata back to the R2 object on save.
- Reworked Media tab manual-ingest UX in `src/components/admin/AdminMediaLibraryTab.js`:
  - replaced old “register by URL” block with a CyberDuck-first flow,
  - surfaces R2 checklist details (host/bucket/region/public URL),
  - shows resolved object URL from key, preview action, and “Save asset to KV” action,
  - renders inline image preview when the object is an image,
  - lists recently saved KV asset records for quick copy/open.
- Updated `AdminDashboard` to pass `uploadInfoDetails` into Media tab for richer R2 connection context.
- Verification:
  - `npm run lint -- src/components/admin/AdminMediaLibraryTab.js src/components/admin/AdminDashboard.js src/app/api/admin/media-library/cyberduck-r2/route.js src/lib/mediaAssetRegistry.js` (pass; existing `no-img-element` warnings unchanged),
  - `npm test -- tests/i18n-admin-parity.test.js` (pass; project script runs full suite, 169 pass / 0 fail / 3 skipped).
- Follow-up polish (commit `543f698`):
  - switched the new manual-ingest image preview from raw `<img>` to `next/image` (`unoptimized`) so lint warning count stays at the prior baseline (no additional `no-img-element` warnings from this feature).

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

- **WordPress plugin VAT schema parity** (`packages/ragbaz-bridge-plugin/ragbaz-bridge.php`):
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
- Moved the `Ctrl+Alt+M` hotkey hint inline next to the `RAGBAZ Bridge StoreFront` label in both welcome states.
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

- **Monorepo Setup**: Initialized with `packages/ragbaz-bridge-plugin/` for WordPress companion plugin.
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
- **Welcome subtitle naming**: Replaced the “story/berättelse/historia” subtitle label with `RAGBAZ Bridge StoreFront` in EN/SV/ES.
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
- **Plugin schema upgrade (`packages/ragbaz-bridge-plugin`)**:
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

- Removed `RAGBAZ Bridge StoreFront` from Welcome-screen content chrome so the brand text is no longer repeated outside the menu bar.
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
    - `packages/ragbaz-bridge-plugin/ragbaz-bridge.php`
    - `packages/ragbaz-bridge-plugin/package.json`
    - `packages/ragbaz-bridge-plugin/readme.txt` (stable tag/changelog)
  - Added runtime check helpers in plugin:
    - `WP_DEBUG`, `WP_DEBUG_LOG`, `SCRIPT_DEBUG`, `SAVEQUERIES`, `GRAPHQL_DEBUG`
    - Query Monitor active, Xdebug loaded
    - Persistent object cache enabled, OPcache loaded
    - Derived booleans: `debugFlagsOk`, `debugToolsOk`, `okForProduction`
  - Added wp-admin info screen:
    - `Tools -> RAGBAZ Bridge`
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
  - Verifies source zip exists at `packages/ragbaz-bridge-plugin/dist/ragbaz-bridge.zip`.
  - Copies the artifact to both destinations:
    - `public/downloads/ragbaz-bridge/ragbaz-bridge.zip`
    - `ragbaz.xyz/release/ragbaz-bridge.zip`

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
    - Capability matrix (WPGraphQL, RAGBAZ WP plugin bridge, Smart Cache, object cache)
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

---

## 2026-03-26

### Codex — plugin naming cleanup to `ragbaz-bridge` across active repos

- Completed plugin naming normalization in `main`:
  - Removed remaining legacy plugin-name references from source files.
  - Updated package/workspace wiring to `ragbaz-bridge-plugin` and download URL/path to `/downloads/ragbaz-bridge/ragbaz-bridge.zip`.
  - Finalized plugin package/file naming under `packages/ragbaz-bridge-plugin/` with `ragbaz-bridge.php` and `ragbaz-bridge.zip`.
  - Updated docs and tests to the renamed plugin/download paths.

- Mirrored the same rename in `wp-cf-front-oss`:
  - Renamed legacy plugin package path to `packages/ragbaz-bridge-plugin/`.
  - Renamed plugin entry file to `ragbaz-bridge.php`.
  - Renamed published/downloaded zip names and paths to `ragbaz-bridge.zip`.
  - Updated plugin readme/admin labels to use `RAGBAZ Bridge`.

- Verified there are no remaining legacy plugin-name hits in `main`, `wp-cf-front-oss`, and `wp-cf-front` source scans.

---

## 2026-03-26 (cont.)

### Codex — tenant claim API + connected-site screens + plugin call-home actions

- Landed in `ragbaz.xyz` service:
  - Added authenticated `POST /api/v1/home/events` endpoint for call-home event ingestion.
  - Added authenticated `POST /api/v1/home/tenant-claim` endpoint so storefront workers can claim occupancy of a `*.ragbaz.xyz` subdomain and bind it to a connected site domain/account.
  - Added connected-site screens/routes: `/articulate/sites`, `/articulate/sites/{gift_or_alias}`, and `/tenant/{domain}`.
  - Added tenant alias/domain/subdomain mapping keys and logic (including hardcoded fallback mapping `xtas.nu -> xtas`).
  - Extended tests for events, tenant claim flow, `xtas.ragbaz.xyz`, and `/tenant/xtas.nu`.
  - Commit pushed in nested repo `ragbaz.xyz`: `2ac7f13`.

- Landed in `main` plugin package:
  - Replaced Connect-tab placeholder with operational forms/actions:
    - save home URL + account credentials
    - send heartbeat snapshot (`/api/v1/home/heartbeat`)
    - send manual event (`/api/v1/home/events`)
  - Added local last-result reporting and direct links to tenant/site info screens.
  - Updated plugin zip copy script to publish to shared workspace `../ragbaz.xyz/release` (with local fallback).
  - Commit pushed on `main`: `dc578ea`.

- Landed in `wp-cf-front-oss`:
  - Updated plugin zip copy script to publish to shared workspace `../ragbaz.xyz/release` (with local fallback).
  - Commit pushed on `main`: `358df6c`.

---

## 2026-03-27

### Codex — runtime/performance hardening + test/build stability

- Landed runtime hardening in `main` (commit: `4e54a89`):
  - Added storefront GraphQL probe throttling (`src/lib/storefrontGraphqlProbe.js`) so probe runs once per process per TTL instead of every request.
  - Added universal configurable upload cap (`MAX_UPLOAD_BYTES`) with pre/post buffer enforcement in `src/app/api/admin/upload/route.js`.
  - Parallelized health checks and added timeout-bounded fetches in `src/app/api/admin/health/route.js` (`HEALTH_FETCH_TIMEOUT_MS`).
  - Fixed URI collision risk in REST fallbacks by requiring URI/path match before accepting fallback nodes (`src/app/[...uri]/page.js`).
  - Switched core-menu fallback appending to existence-aware mode (`ensureCoreMenuEntriesByExistence`) in `src/lib/menuFilter.js` + `src/lib/menu.js`.
  - Fixed admin TDZ/use-before-init risks in `AdminDashboard` and `AdminMediaLibraryTab`.
  - Added missing React display name for memoized font-row component.
  - Documented new perf/hardening knobs in `docs/performance-hardening.md`, `.env.example`, and `README.md`.

- Landed build/test stability updates (commit: `f8c94bb`):
  - Updated `npm test` to include `--experimental-test-module-mocks`, restoring passing font-related tests under current Node.
  - Removed `shell: true` from `scripts/build-with-lock.mjs` spawn call (removes DEP0190 warning and tightens command execution behavior).

- Verified after changes:
  - `npm run lint` passes (warnings only).
  - `npm test` passes (`25/25`).
  - Next build startup warnings fixed earlier remain resolved (middleware->proxy, invalid `next.config.mjs` keys).

### Codex — storefront/admin performance iteration (requested 2/3/4/5)

- Landed in `main`:
  - Implemented edge cache support for public GraphQL reads in `fetchGraphQL` (`src/lib/client.js`), with TTL/stale knobs.
  - Switched key storefront queries to use edge caching (`/`, `/events`, `/courses`, menu/home-events/shop listing queries, and URI resolver lookups).
  - Refactored `src/app/[...uri]/page.js` to a two-step fetch path:
    1) resolve node type via lightweight `nodeByUri` query
    2) fetch type-specific details (Page/Post/Event/LpCourse/product)
  - Kept REST/course fallbacks and hardened URI-match checks for fallback correctness.
  - Reduced admin entry JS pressure by lazy-loading `ChatPanel` and wrapping chat tab content in `Suspense`.
  - Replaced homepage events `<img>` with `next/image` (`src/components/home/EventCalendar.js`) for better storefront image delivery defaults.
  - Updated docs/env for new performance knobs (`GRAPHQL_EDGE_CACHE_TTL_SECONDS`, `GRAPHQL_EDGE_CACHE_STALE_SECONDS`).

- Validation:
  - `npm test` passes (`25/25`).
  - `npm run lint` passes (warnings only).
  - `npm run build` completes successfully (observed compile + static generation finish in the latest local run).

- Commits:
  - `c274d15` Optimize storefront fetch path with edge cache and typed node resolution
  - `df1eedf` Document edge GraphQL cache tuning knobs

### Codex — vitals relay observability + temporary logging window

- Landed in `main` (commit: `44e49eb`):
  - Added a temporary GraphQL-availability logging window in KV (TTL-backed) so logging can be enabled for a fixed duration and auto-expire.
  - Extended `/api/admin/graphql-availability` with `PATCH` (`enableForSeconds`) and GET metadata (`temporaryEnabledUntil`, `effectiveEnabled`).
  - Added admin action in Page Performance: `Record vitals now (1h)`; this enables temporary logging for one hour and submits an immediate vitals sample.
  - Added relay-status persistence for ragbaz.xyz vitals forwarding and surfaced it in admin (`last attempt`, `reason`, `HTTP status`), including missing connection and unauthorized relay failures.
  - Continued keeping permanent logging toggle semantics intact; disabling the permanent toggle now also clears any active temporary window.

- Validation:
  - `npm run lint -- src/lib/graphqlAvailability.js src/app/api/admin/graphql-availability/route.js src/app/api/admin/page-performance/route.js src/components/admin/GraphqlAvailabilityPanel.js src/components/admin/PagePerformancePanel.js` passes (existing repo warnings only).

### Codex — user-facing RAGBAZ casing normalization

- Landed in `main` (commit: `b1eee04`):
  - Renamed admin logo component filename to lowercase (`src/components/admin/ragbaz-logo.js`) and updated imports.
  - Normalized user-facing brand copy from mixed-case brand labels / lowercase `ragbaz.xyz` labels to `RAGBAZ` / `RAGBAZ.xyz` across admin docs tooltips, info hub links, relay-status panel text, and plugin connect/auth copy.
  - Updated i18n EN/SV/ES brand-facing strings (`docsExternal*`, docs tooltips, copyright-holder placeholder).
  - Aligned user-facing header examples to `X-RAGBAZ-Secret` wording in plugin docs/readme text.
  - Updated receipt proxy response header label to `X-RAGBAZ-Request-Id`.

- Validation:
  - `npm run lint -- src/components/admin/AdminHeader.js src/components/admin/ragbaz-logo.js src/components/admin/PagePerformancePanel.js src/lib/i18n/en.json src/lib/i18n/sv.json src/lib/i18n/es.json packages/ragbaz-bridge-plugin/ragbaz-bridge.php` passes (existing repo warnings only).
  - `node -e "JSON.parse(...)"` check for all three i18n files passes.

### Codex — continued RAGBAZ casing rollout across sibling repos

- Landed in `wp-cf-front-oss` (commit: `84a88f3`):
  - Normalized user-facing i18n placeholders to `RAGBAZ AB` (EN/SV/ES).
  - Normalized receipt response header label to `X-RAGBAZ-Request-Id`.

- Landed in `ragbaz.xyz` (commit: `b7af99a`):
  - Normalized site-facing brand copy to `RAGBAZ` / `RAGBAZ.xyz` in docs/frontpage/diagnostic text surfaces (`src/lib/pages.js`, `src/lib/payload.js`, `src/index.js`, `README.md`, `package.json`).
  - Kept filesystem/path references lowercase where they represent actual directory names (e.g. `cd ragbaz.xyz`).

- Validation:
  - `wp-cf-front-oss`: i18n JSON parse check passes.
  - `ragbaz.xyz`: `npm test` run observed one existing failure in `tests/home-api.test.js` (`302 !== 200` on hardcoded xtas alias route expectation), unrelated to casing text edits.

### Codex — final strict casing sweep (no mixed-case `Ragbaz` tokens left)

- Landed in `main` (commit: `c45c898`):
  - Normalized remaining mixed-case brand token in `.env.example`.
  - Normalized residual mixed-case mentions in coop history text.

- Landed in `ragbaz.xyz` (commit: `1e827af`):
  - Normalized migration banner comment casing (`RAGBAZ control plane`).

### Codex — OpenNext `cf:build` fix for proxy runtime (commit: `1f34556`)

- Root cause: OpenNext rejected Node.js middleware/proxy runtime during `npm run cf:build` (`Node.js middleware is not currently supported`).
- Fix: set explicit edge runtime in [`src/proxy.js`](src/proxy.js) via `export const runtime = "edge";`.
- Result: proxy remains active for admin/map/WebDAV matching, but now compiles for Cloudflare Worker target.

- Validation:
  - `npx eslint src/proxy.js`
  - `node --check src/proxy.js`

### Codex — resolved Next16/OpenNext proxy conflict by reverting to middleware (commit: `1161f8d`)

- Replaced `src/proxy.js` with `src/middleware.js` (same logic, edge middleware convention).
- Reason: Next 16 `proxy` is Node-only and forbids route-segment runtime config, while current OpenNext CF build rejects Node middleware/proxy runtime.
- Preserved behavior:
  - admin/map request-id tagging (`x-request-id`, `reqid` cookie)
  - WebDAV `PROPFIND`/`MKCOL` forwarding to POST with `x-dav-method`.

- Validation:
  - `npx eslint src/middleware.js`
  - `node --check src/middleware.js`

### Codex — docs-context diacritics + contrast fix (commit: `c817d21`)

- Fixed missing diacritics in admin docs context copy:
  - SV: `Behöver du hjälp?`
  - ES: `¿Necesitas ayuda?`
- Improved docs context chip/link contrast in `AdminDocsContextLinks` so labels remain legible across themes.
- Validation:
  - JSON parse checks for `src/lib/i18n/sv.json` and `src/lib/i18n/es.json`
  - `npx eslint src/components/admin/AdminDocsContextLinks.js`

### Codex — docs-context pill contrast hardening (commit: `4a8729a`)

- Replaced docs-context color utilities with dedicated classes (`admin-docs-context-pill`, `admin-docs-context-link`).
- Added explicit high-contrast colors with `!important` in `globals.css` to prevent theme overrides from producing low-contrast text.
- Result: the docs help pill/link labels remain legible across all admin themes.

### Codex — admin theme reset to Sun/Moon + source-map debug uplift (commit: `a304dd3`)

- Reduced admin theme model to two themes only:
  - `sun` (solarized light)
  - `moon` (solarized-gruvbox dark)
- Added migration mapping for legacy stored theme values (`light/gruvbox/earth/lollipop`) so existing sessions map to `sun/moon` without breaking.
- Replaced multi-theme hardcoded color branches with tokenized admin palette variables in `globals.css`, including shared header/drawer/control/ticker/docs-chip styling.
- Updated theme toggle semantics/icons in admin header to `☀ / 🌙` and localized labels to Sun/Moon in EN/SV/ES.
- Enabled production browser source maps by default (opt-out via `PRODUCTION_BROWSER_SOURCEMAPS=0`) and exposed stack details in admin error UI for faster diagnosis of minified runtime errors.

- Validation:
  - `npx eslint src/components/admin/AdminHeader.js src/components/admin/AdminThemeWrapper.js src/components/admin/AdminDocsContextLinks.js next.config.mjs src/app/admin/error.js`
  - JSON parse checks for `src/lib/i18n/en.json`, `sv.json`, `es.json`
  - `node --check` for updated JS files
  - `node --test tests/i18n-admin-parity.test.js`

### Codex — removed admin theme switching, locked to Water palette (commit: `0f9dab0`)

- Removed all admin theme cycling/state/hotkey behavior (no localStorage theme switching, no Ctrl+Alt+T action, no sun/moon toggle button).
- Admin now always renders with `admin-theme-water` via `AdminThemeWrapper`.
- Reworked admin palette tokens to a single Water theme aligned with `ragbaz.xyz` Water direction (`#002b36/#073642` surfaces, blue+teal accents, high-contrast text).
- Simplified header/drawer styling to rely on one token set instead of multi-theme branches.

- Validation:
  - `npx eslint src/components/admin/AdminHeader.js src/components/admin/AdminThemeWrapper.js src/lib/adminHotkeys.js src/app/admin/layout.js`
  - `node --check` for updated JS files

### Claude — review of Codex ISR/force-dynamic changes (2026-03-30)

**Context:** Codex commit `2f176f9` removed global `force-dynamic` from root `layout.js` and refactored `menu.js` for non-blocking cold starts to reduce TTFB. This is the second time `force-dynamic` has been removed from the root layout — the first time (earlier Codex commit around line 953 of this file) caused 500 errors on `/courses/`, `/auth/register/`, `/auth/signin/`, requiring emergency restoration in commit `96b2e1c`.

**Risk assessment — pages relying on implicit dynamic detection:**

The following pages use `auth()` (which calls `cookies()` from `next/headers`) and/or `await searchParams` but have NO explicit `export const dynamic = "force-dynamic"`. They rely on Next.js automatically opting into dynamic rendering when it detects `cookies()` usage at render time:

| Page | Runtime APIs | Risk |
|------|-------------|------|
| `src/app/[...uri]/page.js` | `auth()`, `searchParams`, `params`, `unstable_noStore` | **CRITICAL** — catch-all handling most traffic |
| `src/app/shop/[slug]/page.js` | `auth()`, `searchParams`, `params` | **HIGH** — Stripe checkout flow |
| `src/app/me/page.js` | `auth()`, `redirect()` | HIGH — user dashboard |
| `src/app/inventory/page.js` | `auth()`, `redirect()` | HIGH — user inventory |
| `src/app/inventory/[assetId]/page.js` | `auth()`, `params` | HIGH — asset detail |
| `src/app/profile/[username]/page.js` | `auth()`, `params` | HIGH — public profiles |
| `src/app/avatar/[avatarId]/page.js` | `auth()`, `params` | MEDIUM |
| `src/app/assets/[assetId]/page.js` | `adminAuth()`, `params` | MEDIUM — admin only |

**Predicted failure modes:**

1. **Build-time static generation attempt:** Without `force-dynamic`, Next.js may attempt to statically pre-render these pages at build time. If `auth()`/`cookies()` is called during build, it will throw because there is no request context. The `@opennextjs/cloudflare` adapter's handling of implicit dynamic detection from `cookies()` may differ from Vercel's — this was the exact cause of the 500s fixed by commit `96b2e1c`.

2. **ISR caching of authenticated content:** If implicit dynamic detection works at build time but ISR caching kicks in at runtime, a first visitor's auth state (or lack thereof) could be cached and served to subsequent visitors. This would manifest as: logged-in user sees "not authenticated" page, or anonymous user sees another user's content.

3. **`unstable_noStore()` in `[...uri]/page.js`:** This is a weaker signal than `force-dynamic`. It opts out of the data cache but may not prevent the route from being statically generated at build time, depending on the adapter.

4. **`generateMetadata` in `shop/[slug]/page.js`:** Uses `searchParams` and `process.env` reads. If the page is pre-rendered, metadata generation could fail or produce stale results.

**What to watch for:**
- 500 errors on any of the listed pages after deploy
- Stale or wrong auth state being served (cached ISR pages)
- Build failures mentioning `cookies()` or `headers()` called outside request context
- The `/courses/` route was the original 500 trigger — verify it still works

**Actions taken:**

1. **Added explicit `force-dynamic` to 7 auth-dependent pages:**
   - `src/app/me/page.js`
   - `src/app/inventory/page.js`
   - `src/app/inventory/[assetId]/page.js`
   - `src/app/profile/[username]/page.js`
   - `src/app/avatar/[avatarId]/page.js`
   - `src/app/assets/[assetId]/page.js`
   - `src/app/shop/[slug]/page.js`

2. **Deferred `await searchParams` in `src/app/[...uri]/page.js`:**
   The catch-all already conditionally calls `auth()` + `noStore()` only for paid content types (`isPaidAccessType`). But `await searchParams` was resolved unconditionally at the top, forcing ALL content types dynamic. Moved it into the paid-access branch so `Post` and `Page` types remain ISR-eligible. This is the "auth as island" pattern at the route level — free content never touches cookies/searchParams, paid content opts into dynamic via `noStore()` + `auth()`.

3. **Future island opportunity — `/shop/[slug]`:**
   Product info is public but `auth()` is called unconditionally to check ownership. Could be refactored: static product shell (ISR) + client island that calls `/api/shop/ownership?productId=X` to show "already purchased" badge and download link. This would let product pages cache via ISR while personalizing client-side. Marked `force-dynamic` for now as the safe path.

**Result:** Root layout stays ISR-default (Codex change preserved). Auth-dependent pages are explicitly dynamic. Free content pages (`Post`, `Page` via catch-all) can benefit from ISR/static caching.
