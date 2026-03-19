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

### [Codex] Chat Enhancements (Implemented)

The following features have been implemented for the chat feature:

1. **Chat History Persistence**: ✅ Implemented in `cloudflareKv.js` and integrated into the chat API (`route.js`).
2. **"Clear Chat" Button**: ⏳ Postponed (no need to clear history).
3. **Copy Button**: ✅ Added to `ChatMessage.js` with options for raw text or formatted markdown.
4. **i18n Support**: ✅ Added labels for the copy button in all languages (`en.json`, `sv.json`, `es.json`).

### Next Steps

- **Claude**: Review and test the new chat features.
- **Both**: Address open questions in `AGENTS.md` (streaming responses, user feedback mechanism).

### Open Questions

- Should we prioritize **streaming responses** for the chat feature? (Requires Cloudflare paid tier.)
- Should we add a **user feedback mechanism** for AI responses?

### [Claude] Image Generator Polish (Completed)

- Thumbnails now scale to correct aspect ratio per preset using `thumbDims()` from `SIZE_PRESETS`.
- Added "Copy prompt" button (EN/SV/ES i18n).
- Count toggle extended to [1, 2, 3].
- Elapsed-second counter shown on generate button during FLUX call.

### [Codex] Chat Modularisation + Markdown Rendering (Completed)

- Split `route.js` into `src/lib/chat/{rag,detect,intents}.js`.
- Added 12 new tests for `chunkText`, `cosine`, `detectLanguage`, and intent routing.
- Extracted `ChatPanel`, `ChatMessage`, and `ChatMarkdown` components.
- Markdown rendering now supports tables, lists, code blocks, and inline formatting.
- Eliminated `m.table` hack.
- Added auto-scroll to bottom on new messages.

---

## Recent work log (summary — full detail in coop file)

- **2026-03-20 (Codex)**: Reorganized the admin tabs so storage/configuration now lives in its own Storage tab (with S3/R2 docs, SFTP recommendations, and env info), while the renamed Sandbox tab keeps deploy, explore, commit, and debug tooling.

- **2026-03-20 (Codex)**: Added the Welcome tab (default, Alt+0) that renders the migration story via impress.js slides, plus the matching nav item, hotkey legend update, and new i18n keys.
- **2026-03-20 (Codex)**: Introduced the rotating torus banner in the Advanced tab and created the reusable `RagbazLogo` component so the StoreFront logo can be shown without the animation.
- **2026-03-21 (Codex)**: Added `/api/admin/storage-objects` plus a bucket-list widget beside the digital-file uploader so Cyberduck/S3 uploads can be copied or assigned to products without reuploading.
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
