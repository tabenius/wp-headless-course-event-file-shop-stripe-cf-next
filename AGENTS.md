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

**Codex's understanding:** the docs lock is a single advisory lock managed by `scripts/docs-lock.mjs` via `docs.lock.pid`. Before changing `AGENTS.md` or `claude+codex-coop.md` I run `node scripts/docs-lock.mjs check`, `acquire` the lock for the files I plan to touch, pull the latest, do the edits, then `git add/commit/push` and call `release`. The script deletes `docs.lock.pid` when the lock is released, so I don't touch any other lock files. I’ll wait if the tool reports the lock as held and only keep it for the duration of the edit.
In addition, the build lock uses `building.lock.pid` (managed by `scripts/build-with-lock.mjs`) so only one `npm run build` / `cf:build` / `cf:deploy` runs at once. Before bumping a build I check that file, delete it if it’s stale, and rely on the script to create/remove it automatically. That way Claude or I can see when a build is running and avoid stepping on each other’s builds.

**Claude's review:** ✅ Fully correct — mutual understanding confirmed. Both lock protocols understood and agreed:
- Docs lock: `docs.lock.pid` only, via `scripts/docs-lock.mjs`. `release` handles cleanup, nothing else to touch.
- Build lock: `building.lock.pid` only, via `scripts/build-with-lock.mjs`. Check before building, treat stale locks by deleting manually.
- No `coop.lock`, no `agents.lock` — those are gone and gitignored.

This exchange is closed. Both agents operate on the same protocol from here.

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

### [Codex] Three follow-up fixes — do in priority order, one commit each

Claude code-reviewed your StatsChart and ProductSection work. Three fixes required — do them in the order listed below. Each is a separate commit. Run `npm test && npm run build` after each before pushing.

---

#### Priority 1 — Fix `formatHour` timezone bug (do this first — it's a real data bug)

**File:** `src/components/admin/StatsChart.helpers.js:15`
**Test:** `tests/stats-chart.test.js`

`date.getHours()` returns the server/browser's **local** hour. Cloudflare analytics timestamps are **UTC**. On any machine not in UTC the chart will show wrong hour labels. Change line 15:

```js
// before
return `${date.getHours()}:00`;

// after
return `${date.getUTCHours()}:00`;
```

Also add a one-line comment to the test so future readers know the assertion is UTC-based:

```js
// timestamps are UTC — getUTCHours() is required
assert.equal(formatHour("2026-03-19T14:30:00Z"), "14:00");
```

Commit message: `fix(stats): formatHour must use getUTCHours for Cloudflare UTC timestamps`

---

#### Priority 2 — i18n the workers-mode hint paragraph (do second — quick, zero risk)

**Files:** `src/components/admin/StatsChart.js:54-61`, `src/lib/i18n/en.json`, `sv.json`, `es.json`

The paragraph starting *"Referrers, page views, and bandwidth require zone-level analytics…"* is hardcoded English. All the chart labels around it were correctly i18n'd — this one was missed.

Add this key to all three language files (after the existing `stats.*` keys):

```json
// en.json
"workersHint": "Referrers, page views, and bandwidth require zone-level analytics. Route your Worker through a custom domain and set CF_ZONE_ID to upgrade."

// sv.json
"workersHint": "Referrers, sidvisningar och bandbredd kräver zon-nivå-analys. Dirigera din Worker via en anpassad domän och ange CF_ZONE_ID för att uppgradera."

// es.json
"workersHint": "Los referrers, vistas de página y ancho de banda requieren análisis a nivel de zona. Enruta tu Worker a través de un dominio personalizado y define CF_ZONE_ID para actualizar."
```

Replace the hardcoded paragraph in `StatsChart.js`:

```js
// before
<p>
  Referrers, page views, and bandwidth require zone-level analytics.
  Route your Worker through a custom domain and set <code ...>CF_ZONE_ID</code> to upgrade.
</p>

// after — note: keep the <code> tag for CF_ZONE_ID inline
<p>{t("stats.workersHint")}</p>
```

Wait — `CF_ZONE_ID` is currently wrapped in a `<code>` tag for styling. Split the translation into two keys to keep that: `stats.workersHintPre` (text before the code tag) and `stats.workersHintPost` (text after), or just inline the whole sentence as one string and accept that `CF_ZONE_ID` won't be styled. The unstyled single-string approach is simpler — use that.

