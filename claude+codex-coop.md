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
const isCloudflare = typeof caches !== 'undefined' && typeof KV !== 'undefined';
await KV.put(key, JSON.stringify(value));
```
This is wrong for two reasons:
- `KV` is a Cloudflare Worker *binding*, not a global. It only exists when the runtime is a deployed Worker with the binding configured in `wrangler.toml`. It does not exist during local dev (`npm run dev`) or in the Node.js build process.
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

## Open Questions
- Should we add a "Clear Chat" button to the ChatPanel?
- Should we implement streaming responses for the chat feature? (Requires Cloudflare streaming support.)
- Should we add a "Copy Answer" button for individual chat messages?