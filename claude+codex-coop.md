# Claude + Codex Co-Working Log

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