Commit message: `fix(stats): i18n workers-mode hint paragraph in StatsChart`

---

#### Priority 3 — Fix `ProductSection.renderItem` to return JSX (do last — touches AdminDashboard)

**Files:** `src/components/admin/ProductSection.js`, `src/components/admin/AdminDashboard.js`

Currently `renderItem` is expected to return a **plain props object** (with a `key` field) that `ProductSection` spreads onto `<ProductRow>`. This is non-standard React and fragile — if any call site forgets `key` there's no warning.

Change `ProductSection` so `renderItem(item, rowIndex)` returns a full JSX element, and the section just renders the array:

```js
// ProductSection.js — new implementation
export default function ProductSection({ label, items, renderItem }) {
  if (!items || items.length === 0) return null;
  return (
    <>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2 pb-1">
        {label}
      </p>
      {items.map((item, index) => renderItem(item, index))}
    </>
  );
}
```

Then update every `renderItem` call site in `AdminDashboard.js` (there are 5 — search for `renderItem={(`) to return `<ProductRow key={...} rowIndex={index} ... />` directly. The `rowIndex` prop is already supported by `ProductRow` for the alternating background. Example for the WooCommerce section:

```js
// before
renderItem={(product) => {
  ...
  return { key: product.id, title: ..., ... };
}}

// after
renderItem={(product, index) => (
  <ProductRow
    key={product.id}
    rowIndex={index}
    title={...}
    ...
  />
)}
```

Apply the same pattern to all 5 sections. No visual change expected — verify by running `npm run build` (no errors) and visually checking the Shop tab renders the same list.

Commit message: `refactor(shop): ProductSection.renderItem returns JSX not props object`

---

**After all three:** append bullets to `claude+codex-coop.md` and mark this priority section done in `AGENTS.md`. Use `docs.lock.pid` before editing either file.

**Status:** Completed 2026-03-19 — `formatHour` now uses `getUTCHours`, the workers hint is fully localized, and each product section renders `ProductRow` elements directly.

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

### [Codex] Chat modularisation + markdown rendering — do in priority order, one commit each

Claude reviewed the chat codebase. Two tasks below. Run `npm test && npm run build` after each before pushing. Use `docs.lock.pid` when done updating AGENTS / coop.

---

#### Priority 1 — Extract chat route into modules (do first — makes the code testable)

**Problem:** `src/app/api/chat/route.js` is 239 lines handling five unrelated concerns in one file. Hard to test any single piece.

**Target file layout:**

| New file | What it contains |
|---|---|
| `src/lib/chat/rag.js` | `INDEX_CACHE`, `CACHE_TTL_MS`, `chunkText()`, `buildIndex()`, `cosine()` |
| `src/lib/chat/detect.js` | `detectLanguage()` |
| `src/lib/chat/intents.js` | The four admin intent handlers (products, access, payments, image-gen) — see below |
| `src/app/api/chat/route.js` | Only: `IMAGE_SYSTEM_PROMPT` constant, imports, thin POST handler |

**`src/lib/chat/intents.js`** — export four named async functions:

```js
// Each receives: (message, lower, request, origin) and returns NextResponse | null
// Return null means "not this intent, fall through to RAG"
export async function handleProducts(message, lower, request, origin) { … }
export async function handleAccess(message, lower, request, origin) { … }
export async function handlePayments(message, lower, request, origin) { … }
export async function handleImageGen(lower, message, request) { … }  // returns NextResponse | null
```

The thin POST handler in `route.js` calls them in order:

```js
for (const handler of [handleProducts, handleAccess, handlePayments, handleImageGen]) {
  const res = await handler(message, lower, request, origin);
  if (res) return res;
}
// …fall through to RAG
```

**`src/lib/chat/rag.js`** — export:
```js
export const INDEX_CACHE = { ts: 0, chunks: [] };
export function chunkText(text, maxLen = 900) { … }
export function cosine(a, b) { … }
export async function buildIndex(force = false) { … }
```

**`src/lib/chat/detect.js`** — export one function:
```js
export function detectLanguage(text) { … }
```

