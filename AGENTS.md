# AGENTS Instructions

Shared living document for **Claude** and **Codex** co-working in this repository.
Both agents MUST read this at session start and update it whenever priorities shift or significant work is landed.

---

## Agent status

- **Claude** has handed the active backlog to Codex. Codex now owns the current iteration of the storefront/admin story until Claude resumes. Continue using the existing protocols (docs lock, AGENTS/coop updates, build lock) and flag any handoff reversals via the coop log so we keep the transition documented.

## Project overview

WordPress-headless course/shop/events platform deployed on **Cloudflare Workers** with:

- **Next.js 16** (App Router, Turbopack for dev, OpenNext for CF)
- **WordPress GraphQL** (primary content source, WPGraphQL + LearnPress + WooCommerce)
- **Cloudflare KV** (access tokens, support tickets, AI quota, digital products)
- **Cloudflare R2 / AWS S3** (file uploads)
- **Stripe** (payments — charges, receipts)
- **Cloudflare Workers AI** (FLUX.1 schnell image generation, embeddings + chat RAG)

Monorepo — `packages/ragbaz-articulate-plugin/` is the companion WordPress plugin.

---

## Key commands

| Purpose      | Command               |
| ------------ | --------------------- |
| Dev server   | `npm run dev`         |
| Build (Node) | `npm run build`       |
| Build (CF)   | `npm run cf:build`    |
| Deploy to CF | `npm run cf:deploy`   |
| Run tests    | `npm test`            |
| Lint         | `npm run lint`        |
| Plugin zip   | `npm run plugin:copy` |

Tests use `node:test` (no Jest/Vitest). Add new test files under `tests/`.

### Build lock

**Before running any build, check for `building.lock.pid` in the repo root.**
If it exists, another build is already in progress — wait or investigate before starting another.

```
# check
cat building.lock.pid        # shows pid, started timestamp, command

# if it's stale (process no longer running), delete it manually:
rm building.lock.pid
```

The lock is created automatically by `scripts/build-with-lock.mjs` and removed on success, failure, or Ctrl+C. It is `.gitignore`d and never committed.

---

## Important architectural patterns

### Edge runtime

- `src/auth.js` uses **Web Crypto API** (`crypto.subtle`) — no `node:crypto` anywhere in auth or admin routes.
- Session functions (`encodeSession`, `decodeSession`, `requireAdmin`, etc.) are **async**.
- Always `await requireAdmin(request)` in API routes.
- Routes that import `node:` modules must set `export const runtime = "nodejs"` (not edge).

### KV storage

