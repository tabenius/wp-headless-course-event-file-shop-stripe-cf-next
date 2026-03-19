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

<!-- file lock removed — all planned image-gen and chat work is complete as of 2026-03-19 -->

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
node scripts/docs-lock.mjs acquire claude "AGENTS.md, claude+codex-coop.md"
# or: acquire codex "AGENTS.md"

# 3. Pull to get the latest version
git pull

# 4. Make your edits, then commit and push immediately
git add AGENTS.md claude+codex-coop.md
git commit -m "..."
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
{ "pid": 12345, "agent": "claude", "files": "AGENTS.md, claude+codex-coop.md", "started": "2026-03-19T14:00:00.000Z" }
```

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

### [Codex] StatsChart + Product list refactor — 3 follow-up fixes needed

Both refactors landed 2026-03-19 and were reviewed by Claude. Good work overall — the follow-ups below are required before these are fully closed.

**StatsChart fix A — `formatHour` must use UTC** (`StatsChart.helpers.js:12`)
`date.getHours()` returns local time; Cloudflare timestamps are UTC. Change to `date.getUTCHours()`. The test passes today only because the server runs in UTC; it fails in any other timezone. Update the implementation and add a comment to the test noting it is UTC-based.

**StatsChart fix B — Workers-mode hint text must be i18n'd** (`StatsChart.js:55-60`)
The paragraph *"Referrers, page views, and bandwidth require zone-level analytics…"* is hardcoded English. Add `stats.workersHint` key to `en.json`, `sv.json`, and `es.json` and use `t("stats.workersHint")` in the JSX.

**ProductSection fix — `renderItem` should return JSX, not a props object** (`ProductSection.js`)
Currently `renderItem` must return a plain object with a `key` field that gets spread onto `<ProductRow>`. This is non-standard and fragile (missing `key` silently drops reconciliation). Change `renderItem(item, rowIndex)` to return a full `<ProductRow key={…} rowIndex={rowIndex} … />` element; `ProductSection` then simply renders `items.map(renderItem)`. Update all five call sites in `AdminDashboard.js` accordingly.

**Coordination note for future self-initiated refactors:** Before starting an unassigned structural change, drop a `TODO (planning):` line in `claude+codex-coop.md` so Claude can pull and won't conflict mid-work. A one-line heads-up is enough.

---

### [Claude] Image generator polish + chat fixes (completed 2026-03-19)

All items shipped:
- **Image gen A**: Thumbnails now scale to correct aspect ratio per preset using `thumbDims()` from `SIZE_PRESETS`
- **Image gen B**: "Copy prompt" button added (EN/SV/ES i18n)
- **Image gen C**: Count toggle extended to [1, 2, 3]
- **Image gen D**: Elapsed-second counter shown on generate button during FLUX call
- **Chat A**: Fixed `rows` crash in payments intent — now reads `json.payments`
- **Chat B**: `IMAGE_SYSTEM_PROMPT` extracted as shared constant, removed copy-paste
- **Chat C**: `body.history` capped to last 10 turns before LLM call

---

### Standing priorities

1. Keep admin tabs, hotkeys, and translations aligned. When adding a tab: update `AdminHeader.js`, `AdminDashboard.js`, and all three i18n files.
2. Validate `npm test` and `npm run build` pass before every push.
3. Update `claude+codex-coop.md` and this file after landing significant changes.

## Follow-up items for Claude
- Wrap `navigator.clipboard.writeText(prompt)` so failed clipboard interactions result in a toast message or console warning instead of silently breaking the UI.
- Add a cleanup `useEffect` inside `ImageGenerationPanel` to clear `elapsedRef.current` when the component unmounts so we don’t leak timers after navigation.

## Build tracking note
- When you start `npm run build`, write the PID of the running `next build` process into `building.lock.pid` (update it if the process restarts). Remove or zero the file when the build finishes so Claude and I know the runner is free.

---

## Recent work log (summary — full detail in coop file)

- **2026-03-19 (Claude)**: AI image generation feature — `src/lib/imageQuota.js`, `src/lib/ai.js` `generateImage`, `/api/admin/generate-image`, `ImageGenerationPanel`, wired into AdminDashboard (shop editor + chat). Auth refactored to Web Crypto API for edge compat. 19 unit tests added.
- **2026-03-19 (Codex)**: Style tab added (Alt+8), legend updated, EN/SV/ES translations, initial AGENTS.md created. StatsChart extracted from AdminStatsTab with `maxOf`/`barHeight`/`formatHour` helpers + tests.
- **2026-03-19 (Claude)**: Chat fixes — payments crash, IMAGE_SYSTEM_PROMPT dedup, history capped to 10. Image gen polish — aspect-ratio thumbnails, copy-prompt button, count=1 option, elapsed timer on generate button.