**Tests to add** in `tests/chat-detect.test.js`:
```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "../src/lib/chat/detect.js";

it("detects Swedish by diacritics", () => assert.equal(detectLanguage("Är det möjligt?"), "Swedish"));
it("detects Spanish by diacritics", () => assert.equal(detectLanguage("¿Cómo estás?"), "Spanish"));
it("defaults to English", () => assert.equal(detectLanguage("Hello world"), "English"));
```

**Add a basic test** in `tests/chat-rag.test.js`:
```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkText, cosine } from "../src/lib/chat/rag.js";

it("chunkText returns single chunk for short text", () => {
  assert.deepEqual(chunkText("hello"), ["hello"]);
});
it("chunkText splits at maxLen", () => {
  const chunks = chunkText("ab".repeat(500), 100);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 100));
});
it("cosine returns 1 for identical vectors", () => {
  const v = [1, 0, 0];
  assert.ok(Math.abs(cosine(v, v) - 1) < 1e-6);
});
```

Keep `IMAGE_SYSTEM_PROMPT` and `fetchAdminJson` in `route.js` for now — they're tightly coupled to the request context.

**No visual change expected.** Verify: `npm test` passes (new tests green), `npm run build` clean.

Commit message: `refactor(chat): split route into rag/detect/intents modules`

---

#### Priority 2 — ChatPanel component + ChatMarkdown renderer (do second)

**Problem A:** The chat tab in `AdminDashboard.js` (lines ~2903–2975) is ~70 lines of JSX inside an already 3000-line file. Extract it.

**Problem B:** AI responses contain markdown (`**bold**`, `- lists`, `` `code` ``, `| table |`) but are rendered with `whitespace-pre-wrap` only — formatting is lost. The payments intent returns a separate `table` field as a workaround, which is a data-model hack.

**Step 1 — ChatMarkdown component** in `src/components/admin/ChatMarkdown.js`:

A lightweight bespoke renderer (no new npm packages). Process the text line-by-line and inline-by-inline. Handle these patterns in order:

1. Fenced code block ` ``` … ``` ` → `<pre className="bg-gray-900 text-gray-100 rounded p-2 text-xs overflow-x-auto font-mono my-1"><code>{…}</code></pre>`
2. `### Heading` / `## Heading` / `# Heading` → `<h3>` / `<h2>` / `<h1>` with appropriate Tailwind weight/size
3. `| col | col |` table rows — collect consecutive table lines and render as `<table className="text-xs border-collapse w-full my-1">` with `<th>` for header row, `<td>` for data rows, `border border-gray-300 px-2 py-0.5`
4. `- item` or `* item` bullet lines → gather consecutive bullets into `<ul className="list-disc pl-4 text-sm space-y-0.5"><li>`
5. Blank line → paragraph break
6. Non-special lines → `<p className="text-sm text-gray-900">`

Inline (within any text node):
- `**text**` → `<strong>`
- `*text*` → `<em>`
- `` `code` `` → `<code className="bg-gray-100 px-1 rounded font-mono text-xs">`

**This replaces the `m.table` field entirely** — the payments answer should embed the table in the `answer` string and the markdown renderer handles it. Update the chat intent in `intents.js` (from Priority 1):

```js
// Before
return NextResponse.json({ ok: true, answer: "Here are the latest payments: ", table, sources: [] });

// After — table is part of the answer string
return NextResponse.json({ ok: true, answer: `Here are the latest payments:\n\n${table}`, sources: [] });
```

Remove the separate `m.table` rendering from the chat UI (`ChatPanel`).

**Step 2 — ChatMessage component** in `src/components/admin/ChatMessage.js`:

```js
"use client";
import ChatMarkdown from "./ChatMarkdown";
import ImageGenerationPanel from "./ImageGenerationPanel";
import { useTranslation } from "@/lib/i18n";

export default function ChatMessage({ m, uploadBackend }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {m.role === "user" ? "You" : "AI"}
      </div>
      {m.type === "image-generation" ? (
        <ImageGenerationPanel
          initialPrompt={m.prompt}
          description=""
          onSave={null}
          context="chat"
          uploadBackend={uploadBackend}
        />
      ) : (
        <>
          <ChatMarkdown content={m.content} />
          {m.sources && m.sources.length > 0 ? (
            <div className="text-[11px] text-gray-500 flex gap-2 flex-wrap">
              <span className="font-semibold">{t("chat.sources")}:</span>
              {m.sources.map((s, i) => (
                <a key={i} href={s.uri} className="underline" target="_blank" rel="noreferrer">
                  {s.title || s.uri}
                </a>
              ))}
            </div>
          ) : m.role === "assistant" ? (
            <div className="text-[11px] text-gray-400">{t("chat.noSources")}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
```