- `src/lib/cloudflareKv.js` wraps KV access; falls back to in-memory on non-CF runtimes.
- Fail-open on KV errors (don't crash the request, log and continue).

### i18n

- Translation files: `src/lib/i18n/en.json`, `sv.json`, `es.json` — must stay in sync.
- Placeholder syntax: `{param}` (e.g. `"used {used} of {limit}"`).
- `t(key, params)` is the call site.
- **Known past bug**: missing comma after `"languageHint"` key made all three files invalid JSON. Always validate JSON after editing.

### Admin UI

- All admin tabs live in `src/components/admin/`.
- `AdminDashboard.js` is the top-level shell — add new tabs there.
- Hotkeys: **Ctrl+Alt+0..8** for tabs (plus **Ctrl+Alt+S** for Storage), **Ctrl+Alt+/** search, **Ctrl+Alt+L** logout, **Ctrl+Alt+M** hamburger toggle. Update the legend when adding tabs.
- Tabs currently: Welcome, Sales, Stats, Products, Storage, Support, Chat, Health, Style, Info.
- Nav items array is in `AdminHeader.js` — add `{ label: t("admin.navX"), tab: "x" }` entry when adding a tab.

### Prices

- Always render as `"750 SEK"` format (no decimals, currency after amount).
- `normalizePrice()` in `src/lib/utils.js` handles WooCommerce raw strings like `"kr750.00"`.

---

## File ownership guide

Neither agent has exclusive ownership — coordinate via the coop file and this doc.
But here are natural areas of focus:

| Area                                                    | Notes                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/auth.js`, `src/lib/adminRoute.js`                  | Auth — touch carefully; any change cascades to ~20 API routes    |
| `src/app/api/admin/*`                                   | Admin API routes — edge runtime; one folder per feature          |
| `src/components/admin/*`                                | Admin UI components                                              |
| `src/lib/i18n/*.json`                                   | Translations — always update all three languages together        |
| `src/lib/ai.js`, `src/lib/imageQuota.js`                | AI helpers — pure functions, well-tested                         |
| `src/lib/cloudflareKv.js`, `src/lib/digitalProducts.js` | KV/storage layer                                                 |
| `packages/ragbaz-articulate-plugin/`                    | WordPress plugin — independent; build with `npm run plugin:copy` |
| `tests/`                                                | `node:test` tests — run with `npm test`                          |

---

## Coordination protocol

1. **`claude+codex-coop.md`** is the shared worklog. Append a bullet after every landed feature. Read it at the start of each session.
2. **This file (`AGENTS.md`)** is for standing instructions, priorities, and architecture notes. Update it when priorities shift or new patterns are established.
3. **Branch**: both agents work on `main`. Commit and push after each logical unit of work so the other agent can pull and see the change. Avoid long-running local-only branches.
4. Before touching a file the other agent recently committed, pull first.
5. If you discover a bug or leave something half-done, note it at the top of the coop file with `TODO:` so the other agent doesn't step on it.

### Shared-doc lock protocol (AGENTS.md and claude+codex-coop.md)

Both agents edit the same two files. To prevent merge conflicts, use `docs.lock.pid` as an advisory lock before editing either file.

**Before editing `AGENTS.md` or `claude+codex-coop.md`:**

```bash
# 1. Check — is the lock free?
node scripts/docs-lock.mjs check

# 2. Acquire it
node scripts/docs-lock.mjs acquire codex "AGENTS.md, claude+codex-coop.md"

# 3. Pull to get the latest version
git pull

# 4. Make your edits, then commit and push immediately
git add AGENTS.md claude+codex-coop.md
git commit -m "...
git push

# 5. Release the lock
node scripts/docs-lock.mjs release
```

**Rules:**

- Acquire → pull → edit → commit+push → release. Always in that order.
- Hold the lock for the shortest time possible. Never hold it across multiple separate tasks.
- If the lock is held, **wait** — do not edit the files until the other agent releases.
- If the lock looks stale (process long gone, no recent commit), delete it: `rm docs.lock.pid`
- `docs.lock.pid` is `.gitignore`d — it never gets committed.

**Lock file contents** (for reference):

```json
{
  "pid": 12345,
  "agent": "codex",
  "files": "AGENTS.md, claude+codex-coop.md",
  "started": "2026-03-19T14:00:00.000Z"
}
```

---

## Environment variables (key ones)

| Var                                       | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `WORDPRESS_API_URL`                       | WP GraphQL endpoint                                             |
| `WORDPRESS_GRAPHQL_APPLICATION_PASSWORD`  | Basic auth for WPGraphQL                                        |
| `FAUST_SECRET_KEY` / `FAUSTWP_SECRET_KEY` | Faust auth fallback                                             |
| `CF_ACCOUNT_ID` / `CLOUDFLARE_ACCOUNT_ID` | CF account for AI + KV REST                                     |
| `CF_API_TOKEN`                            | CF API token (Workers AI, KV REST, R2)                          |
| `CF_KV_NAMESPACE_ID`                      | KV namespace — **required** for AI quota and ticket persistence |
| `AI_IMAGE_DAILY_LIMIT`                    | Max FLUX images/day (default 5)                                 |
| `STRIPE_SECRET_KEY`                       | Stripe API                                                      |
| `ADMIN_PASSWORD`                          | Admin UI login                                                  |

Full list in `.env.example`.

---

## Current priorities

### Ranked backlog (see coop file for full detail)

1. **P2 / Medium** — Add an admin-header scrolling stats ticker (revenue, users, bought products, sales/user %, weekly average hits/day) backed by one aggregated admin endpoint with resilient fallbacks.
2. **P3 / Medium** — Full code review pass focused on code quality, maintainability, and admin UI usability improvements.
3. **Follow-up / Monitoring** — Watch new P0/P1/P2/P3 changes (image diagnostics, receipt fallback trace, VAT propagation, dead-link scanner, doc refresh) for regressions.

### Working rules for this backlog

- Execute in listed order unless a production regression interrupts.
- Keep TODO ownership/status in `claude+codex-coop.md` top section.
- Run targeted lint/tests after each backlog item lands.

---

## Recent work log (summary — full detail in coop file)

- **2026-03-19 (Codex)**: Updated header theme-toggle glyph color treatment so both sun/moon icons render in a strong yellow tone with a lighter yellow hover state while preserving the existing dark-gray edge outline.
- **2026-03-19 (Codex)**: Refactored the Info-tab torus banner layout: torus moved to the left with increased canvas height, donut hole narrowed by geometry update (`MINOR_RADIUS` increase), removed prior logo/info/dark overlay layers, and added a right-side animated sine scroller text line (`RAGBAZ - standing on the shoulders of giants and bending spoons since 1987`).
- **2026-03-19 (Codex)**: Completed postponed Style-tab localization and clarity pass: translated all Style-tab UI copy to EN/SV/ES, renamed the site section heading to child-theme style guide wording (SV: `Stilguide, barntema`), clarified admin style heading as admin-only, and made heading/body font preview cards use dynamic site theme tokens (`--color-background`/`--color-foreground`/etc.) with explicit padded surfaces.
- **2026-03-19 (Codex)**: Upgraded header logo subtitle alignment logic: `ARTICULATE STOREFRONT` now left-aligns to `RAGBAZ` baseline offset and auto-scales on mount/resize (via measured width ratio) so subtitle width tracks both left and right edges of the wordmark more precisely.
- **2026-03-19 (Codex)**: Fine-tuned header subtitle alignment by shifting `ARTICULATE STOREFRONT` back `0.25rem` (from `1.5rem` to `1.25rem` left offset) for tighter logo lockup balance.
- **2026-03-19 (Codex)**: Continued product-image uploader hardening: made image pickers visually explicit/clickable (stronger frame, visible upload label, focus ring), and wired image uploads to respect the selected `uploadBackend` (WordPress/R2/S3) by passing backend through `ImagePickerButton` → `ImageUploader` → `/api/admin/upload`.
- **2026-03-19 (Codex)**: Header/Products micro-polish pass: changed sun/moon icon outline from pure black to dark gray for softer contrast, shifted `ARTICULATE STOREFRONT` subtitle another `0.5rem` right, and fixed a non-localized Products empty-state string by moving it to i18n keys in EN/SV/ES.
- **2026-03-19 (Codex)**: Restyled the header `Status` control to match the hamburger button surface (same amber-dark background/hover/focus treatment) and kept direct navigation to Health check on click.
- **2026-03-19 (Codex)**: Added a black edge-outline effect to the header sun/moon theme icon glyphs so they remain legible over the textured amber menu bar.
- **2026-03-19 (Codex)**: Updated the header hotkey hint styling so `Ctrl+Alt+M` under the hamburger icon now renders in black to match the latest menu-bar contrast preference.
- **2026-03-19 (Codex)**: Switched the `ARTICULATE STOREFRONT` subtitle text in the admin header logo lockup to black for stronger contrast preference against the amber menu bar.
- **2026-03-19 (Codex)**: Updated header color balance per request: lowered menu-bar/background saturation+brightness while increasing the `RAGBAZ` cyan wordmark intensity for stronger brand contrast.
- **2026-03-19 (Codex)**: Adjusted admin header branding polish: shifted `ARTICULATE STOREFRONT` ~`0.5rem` further right, toned down `RAGBAZ` wordmark color saturation/brightness, and enlarged sun/moon theme toggle glyphs for better visibility.
- **2026-03-19 (Codex)**: Added a `Fri åtkomst` / `Free access` / `Acceso gratuito` checkbox in the price editor that sets price to `0`, disables the price input while checked, and re-enables price editing on uncheck.
- **2026-03-19 (Codex)**: Simplified user-facing price copy to remove backend implementation details (`priceSavedLocally`) and aligned fee hint text with the new free-access checkbox flow.
- **2026-03-19 (Codex)**: Completed VAT panel dark-theme polish: removed white surfaces via dedicated `admin-vat-panel`/`admin-vat-surface` gruvbox styles and set VAT heading/hint emphasis to requested contrast (`vatMapTitle` white, `vatMapHint` soft yellow).
- **2026-03-19 (Codex)**: Tuned the Products empty-state hint (“Select an item to configure access”) to soft yellow in gruvbox/dark mode via `.admin-soft-yellow` while keeping neutral gray in light mode.
- **2026-03-19 (Codex)**: Renamed inner tab copy from “Digital products” to “Digital downloads” (SV: “Digitala nedladdningar”, ES: “Descargas digitales”) for clearer operator wording.
- **2026-03-19 (Codex)**: Fixed low-contrast dark-theme heading text in admin by overriding gruvbox heading/title colors (`h1..h6`, `text-slate-900/800`) to white.
- **2026-03-19 (Codex)**: Further hardened product image uploader behavior: use `showPicker()` fallback plus off-screen (not display-none) file input for broader browser support; reinforced product tile frame via explicit ring overlay and persistent top-right pen badge layer.
- **2026-03-19 (Codex)**: Refined header branding/texture visuals: shifted only the `RAGBAZ` wordmark `1.5rem` right (subtitle untouched) and increased menu-bar concrete microtexture density/detail using higher-frequency turbulence layers.
- **2026-03-19 (Codex)**: Localized inner Products editor tabs by i18n keys: `All products`, `Digital products`, and `Visible types` now translate in EN/SV/ES (`productsTabAll`, `productsTabDigital`, `visibleTypesTab`).
- **2026-03-19 (Codex)**: Restored robust product-image replacement click flow by changing `ImageUploader` to use a persistent hidden file input (`ref + click`) and making image pen overlays non-blocking (`pointer-events-none`) with an always-visible pen badge.
- **2026-03-19 (Codex)**: Fixed duplicate selected-title rendering in Products detail panes (single title line only) and added dark-gray framing for empty image placeholders/pickers to improve visual affordance.
- **2026-03-19 (Codex)**: Hardened image-crop save UX by closing/resetting the crop dialog immediately on successful upload before parent callbacks, preventing stuck modal cases after save.
- **2026-03-19 (Codex)**: Mitigated edge-runtime `fs`-related upload failures by moving AWS S3 SDK usage in `s3upload.js` to lazy dynamic imports and async Node-only call paths (instead of static top-level imports).
- **2026-03-19 (Codex)**: Improved Products tab selection UX: selected rows now use inverse dark/light contrast, left list panes widened to `340px`, and right detail panes now show full product/content titles with wrapping (no truncation-only headers).
- **2026-03-19 (Codex)**: Fixed status tooltip overlap/clipping in admin header by switching header container from `overflow-hidden` to `overflow-visible` and raising tooltip stacking (`z-[80]`).
- **2026-03-19 (Codex)**: Added configurable letter-outline support to `RagbazLogo` (`outlineColor`, `outlineWidth`) and enabled a black 1px outline for the admin header `RAGBAZ` wordmark.
- **2026-03-19 (Codex)**: Replaced menu-bar dot texture with a stronger Perlin-style concrete effect using dual SVG `feTurbulence` (coarse + fine) overlay layers in `globals.css`, with blend/contrast tuning for visible grain.
- **2026-03-19 (Codex)**: Expanded Welcome control-room cards to mirror all admin menu destinations (Welcome, Sales, Stats, Storage, Products, Chat, Health, Style, Info, Support, Docs), switched to a denser row-first responsive grid, and reduced card typography for compact fit.
- **2026-03-19 (Codex)**: Added missing EN/SV/ES i18n copy for the new Welcome control-room cards (`cardWelcomeBody`, `cardHealthBody`, `cardStyleBody`, `cardInfoBody`, `cardDocsBody`).
- **2026-03-19 (Codex)**: Refined header lockup alignment by shifting the subtitle line left to a compact `0.5rem` offset and kept the moon theme glyph as `🌙`.
- **2026-03-19 (Codex)**: Restored the previous moon glyph (`🌙`) for the theme toggle while keeping the button unframed (no circular background) per current admin header style.
- **2026-03-19 (Codex)**: Tuned admin header palette toward a yellower, lower-saturation amber and aligned the `ARTICULATE STOREFRONT` subtitle with explicit `2em` horizontal offset beneath `RAGBAZ` for steadier cross-font rendering.
- **2026-03-19 (Codex)**: Shifted Welcome screen story background from vivid indigo/blue to a lower-saturation steel gray-blue gradient to improve visual calm while preserving high-contrast white text.
- **2026-03-19 (Codex)**: Added a subtle concrete/noise microtexture overlay on the menu bar (`admin-header-concrete`) using layered radial/repeating gradients with soft-light blending.
- **2026-03-19 (Codex)**: Enhanced header status control UX: moved colored status dot to the right of the status label, added hover/focus tooltip explaining current health state, and added direct “Control check” action link in tooltip to open Health tab.
- **2026-03-19 (Codex)**: Added admin navigation action hotkeys: `Ctrl+Alt+Right/Down` for next menu tab and `Ctrl+Alt+Left/Up` for previous tab (with wrap-around), plus `Ctrl+Alt+T` as a theme-toggle shortcut. Also simplified theme toggle button visuals to remove circular framing/background and use a plain moon glyph.
- **2026-03-19 (Codex)**: Reworked admin navigation hotkeys to numeric ascending order (`Welcome=0`, then `1..9` by menu order), removed the separate drawer hotkey legend, displayed per-item numeric key badges directly on menu options, and added directional cycling shortcuts (`Ctrl+Alt+Right/Down` next, `Ctrl+Alt+Left/Up` previous) with wrap-around tab navigation.
- **2026-03-19 (Codex)**: Updated admin menu bar palette from blue to orange (`bg-orange-*`), including hamburger/theme controls and drawer shell/hotkey surfaces, for a consistent orange navigation/header appearance.
- **2026-03-19 (Codex)**: Removed `RAGBAZ Articulate StoreFront` text from the Welcome screen content area (story + non-story variants) so branding is only shown in the menu bar as requested.
- **2026-03-19 (Codex)**: Fine-tuned menu lockup alignment by shifting the `RAGBAZ` wordmark ~14px to the right in `AdminHeader` (`ml-[14px]`) to better align with the `ARTICULATE STOREFRONT` subtitle line.
- **2026-03-19 (Codex)**: Hardened admin chunk-load failure recovery in `src/app/admin/error.js`: detect `ChunkLoadError`/`Failed to load chunk`, auto-trigger a single cache-busted reload (`/admin?reload=<ts>`), and make manual reload use the same cache-busting path to avoid stale bundle loops after deploy.
- **2026-03-19 (Codex)**: Refined menu-bar branding layout: increased `RAGBAZ` size substantially via `RagbazLogo` scale prop and moved `ARTICULATE STOREFRONT` to a second line directly beneath it to eliminate overlap and improve visual hierarchy.
- **2026-03-19 (Codex)**: Fixed a Storage docs-selection bug by removing server-only env checks from the client component and deriving R2/S3 documentation links from selected backend + backend response (`uploadBackend`, `uploadInfoDetails.isR2`, `uploadInfo`), preventing wrong docs from showing in browser runtime.
- **2026-03-19 (Codex)**: Performed an explicit TDZ sweep on source files (`no-use-before-define` with variable/class checks, excluding build artifacts) and fixed one additional real risk in `AdminDashboard` by moving `uploadInfoDetails` state declaration above `loadUploadInfo` usage.
- **2026-03-19 (Codex)**: Fixed admin runtime crash (`Cannot access '<minified>' before initialization`) by resolving a temporal-dead-zone bug in `AdminDashboard`: `runHealthCheck` is now declared before the effect that depends on it. Also adjusted header brand spacing so `ARTICULATE STOREFRONT` no longer overlaps `RAGBAZ`.
- **2026-03-19 (Codex)**: Switched course-access backend defaults to Cloudflare KV (`COURSE_ACCESS_BACKEND=cloudflare-kv` in `.env.example` and `wrangler.jsonc`), made upload-info backend-aware (`/api/admin/upload-info?backend=...`), and redesigned the Storage tab to remove repeated R2/S3 credential blocks in favor of one canonical checklist with copy actions.
- **2026-03-19 (Codex)**: Updated admin header branding to show `RAGBAZ` followed by white `ARTICULATE STOREFRONT`, replaced Welcome story image slide live endpoint usage with static mock data/preview, and enforced white `!important` story chrome text outside the slide viewport for consistent contrast.
- **2026-03-19 (Codex)**: Simplified the menu hotkey legend by removing the Welcome-screen “Open menu / Öppna meny” chip and placing a smaller plain `Ctrl+Alt+M` hint directly under the hamburger icon in the admin header.
- **2026-03-19 (Codex)**: Fixed Workers AI context-loader interop/runtime error (`Cannot read properties of undefined (reading 'default')`) by replacing static `@opennextjs/cloudflare` import in `src/lib/ai.js` with guarded lazy dynamic loading and safe REST fallback.
- **2026-03-19 (Codex)**: Increased Welcome slideshow usable area by removing the story-mode headline, moving the menu hotkey hint inline with the product label, and enforcing high-contrast light text styling on dark-blue header surfaces.
- **2026-03-19 (Codex)**: Tuned Welcome UI readability by increasing dark-theme contrast for the menu hotkey hint chip and compacting/localizing the welcome headline (`Control Panel` / `Kontrollpanel` / `Panel de control`) to reclaim vertical space.
- **2026-03-19 (Codex)**: Completed documentation UX refresh by updating `README.md` + `docs/README.en.md` + `docs/README.sv.md` with current admin tab flow/instructions and embedding new GUI visuals from `public/docs/admin/*.svg`.
- **2026-03-19 (Codex)**: Completed P2 backlog items by replacing the Welcome image-generator mock with live quota/snapshot state plus read-only fallback, and by adding an admin dead-link finder (`/api/admin/dead-links` + Support panel) with internal/pseudo-external/external classification and reachability checks.
- **2026-03-19 (Codex)**: Closed the current P0/P1 batch by wiring `vatPercent` through the WordPress plugin GraphQL schema/mutation (`CourseAccessRule`, `SetCourseAccessRuleInput`, `setCourseAccessRule`), keeping storefront/admin VAT persistence aligned end-to-end; removed an unused legacy course-access helper; verified with `npm run lint` (warnings only) and `npm test` (15/15 pass).
- **2026-03-19 (Codex)**: Hardened admin documentation routing by fixing `/admin/docs` index slug links, broadening markdown link rewrites to keep `docs/*.md` references inside `/admin/docs/*`, and switching chat manual source links from `/docs` to `/admin/docs` to prevent admin-side 404s.
- **2026-03-19 (Codex)**: Added generalized product category extraction across WooCommerce/LearnPress/Events plus digital-file extension/MIME heuristics, and implemented a new VAT-by-category editor in Products → Access backed by `shopSettings.vatByCategory` persistence.
- **2026-03-19 (Codex)**: Improved Stripe purchase clarity by sending explicit payment-intent/line-item descriptions and mirrored metadata (`product_name`, `course_title`, etc.) during checkout, then updating admin payment normalization to use configured currency (default `SEK`) and metadata-backed description fallback when charge descriptions are empty.
- **2026-03-19 (Codex)**: Product/Stripe reliability pass: normalized admin tab event payloads, blocked AltGraph from triggering Ctrl+Alt admin hotkeys, and tightened `/api/admin/payments` query parsing (`email` trim/lowercase, safe `limit` clamp, safe `from` parse).
- **2026-03-19 (Codex)**: Fixed payments error UX regressions by adding missing `admin.paymentsLoadFailed`/`admin.paymentsRetryHint` and Stripe-specific error keys in EN/SV/ES; mapped backend Stripe error classes to explicit codes/messages so users no longer see raw `stripe_lookup_failed`.
- **2026-03-19 (Codex)**: Hardened product visibility/access consistency: canonical URI normalization (strip trailing slash) in course access store + WordPress backend integration, fallback-compatible GraphQL handling for plugin versions lacking `active`, and storefront/paywall/checkout guards to hide or block inactive configured WP items.
- **2026-03-19 (Codex)**: Extended `ragbaz-articulate` plugin course-access schema to include `active` and versioned plugin header to `1.0.1`, while preserving legacy behavior when `active` is omitted in older client mutations.
- **2026-03-19 (Codex)**: Massive bug-hunt pass: fixed chat input spacebar/key typing interference by stopping propagation in `ChatPanel`, fixed stale tab loader logic (`activeTab === "shop"` -> `products`), repaired manual URI entry flow in Access tab (input no longer self-clears on first keystroke), and wired WP/manual active-state toggling through admin save + API so disabled course-access items can be hidden from storefront listings.
- **2026-03-19 (Codex)**: Fixed recurring admin auto-navigation by hardening hash routing against unknown fragments (including stale impress.js step hashes): header now ignores non-tab hashes, dashboard normalizes unknown hashes back to the active tab, and Welcome adds stronger impress teardown/hash stabilization while the story is active.
- **2026-03-19 (Codex)**: Improved admin operator clarity by distinguishing payments fetch errors from empty sales data, adding explicit payments-load error state in Sales/Support, and adding safe broken-image fallbacks in product/admin previews.
- **2026-03-19 (Codex)**: Added storefront guardrails so WP-backed products/courses/events still list when parsed price metadata is missing, with a fallback if shop visible-type settings accidentally hide all core source types.
- **2026-03-19 (Codex)**: Rebuilt the Welcome presentation with richer mock slides (architecture -> sales -> products -> AI chat), wired skip/replay visibility state in `AdminDashboard`, and fixed all known `react-hooks/exhaustive-deps` warnings in touched admin files.
- **2026-03-19 (Codex)**: Continued header/menu restructuring by converting the hamburger panel into a drawer with fixed backdrop, Escape-to-close, and route-change close behavior; moved the hotkey legend from a floating panel into per-item hints inside the hamburger menu.
- **2026-03-19 (Codex)**: Added `src/lib/adminHotkeys.js` as a single hotkey contract used by both `AdminDashboard` and `AdminHeader`, plus two new guard tests: `tests/admin-hotkeys.test.js` and `tests/i18n-admin-parity.test.js` (admin locale-key parity EN/SV/ES).
- **2026-03-19 (Codex)**: Added responsive welcome slideshow sizing in `AdminWelcomeTab` to avoid oversized impress slides on larger displays, and extracted welcome revision state/persistence logic to `src/lib/adminWelcomeRevision.js` with `tests/admin-welcome-revision.test.js`.
- **2026-03-20 (Codex)**: Reorganized the admin tabs so storage/configuration now lives in its own Storage tab (with S3/R2 docs, SFTP recommendations, and env info), while the renamed Sandbox tab keeps deploy, explore, commit, and debug tooling.

- **2026-03-20 (Codex)**: Added the Welcome tab (default, Alt+0) that renders the migration story via impress.js slides, plus the matching nav item, hotkey legend update, and new i18n keys.
- **2026-03-20 (Codex)**: Introduced the rotating torus banner in the Advanced tab and created the reusable `RagbazLogo` component so the StoreFront logo can be shown without the animation.
- **2026-03-21 (Codex)**: Added `/api/admin/storage-objects` plus a bucket-list widget beside the digital-file uploader so Cyberduck/S3 uploads can be copied or assigned to products without reuploading.
- **2026-03-19 (Codex)**: Added hash-based admin tab routing (`/admin#/welcome`, `/admin#/sales`, etc.) with backward alias `#/sandbox -> #/info`, stabilized impress.js hash behavior so welcome slides no longer pollute URL after exit, and fixed admin scroll lock by tearing down impress viewport classes/styles on exit/unmount.
- **2026-03-19 (Codex)**: Tightened responsive admin layout containers (`min-w-0`, responsive grids, wrapped headers/toolbars) so tabs fit viewport width and remain scrollable without hidden overflow traps.
- **2026-03-19 (Codex)**: Renamed Sandbox to Info (tab/hotkey routing/i18n), moved Info to last in tab order, simplified hamburger hotkey legend into a single prominent Ctrl+Alt block, and updated the torus banner (faster rotation, brighter orange, lower height, Info label, theme-matched background, explicit new logo usage).
- **2026-03-19 (Codex)**: Updated the header control-room shortcut to open `/admin#/welcome`, replaced the welcome subtitle with `RAGBAZ Articulate StoreFront`, translated previously hardcoded Welcome card text (Storage/Support) in EN/SV/ES, and aligned drawer/card ordering to `Welcome → Sales → Stats → Storage → Products → Chat → Health → Style → Info → Support`.
- **2026-03-19 (Codex)**: Chat modularisation, markdown rendering, i18n, and bugfixes.
- **2026-03-19 (Claude)**: Image generator polish and chat fixes.
- **2026-03-18 (Both)**: Admin UI, i18n, and AGENTS.md setup.
- **2026-03-17 (Both)**: Stripe integration, KV layer, and hotkeys.
- **2026-03-16 (Both)**: Monorepo setup and build system.

---

## Open Questions

- Should we prioritize **streaming responses** for the chat feature? (Requires Cloudflare streaming support.)
- Should we implement **chat history persistence** in KV or localStorage?
- Should we add a **user feedback mechanism** for AI responses?

## Recent review action items

- Confirm that the **AdminSupportTab** uses the charge ID from `receiptId` when calling `downloadReceipt`, otherwise Stripe rejects receipts tied to PaymentIntents. Claude, please pick this up first.
- Harden `/api/admin/payments` by defaulting the `limit` query to 20 and clamping it to `[1, 100]` before calling `compilePayments` so malformed query strings (e.g., `limit=foo`) cannot send `NaN` to Stripe.

### Dead-link finder suggestion

- Claude, the user wants an admin dead-link finder that catalogs every `<a href>` in the DOM, tags them as internal, pseudo-external (`xtas.nu` → `/`), or fully external, and performs lightweight reachability checks before reporting results in a new panel. It complements the AI Chat’s GraphQL/HTML stripping by keeping the anchor list intact. Please review this approach and correct me if the target panel or link classification should be different before implementing.
