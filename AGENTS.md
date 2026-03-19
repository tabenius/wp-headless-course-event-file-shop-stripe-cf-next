# AGENTS Instructions

Shared living document for **Claude** and **Codex** co-working in this repository.
Both agents MUST read this at session start and update it whenever priorities shift or significant work is landed.

---

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

| Purpose | Command |
|---------|---------|
| Dev server | `npm run dev` |
| Build (Node) | `npm run build` |
| Build (CF) | `npm run cf:build` |
| Deploy to CF | `npm run cf:deploy` |
| Run tests | `npm test` |
| Lint | `npm run lint` |
| Plugin zip | `npm run plugin:copy` |

Tests use `node:test` (no Jest/Vitest). Add new test files under `tests/`.

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
- Hotkeys: **Alt+1..8** for tabs, **Alt+/** search, **Alt+L** logout. Update the legend when adding tabs.
- Tabs currently: Health, Stats, Courses, Shop, Support, Chat, Style (+generate-image panel in Shop/Chat).
- Nav items array is in `AdminHeader.js` — add `{ label: t("admin.navX"), tab: "x" }` entry when adding a tab.

### Prices
- Always render as `"750 SEK"` format (no decimals, currency after amount).
- `normalizePrice()` in `src/lib/utils.js` handles WooCommerce raw strings like `"kr750.00"`.

---

## File ownership guide

Neither agent has exclusive ownership — coordinate via the coop file and this doc.
But here are natural areas of focus:

| Area | Notes |
|------|-------|
| `src/auth.js`, `src/lib/adminRoute.js` | Auth — touch carefully; any change cascades to ~20 API routes |
| `src/app/api/admin/*` | Admin API routes — edge runtime; one folder per feature |
| `src/components/admin/*` | Admin UI components |
| `src/lib/i18n/*.json` | Translations — always update all three languages together |
| `src/lib/ai.js`, `src/lib/imageQuota.js` | AI helpers — pure functions, well-tested |
| `src/lib/cloudflareKv.js`, `src/lib/digitalProducts.js` | KV/storage layer |
| `packages/ragbaz-articulate-plugin/` | WordPress plugin — independent; build with `npm run plugin:copy` |
| `tests/` | `node:test` tests — run with `npm test` |

### 🔒 Codex: leave these files alone for now (Claude has active plans for them)

Do **not** touch the following until this notice is removed. Claude is planning improvements here and concurrent edits will cause conflicts:

- `src/components/admin/ImageGenerationPanel.js`
- `src/app/api/admin/generate-image/route.js`
- `src/app/api/chat/route.js`
- `src/lib/ai.js`
- `src/lib/imageQuota.js`
- `tests/generate-image.test.js`

---

## Coordination protocol

1. **`claude+codex-coop.md`** is the shared worklog. Append a bullet after every landed feature. Read it at the start of each session.
2. **This file (`AGENTS.md`)** is for standing instructions, priorities, and architecture notes. Update it when priorities shift or new patterns are established.
3. **Branch**: both agents work on `main`. Commit and push after each logical unit of work so the other agent can pull and see the change. Avoid long-running local-only branches.
4. Before touching a file the other agent recently committed, pull first.
5. If you discover a bug or leave something half-done, note it at the top of the coop file with `TODO:` so the other agent doesn't step on it.

---

## Environment variables (key ones)

| Var | Purpose |
|-----|---------|
| `WORDPRESS_API_URL` | WP GraphQL endpoint |
| `WORDPRESS_GRAPHQL_APPLICATION_PASSWORD` | Basic auth for WPGraphQL |
| `FAUST_SECRET_KEY` / `FAUSTWP_SECRET_KEY` | Faust auth fallback |
| `CF_ACCOUNT_ID` / `CLOUDFLARE_ACCOUNT_ID` | CF account for AI + KV REST |
| `CF_API_TOKEN` | CF API token (Workers AI, KV REST, R2) |
| `CF_KV_NAMESPACE_ID` | KV namespace — **required** for AI quota and ticket persistence |
| `AI_IMAGE_DAILY_LIMIT` | Max FLUX images/day (default 5) |
| `STRIPE_SECRET_KEY` | Stripe API |
| `ADMIN_PASSWORD` | Admin UI login |

Full list in `.env.example`.

---

## Current priorities (update as needed)

### [Codex] Refactor AdminStatsTab — extract chart rendering into StatsChart (completed)

- Completed 2026-03-19: `AdminStatsTab` now renders a new `StatsChart` component; the helper math (maxOf, barHeight, formatHour) lives in `StatsChart.helpers.js`, and dedicated `tests/stats-chart.test.js` verifies their behavior.

---

### [Claude] Upcoming: image generator polish + chat bug fixes

Planned work on the image generator and chat — **Codex must not touch the locked files above while this is open.**

#### Image generator (`ImageGenerationPanel.js`, `generate-image/route.js`)

**A. Fix thumbnail aspect ratios** — images currently render at `160×160` regardless of preset. Display dimensions should match the preset's actual ratio:
- square → 160×160
- landscape (896×512) → 160×92
- portrait (512×768) → 107×160
- a6-150dpi (624×880) → 113×160

Read `SIZE_PRESETS` from `src/lib/imageQuota.js` and compute display dimensions proportionally (scale so the longer side = 160px).

**B. Add a "Copy prompt" button** — after the prompt textarea, a small "Copy" button that writes `prompt` to `navigator.clipboard`. Show a brief "Copied!" confirmation inline (no toast needed).

**C. Add count = 1 option** — extend the count toggle buttons from `[2, 3]` to `[1, 2, 3]`.

**D. Elapsed-time counter during generation** — while `generating === true`, show a `Xsec…` counter next to the spinner using `setInterval` / `useEffect`. Clears when generation finishes.

Each item is a separate small commit. Tests in `tests/generate-image.test.js` should cover any new pure-function logic (aspect ratio math, etc.).

#### Chat (`/api/chat/route.js`)

**A. Fix payments intent bug (latent crash)** — `route.js:187` uses `rows` which is never defined in the payments block. It should be `json.charges` (or whatever the actual field from `/api/admin/payments`). Check the payments route response shape first: `src/app/api/admin/payments/route.js`.

**B. Deduplicate `imageSystemPrompt`** — the FLUX prompt instruction is copy-pasted at lines 103-105 and 200-202. Extract to a `const IMAGE_SYSTEM_PROMPT` at the top of the file.

**C. Cap conversation history** — `body.history` is forwarded with no limit. Slice to the last 10 messages before passing to `chatWithContext`: `history.slice(-10)`.

---

### Standing priorities

1. Keep admin tabs, hotkeys, and translations aligned. When adding a tab: update `AdminHeader.js`, `AdminDashboard.js`, and all three i18n files.
2. Validate `npm test` and `npm run build` pass before every push.
3. Update `claude+codex-coop.md` and this file after landing significant changes.

---

## Recent work log (summary — full detail in coop file)

- **2026-03-19 (Claude)**: AI image generation feature — `src/lib/imageQuota.js`, `src/lib/ai.js` `generateImage`, `/api/admin/generate-image`, `ImageGenerationPanel`, wired into AdminDashboard (shop editor + chat). Auth refactored to Web Crypto API for edge compat. 19 unit tests added.
- **2026-03-19 (Codex)**: Style tab added (Alt+8), legend updated, EN/SV/ES translations, initial AGENTS.md created.
