# AGENTS Instructions

Shared living document for **Claude** and **Codex** co-working in this repository.
Both agents MUST read this at session start and update it whenever priorities shift or significant work is landed.

---

## Agent status

- **Claude** handed the active storefront/admin backlog to **Codex**. Codex currently owns the implementation loop and should keep logging every landed feature in `claude+codex-coop.md`.

## Project overview

WordPress-headless course/shop/events platform deployed on **Cloudflare Workers** with:

- **Next.js 16** (App Router, Turbopack for dev, OpenNext for CF)
- **WordPress GraphQL** (primary content source, WPGraphQL + LearnPress + WooCommerce)
- **Cloudflare KV** (access tokens, support tickets, AI quota, digital products)
- **Cloudflare R2 / AWS S3** (file uploads)
- **Stripe** (payments — charges, receipts)
- **Cloudflare Workers AI** (FLUX.1 schnell image generation, embeddings + chat RAG)

Monorepo — `packages/ragbaz-bridge-plugin/` is the companion WordPress plugin.

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

### WordPress GraphQL relay lane

- Preferred low-friction auth lane is now relay-secret header auth from `ragbaz-bridge`.
- Storefront env supports:
  - `RAGBAZ_GRAPHQL_RELAY_SECRET` (or fallback `WORDPRESS_GRAPHQL_RELAY_SECRET`)
  - optional header override `RAGBAZ_GRAPHQL_RELAY_HEADER_NAME` (default `x-ragbaz-relay-secret`)
- Auth priority in `src/lib/wordpressGraphqlAuth.js`:
  - SiteToken JWT (if configured) → Relay secret header → Basic app password → Bearer token.
- Keep relay secret distinct from storefront app-password/JWT credentials; relay can be rotated/disabled from plugin Connect UI.

### GraphQL availability logging safety

- `GRAPHQL_AVAILABILITY_AUTO_RECORD` is **off by default** and must stay off unless the user explicitly asks to enable it for a bounded diagnostic window.
- Before enabling `GRAPHQL_AVAILABILITY_AUTO_RECORD=1`, the active agent must warn both:
  - the user in-chat, and
  - the other agent via `claude+codex-coop.md`,
  about static/ISR static→dynamic risk and expected telemetry tradeoffs.
- If enabled temporarily, record the start/stop intent in coop and turn it back off (`0`) after diagnostics.
- Build scripts now emit a warning whenever `GRAPHQL_AVAILABILITY_AUTO_RECORD=1` is present; treat that warning as a required manual confirmation checkpoint.

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
| `packages/ragbaz-bridge-plugin/`                    | WordPress plugin — independent; build with `npm run plugin:copy` |
| `tests/`                                                | `node:test` tests — run with `npm test`                          |

---

## Coordination protocol

1. **`claude+codex-coop.md`** is the shared worklog. Append a bullet after every landed feature. Read it at the start of each session.
2. **This file (`AGENTS.md`)** is for standing instructions, priorities, and architecture notes. Update it when priorities shift or new patterns are established.
3. **Branch**: both agents work on `main`. Commit and push after each logical unit of work so the other agent can pull and see the change. Avoid long-running local-only branches.
4. Before touching a file the other agent recently committed, pull first.
5. If you discover a bug or leave something half-done, note it at the top of the coop file with `TODO:` so the other agent doesn't step on it.

### Shared-doc lock protocol (AGENTS.md, claude+codex-coop.md, docs/CHANGELOG.md)

Both agents edit these shared docs. To prevent merge conflicts, use `docs.lock.pid` as an advisory lock before editing any of them.

**Before editing `AGENTS.md`, `claude+codex-coop.md`, or `docs/CHANGELOG.md`:**

