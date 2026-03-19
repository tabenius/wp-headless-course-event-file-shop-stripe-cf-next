# Claude + Codex Co-Working Log

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