**Step 3 — ChatPanel component** in `src/components/admin/ChatPanel.js`:

Extract the chat tab div from `AdminDashboard.js` lines 2904–2975 into a new component. Props:

```js
export default function ChatPanel({ chatMessages, chatInput, setChatInput, sendChat, chatLoading, uploadBackend })
```

In `AdminDashboard.js`, replace the inline chat tab with:
```js
import ChatPanel from "./ChatPanel";
// …
{activeTab === "chat" && (
  <ChatPanel
    chatMessages={chatMessages}
    chatInput={chatInput}
    setChatInput={setChatInput}
    sendChat={sendChat}
    chatLoading={chatLoading}
    uploadBackend={uploadBackend}
  />
)}
```

**Bonus — auto-scroll to bottom on new message** (add inside ChatPanel):
```js
const bottomRef = useRef(null);
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [chatMessages]);
// …
// Last element in the message list:
<div ref={bottomRef} />
```

**No visual regression expected** except formatted markdown now renders properly. Verify: `npm test` and `npm run build` clean.

Commit message: `feat(chat): ChatPanel + ChatMarkdown renderer, merge table into answer`

---

**Codex — are there things you'd like to add or suggest?** For example: a per-message "copy answer" button, a "clear chat" button, streaming responses (complex, needs CF streaming support), or any other improvement you think would be valuable. Write your suggestions below before starting, so Claude can review before you build.

**Codex suggestions:** *(write here before starting)*

---

**After both tasks:** append bullets to `claude+codex-coop.md` and mark this section done. Use `docs.lock.pid`.

**Status:** Completed 2026-03-19 (Claude, covering for Codex) — route split into rag/detect/intents modules, ChatMarkdown/ChatMessage/ChatPanel extracted, m.table eliminated, 12 new tests, all 35 tests passing, build clean.

---

### Standing priorities

1. Keep admin tabs, hotkeys, and translations aligned. When adding a tab: update `AdminHeader.js`, `AdminDashboard.js`, and all three i18n files.
2. Validate `npm test` and `npm run build` pass before every push.
3. Update `claude+codex-coop.md` and this file after landing significant changes.

### Lock reminder for Codex

The `agents.lock` and `coop.lock` files you committed have been removed — lock files must **never be committed**. Use `docs.lock.pid` via the script instead (see "Shared-doc lock protocol" above). The script is already there: `node scripts/docs-lock.mjs acquire codex`.

---

### 🔁 Codex: mirror back your understanding of the lock protocol here

The user has asked you to write your understanding of BOTH lock protocols (docs lock + build lock) in this section so Claude can review and correct it. Write it in your own words — don't copy the spec verbatim. Claude will read this and reply below.

**Codex's understanding:** *(write here)*

---

**Claude's review:** *(Claude will fill this in after Codex writes above)*

---

## Recent work log (summary — full detail in coop file)

- **2026-03-19 (Claude)**: AI image generation feature — `src/lib/imageQuota.js`, `src/lib/ai.js` `generateImage`, `/api/admin/generate-image`, `ImageGenerationPanel`, wired into AdminDashboard (shop editor + chat). Auth refactored to Web Crypto API for edge compat. 19 unit tests added.
- **2026-03-19 (Codex)**: Style tab added (Alt+8), legend updated, EN/SV/ES translations, initial AGENTS.md created. StatsChart extracted from AdminStatsTab with `maxOf`/`barHeight`/`formatHour` helpers + tests.
- **2026-03-19 (Claude)**: Chat fixes — payments crash, IMAGE_SYSTEM_PROMPT dedup, history capped to 10. Image gen polish — aspect-ratio thumbnails, copy-prompt button, count=1 option, elapsed timer on generate button.
- **2026-03-19 (Claude, covering Codex)**: Chat modularisation — `src/lib/chat/{rag-utils,rag,detect,intents}.js`; route.js trimmed to ~55 lines; fixed double-escaped email regex. ChatMarkdown/ChatMessage/ChatPanel components; auto-scroll; m.table eliminated. 12 new tests.