```bash
# 1. Check — is the lock free?
node scripts/docs-lock.mjs check

# 2. Acquire it
node scripts/docs-lock.mjs acquire codex "AGENTS.md, claude+codex-coop.md, docs/CHANGELOG.md"

# 3. Pull to get the latest version
git pull

# 4. Make your edits, then commit and push immediately
git add AGENTS.md claude+codex-coop.md docs/CHANGELOG.md
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

## Changelog protocol (required)

Maintain a user-facing weekly changelog in `docs/CHANGELOG.md`.

Rules:

1. Update `docs/CHANGELOG.md` every week when major user/admin-facing features or UX changes land.
2. Keep changelog entries high-level and experience-focused (avoid code-level implementation detail).
3. Use the shared-doc lock + checkout helper flow for changelog updates (acquire lock, `git pull`, edit, commit/push, release).
4. Whenever `docs/CHANGELOG.md` is updated in `main`, publish the update on `ragbaz.xyz` docs in the same delivery slice.
5. Treat publish as mandatory completion criteria for changelog updates: update content, commit/push, deploy `ragbaz.xyz`, and verify live docs.
6. Log each changelog update and publish action in `claude+codex-coop.md`.

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

DONE (2026-03-27, Codex): prioritized implementation batch landed in order:
1. R2 binding + CF bundle-size migration
2. Media/derivation UX hardening (quick-add + panel hotkeys + async WP auth callsites)
3. Image pipeline defaults (WebP-first + responsive variant uploads + stricter variant-kind defaults)
4. `/shop` static shell + async ownership enrichment API split
5. Tiered settings panel with WC proxy + Stripe key override settings (KV-backed) and runtime wiring

**Follow-up / Monitoring** — Validate new settings/Stripe override paths and shop enrichment flow in staging/production, then continue planned `AdminMediaLibraryTab` extraction.

### Working rules for this backlog

- Execute in listed order unless a production regression interrupts.
- Keep TODO ownership/status in `claude+codex-coop.md` top section.
- Run targeted lint/tests after each backlog item lands.

---

## Recent work log (summary — full detail in coop file)

- **2026-03-26 (Codex)**: Landed relay-secret onboarding/auth lane (`main` commit `b33ad91`) across plugin + storefront auth/docs: plugin now generates/enables/rotates dedicated GraphQL relay secret and exposes relay metadata; storefront supports `RAGBAZ_GRAPHQL_RELAY_SECRET` header auth (`x-ragbaz-relay-secret`) with updated auth priority and env/doc guidance.
- **2026-03-26 (Codex)**: Landed tenant draft link hardening + relay metadata visibility in `ragbaz.xyz` (`master` commit `901e2a3`): same-site/upstream-host absolute URLs are rewritten to request-path-relative draft links; external links are explicitly marked and open in new tab/window; relay lane status is shown safely (presence/preview only), with tests covering rewrite/external behavior.
- **2026-03-26 (Codex)**: Implemented end-to-end call-home expansion and tenant mapping workflow: `ragbaz.xyz` now supports authenticated event ingestion (`/api/v1/home/events`), storefront subdomain claims (`/api/v1/home/tenant-claim`), connected-site screens (`/articulate/sites`, `/articulate/sites/{gift_or_alias}`, `/tenant/{domain}` incl. `xtas.nu -> xtas` alias), while the bridge plugin Connect tab now saves home credentials and can send manual heartbeat/event payloads directly.
- **2026-03-26 (Codex)**: Completed plugin naming normalization to `ragbaz-bridge` across `main`, including package/workspace wiring (`ragbaz-bridge-plugin`), plugin file/zip names (`ragbaz-bridge.php`, `ragbaz-bridge.zip`), download path updates (`/downloads/ragbaz-bridge/ragbaz-bridge.zip`), and docs/tests references.
- **2026-03-23 (Claude)**: AdminMediaLibraryTab refactor phase 1 — extracted `mediaLibraryHelpers.js` (30+ pure util functions), `R2ConnectionPanel` (S3/R2 connection checklist + GUI clients, 240 lines), `MediaViewerPanel` (asset data viewer, 195 lines). Main file: 3942 → 3205 lines. Commits `858403d`, `3e6722e`, `f1dc7ba`.
- **2026-03-23 (Claude)**: WP setup page + 429 rate-limit UX + opt-in GraphQL availability/page-performance logging (KV) + chat tab beta gate + dead-link finder moved to Beta & monitoring section. Commit `356a96f`. i18n: 7 new keys (1010 total, all in sync).

- **2026-03-22 (Claude)**: Admin UI refactor + bug fixes: extracted `AdminStyleTab.js` (955 lines) from `AdminDashboard.js` (3316 → 2593 lines); fixed 8 bugs: `AdminFontBrowserModal` catalog fetch error + retry, per-font download error display, `updateSupportTicket` `ticketSaving` state (comment button disables), `sendChat` AbortController race condition, `commitsError` clearing on success, VAT validation now uses toast, `AdminStorageTab` env-status retry button with error clearing.
- **2026-03-22 (Claude)**: Completed full font browser implementation (Tasks 1–12 of `docs/superpowers/plans/2026-03-22-font-browser.md`): Google Fonts catalog (API + snapshot fallback), R2 font download + storage, `@font-face` CSS serving via `/api/site-fonts`, 5 font roles (display/heading/subheading/body/button) with per-role color slots, typography palette (1–2 colors), link hover variants (7 styles), 5 built-in typography themes (Clean/Editorial/Technical/Warm/Haute), `AdminFontBrowserModal` with live CDN preview + infinite scroll + weight picker, admin typography UI with role cards + palette strip + theme strip + link style panel, inline layout.js script handling new font role object format, and i18n keys in en/sv/es.
- **2026-03-21 (Codex)**: Follow-up polish for the CyberDuck ingest flow (commit `543f698`): switched the new manual-ingest preview renderer to `next/image` (`unoptimized`) so the feature does not add extra `no-img-element` lint warnings beyond the existing baseline.
- **2026-03-21 (Codex)**: Added a CyberDuck-to-R2 ingest flow in Media (commit `acebee5`): admins now get a manual object-key workflow with R2 connection checklist + resolved public URL, preview metadata/image directly from R2, and save a normalized asset record into a KV-backed registry via `/api/admin/media-library/cyberduck-r2` + `src/lib/mediaAssetRegistry.js` (with fallback memory mode when KV is unavailable).
- **2026-03-21 (Codex)**: Added Media-tab asset-lineage navigation (commit `4b84551`): selected-asset panel now shows original + variant chain controls from `asset.variants`, supports one-click jump back to related WP attachments, highlights current variant chip, and includes EN/SV/ES locale parity keys for the new lineage UI copy.
- **2026-03-21 (Codex)**: Completed WordPress attachment-asset metadata surfacing and compatibility signaling (commit `3e3d361`): plugin now registers `ragbaz_asset_*` meta for REST/GraphQL, exposes normalized `ragbaz_asset` payloads including `original` + `variants`, adds GraphQL `ragbazCapabilities`/`MediaItem.ragbazAsset`, and admin now consumes those signals in `/api/admin/media-library` and `/api/admin/health` for capability-aware metadata flows.
- **2026-03-21 (Codex)**: Added derivation preview badges, the operation matrix table, and the concrete/abstract guard in the Media tab plus README/AGENTS notes so the workflow is documented before saving derived assets.
- **2026-03-21 (Codex)**: Documented the multi-repo codebase map in `README.md`, spelled out the KV-backed derivation contract, and taught the media tab to keep the `source` operation bound to the selected asset, surface upload limits, and send the bound chain to `/api/admin/derivations/apply`.
- **2026-03-21 (Codex)**: Expanded the media-library derivation workflow by filtering templates to the focused asset type, adding a full derivation editor (id, metadata, asset-type checkboxes, operation add/remove), persisting edited templates via `/api/admin/derivations`, showing saved derived assets, and exposing new saturation/sepia/circle/preset operators plus the new save-derived-asset workflow.
- **2026-03-21 (Codex)**: Added a text-overlay operator parametrized by normalized coordinates, typeface, and size (default Inter 24pt) so derivations can stamp captions in place before saving derived assets.
- **2026-03-21 (Codex)**: Surface WordPress attachment IDs in the media-library detail pane so every attachment asset clearly shows its `sourceId`, reinforcing that WordPress media items are treated as assets and letting admins copy the canonical attachment reference.
- **2026-03-20 (Codex)**: Added a new root workspace `README.md` that explains all top-level codebases (`main`, `wp-cf-front-oss`, `wp-cf-front`, `ragbaz.xyz`, `multitenant-wp-mcp-docker-legacy`), includes quick-start commands per repo, and documented a new AGENTS “Workspace documentation protocol” for how these docs must be maintained.
- **2026-03-20 (Codex)**: Completed cleanup after Products/Access merge by deleting the obsolete `ProductsTab` component and removing the unreachable `innerTab === "products"` render branch in `AdminProductsTab`; also removed leftover helper functions that were only used by that dead path.
- **2026-03-20 (Codex)**: Began UI merge of “All products” + “Digital downloads” by removing the dedicated Digital Downloads inner-tab button and embedding shop-product detail editing directly in the Access/All-products right pane (image, name/slug/type/active, description + image generator, file/course URI + upload controls).
- **2026-03-20 (Codex)**: Reverted temporary Access-tab image-backend pin to preserve backend flexibility (`uploadBackend={uploadBackend}` restored for WP-item image edits), and added explicit image-upload diagnostics in `ImageUploader` (logs/status + backend-tagged error text) while keeping modal auto-close on upload failure.
- **2026-03-20 (Codex)**: Addressed All-Products image upload regression by forcing WP-item image uploads to use `wordpress` backend in Access tab (`ImagePickerButton uploadBackend=\"wordpress\"`), and updated `ImageUploader` to auto-close/reset the crop modal on upload errors so failed saves do not leave the dialog stuck open.
- **2026-03-20 (Codex)**: Investigated product image-picker regression timeline and restored the near-working click path from ~`2026-03-19 20:43 UTC` (`cb8bc56`) by reverting to plain `onClick={openPicker}` in `ImagePickerButton` and plain `input.click()` in `ImageUploader.openFilePicker` (no extra event interception).
- **2026-03-20 (Codex)**: Fixed product-editor image picker click reliability by removing fragile `showPicker()` usage in `ImageUploader` (use direct `input.click()`), and hardening `ImagePickerButton` click handling with explicit `preventDefault`/`stopPropagation` plus `pointer-events-auto` on the trigger surface.
- **2026-03-19 (Codex)**: Increased admin menu-bar chroma toward red-orange by shifting header/control hues from ~33° to ~22° and raising saturation/brightness across bar, hamburger/status controls, drawer/tooltip, and language selector surfaces.
- **2026-03-19 (Codex)**: Temporarily disabled Info-banner Sierpinski background layers and pendulum motion via explicit feature flags in `TorusBanner` (`ENABLE_SIERPINSKI_LAYERS=false`, `ENABLE_PENDULUM_MOVEMENT=false`) while keeping all rendering code intact for quick re-enable.
- **2026-03-19 (Codex)**: Retuned admin header contrast/saturation (more saturated amber bar and brighter/saturated `RAGBAZ` cyan), changed sun/moon hover behavior to outline-only emphasis (fill remains yellow, outline expands on hover), and set Info torus to `24x24` granularity with a fixed `20vh` canvas banner height.
- **2026-03-19 (Codex)**: Completed software z-buffer rendering for the Info-tab torus (per-pixel depth-tested triangle rasterization + depth-tested cyan edge lines) and removed backface culling so hidden-surface resolution comes from depth buffering only.
- **2026-03-19 (Codex)**: Halved the torus canvas height again (`10/11/12rem -> 5/5.5/6rem`, draw fallback `130 -> 65`) and increased Sierpinski tree recursion depth for all parallax layers (far `3-4`, mid `4-5`, near `4-6`).
- **2026-03-19 (Codex)**: Updated header sun/moon theme-toggle interaction to color-only hover feedback (no background darkening) and removed active/focus framing/rings from the toggle control.
- **2026-03-19 (Codex)**: Replaced the foliage background with high-contrast Sierpinski fractal tree groups (layered/parallax SVGs), switched geometry renderer back to torus using depth-sorted quads with backface culling, and reduced the canvas vertical footprint to roughly half height.
- **2026-03-19 (Codex)**: Rebalanced foliage visuals by reducing generated density (`plantCount`/`iterations`), increasing branch/leaf stroke and outline widths for chunkier artifacts, and lowering canopy placement (`top: 16%/24%/32%`) for a shorter vertical profile.
- **2026-03-19 (Codex)**: Removed Info-banner scrolling text entirely, lowered spherical volume mesh granularity (`64x36`), and swapped to a new polynomial-based radial deformation model for the spherical-harmonics renderer.
- **2026-03-19 (Codex)**: Increased foliage canopy height again (higher layer offsets plus stronger L-system growth) and removed horizontal sharp-edge artifacts by widening parallax overscan and adding left/right edge feather masks on all bush layers.
- **2026-03-19 (Codex)**: Removed the trefoil-knot renderer from the Info canvas and replaced it with a spherical-harmonics volume surface (longitude/latitude mesh, harmonic radial field, depth-sorted triangle shading) while keeping the same orange/cyan visual language.
- **2026-03-19 (Codex)**: Raised the parallax foliage canopy substantially (about 2x perceived height) by both increasing L-system growth parameters (`stepBase`/`leafSizeBase`) and moving all three bush layers upward in CSS (`far/mid/near top: 20%/26%/34%`).
- **2026-03-19 (Codex)**: Moved the Info banner text to a bottom-mounted ticker when sine mode is disabled, reduced ticker font size, set ticker color to bright yellow, and increased horizontal scroll speed for clearer compact motion.
- **2026-03-19 (Codex)**: Improved trefoil rope rendering to reduce self-sticking while making it thicker/smoother: raised mesh resolution to `120x30`, increased tube radius to `14`, and switched from quad fill to depth-sorted triangle shading with improved lighting plus a depth-sorted cyan rope highlight pass.
- **2026-03-19 (Codex)**: De-fogged the L-system leafy parallax by increasing foliage stroke opacity/contrast, adding black outline strokes around branches/leaves in generated SVG layers, and reducing haze in the per-layer gradient overlays.
- **2026-03-19 (Codex)**: Smoothed the trefoil knot mesh by increasing longitudinal geometry resolution (`72x24`) and reduced tube thickness with adjusted knot scale (`tube radius 10`) to avoid visual self-sticking at crossings while keeping the same orange/cyan render style.
- **2026-03-19 (Codex)**: Replaced gradient-blob bush parallax with procedural leaf drawings based on Lindenmayer-style branch grammar and line rendering, generating three deterministic SVG leaf layers (far/mid/near) reused as animated pendulum parallax backgrounds.
- **2026-03-19 (Codex)**: Temporarily disabled torus rendering in Info-tab canvas and switched to a trefoil-knot tube mesh renderer (`24x24` granularity) while preserving the original torus geometry path in code behind a toggle.
- **2026-03-19 (Codex)**: Temporarily disabled the Info-tab sine scroller via an explicit `ENABLE_SINE_SCROLLER` toggle in `TorusBanner`, preserving all scroller animation code paths and rendering a non-animated fallback line while disabled.
- **2026-03-19 (Codex)**: Added a four-layer animated parallax environment to the Info torus banner (red sunset horizon + multi-depth green bushes) with slow pendulum-style left/right drift, while keeping the torus canvas transparent so the scene remains visible behind 3D geometry.
- **2026-03-19 (Codex)**: Expanded the Info-tab torus banner to full-bleed left and taller vertical sizing, and removed residual frame styling by dropping rounded frame shells and forcing transparent/no-shadow panel chrome.
- **2026-03-19 (Codex)**: Retuned admin header theme-toggle glyph palette to a fully saturated yellow (`#ffff00`) for both sun/moon states, with explicit black hover color for stronger visual contrast.
- **2026-03-19 (Codex)**: Removed visible frame treatment around the Info-tab torus area (no outer/inner borders or inset frame) and made torus scroller text color theme-aware via `--admin-torus-scroller-color` (set to white in gruvbox theme).
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
- **2026-03-19 (Codex)**: Removed `RAGBAZ Bridge StoreFront` text from the Welcome screen content area (story + non-story variants) so branding is only shown in the menu bar as requested.
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
- **2026-03-19 (Codex)**: Extended `ragbaz-bridge` plugin course-access schema to include `active` and versioned plugin header to `1.0.1`, while preserving legacy behavior when `active` is omitted in older client mutations.
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
- **2026-03-19 (Codex)**: Updated the header control-room shortcut to open `/admin#/welcome`, replaced the welcome subtitle with `RAGBAZ Bridge StoreFront`, translated previously hardcoded Welcome card text (Storage/Support) in EN/SV/ES, and aligned drawer/card ordering to `Welcome → Sales → Stats → Storage → Products → Chat → Health → Style → Info → Support`.
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

- Claude, the user wants an admin dead-link finder that catalogs every `<a href>` in the DOM, tags them as internal, pseudo-external (tenant root domain → `/`), or fully external, and performs lightweight reachability checks before reporting results in a new panel. It complements the AI Chat’s GraphQL/HTML stripping by keeping the anchor list intact. Please review this approach and correct me if the target panel or link classification should be different before implementing.
