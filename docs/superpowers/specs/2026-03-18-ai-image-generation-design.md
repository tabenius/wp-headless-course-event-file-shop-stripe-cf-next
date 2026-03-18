# AI Image Generation — Design Spec
**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Add AI-powered image generation to the admin UI using Cloudflare Workers AI (FLUX.1 schnell). Users can generate 2–3 fitting images from a product description or course content via a shared `ImageGenerationPanel` component that lives both inside the product/course editor and inline in the existing AI chat tab. Image dimensions are selected from named size presets (square, landscape banner, portrait, A6 print) so the generated image fits its intended use without manual pixel arithmetic.

---

## Goals

- Generate a draft image prompt from a product/course description using the existing LLM
- Let the user review and edit the prompt, pick a size preset, then generate 2–3 images
- Display images in a grid with per-image Save (to WordPress/R2/S3) and Download actions
- Protect the free-tier neuron budget: image generation is capped at `AI_IMAGE_DAILY_LIMIT` (default 5) images per UTC day across the whole account (KV is global), tracked separately from chat usage
- Show live quota status (used / limit / resets-at) so the user always knows where they stand

---

## Architecture

### Data flow

```
Product/course editor          Chat tab
      │                            │
  [✨ Generate images]    user: "generate image for..."
      │                            │
      └──────────┬─────────────────┘
                 ▼
        ImageGenerationPanel          (shared React component)
                 │
         ┌───────┴────────┐
         │                │
   prompt generation   image generation
         │                │
   POST /api/chat      POST /api/admin/generate-image
   (existing LLM,      (new — FLUX.1 schnell, binary response)
    new intent)               │
         │            returns base64 PNGs + quota
         │                    │
   editable prompt     ┌──────┼──────┐
   pre-fills textarea Save  Save  Download
                       WP    R2   (blob URL)
                         │
                   /api/admin/upload
                   (existing endpoint)
```

---

## Components

### 1. `/api/admin/generate-image` (new route)

**Runtime:** `export const runtime = "edge"` (consistent with `/api/chat`; `btoa` is available in edge runtime).

**Environment variables required:**
- `CF_ACCOUNT_ID` — used by `generateImage` helper (`cfEndpoint` in `src/lib/ai.js`)
- `CLOUDFLARE_ACCOUNT_ID` — used by `cloudflareKv.js` (`hasCloudflareConfig()`) for KV reads/writes; may be the same value as `CF_ACCOUNT_ID`
- `CF_KV_NAMESPACE_ID` — KV namespace ID; without this `hasCloudflareConfig()` returns `false`, all KV calls return `null`/`false`, and quota is silently bypassed (daily limit never enforced)
- `CF_API_TOKEN` — Cloudflare API token with AI Write and KV Write permissions
- `AI_IMAGE_DAILY_LIMIT` — integer, default `"5"`
- `CF_IMAGE_MODEL` — model string, default `@cf/black-forest-labs/flux-1-schnell`

**POST** `{ prompt: string, count: number, size: string }`

Steps:
1. `requireAdmin`
2. Clamp `count` to `Math.max(1, Math.min(3, Math.floor(Number(count) || 1)))` — server enforces [1, 3] regardless of client input
3. Resolve `size` to pixel dimensions using the preset table below (default `"square"` if unrecognised)
4. Read quota from KV key `ai-image-quota-{YYYY-MM-DD}` (UTC date). A `null` return (fresh day or KV unconfigured) is treated as `{ count: 0 }`. KV is account-global → account-wide cap
5. If `quota.count + count > AI_IMAGE_DAILY_LIMIT` → 429 with quota info, no generation attempted
6. Run `count` FLUX calls in parallel via `generateImage(prompt, width, height)` helper (see `src/lib/ai.js`)
7. Collect results. If some calls fail and some succeed, continue with the successful subset
8. Convert successful `ArrayBuffer` results to `data:image/png;base64,...`. In the edge runtime `Buffer` is unavailable; use a chunked loop to avoid call stack overflow on large images:

```js
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:image/png;base64," + btoa(binary);
}
```

9. Increment KV quota by the number of **successfully generated** images (not the requested count). TTL 30 h. The write is a read-then-write (not atomic): the stored count is `previousCount + successCount`. Under concurrent requests the count may be understated by up to `count_max - 1`. This is the accepted write-race, consistent with the quota-check race in step 11.
10. Compute `resetsAt` as midnight of the next UTC day: `new Date(Date.UTC(y, m, d + 1)).toISOString()`. `d + 1` beyond the end of month rolls over correctly in `Date.UTC` — this is intentional, not a bug.
11. **Race condition policy:** Two concurrent admin requests may both pass the quota check and together generate up to `limit + count_max - 1` (≤ 7) images on a given day. This is accepted as a known non-issue given the low traffic of an admin-only tool.
12. If zero images succeeded (all calls failed without throwing), return 502 with `{ ok: false, error: "All image generation calls failed" }`. HTTP 200 with `images: []` is not a valid response.
12. Return:

```json
{
  "ok": true,
  "images": ["data:image/png;base64,..."],
  "quota": { "used": 3, "limit": 5, "remaining": 2, "resetsAt": "2026-03-19T00:00:00Z" }
}
```

**GET** — returns current quota only (no generation). Response shape:

```json
{ "ok": true, "quota": { "used": 2, "limit": 5, "remaining": 3, "resetsAt": "2026-03-19T00:00:00Z" } }
```

When KV returns `null` (fresh day or unconfigured), `used` is `0` and `remaining` equals `limit`. `resetsAt` is always computed as midnight of the next UTC day regardless of KV state.

**Error if all FLUX calls fail:** return 502 with `{ ok: false, error: "..." }`. Quota is not incremented.

**Error on quota exceeded:** 429 with `{ ok: false, error: "Daily limit reached", quota: { used, limit, remaining, resetsAt } }`.

---

### `generateImage` helper in `src/lib/ai.js`

```js
export async function generateImage(prompt, width = 512, height = 512) {
  const model = process.env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error("CF_API_TOKEN missing");
  const res = await fetch(cfEndpoint(model), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, width, height }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF AI image error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.arrayBuffer();   // FLUX returns raw PNG bytes, not JSON
}
```

This function does **not** call `cfRun` because `cfRun` always calls `res.json()`. `generateImage` reads the raw binary response directly.

---

### 2. Image size presets

The `size` field in the POST body and the UI selector use these named presets. FLUX width/height must be multiples of 8.

| Preset key | Label | Dimensions | Typical use |
|------------|-------|-----------|------------|
| `square` | Square (default) | 512 × 512 | Instagram post, product image, general |
| `landscape` | Landscape / Banner | 896 × 512 | Facebook group banner, social media header, email banner |
| `portrait` | Portrait | 512 × 768 | Instagram story, Pinterest, card front |
| `a6-150dpi` | A6 card (150 dpi) | 624 × 880 | A6 print proof at 150 dpi (105 mm × 148 mm); for true 300 dpi output use an external tool to upscale — 300 dpi would require 1240 × 1752 px which may exceed Cloudflare free-tier neuron limits |

**Neuron cost note:** Larger images consume significantly more Cloudflare free-tier neurons per generation even though the daily image count quota tracks only the number of images, not neurons directly. The `a6-150dpi` preset costs roughly 4× more neurons than `square`. This is noted in a tooltip next to each preset option.

The server-side resolver:

```js
const SIZE_PRESETS = {
  square:     { width: 512,  height: 512 },
  landscape:  { width: 896,  height: 512 },
  portrait:   { width: 512,  height: 768 },
  "a6-150dpi": { width: 624, height: 880 },
};
const { width, height } = SIZE_PRESETS[size] ?? SIZE_PRESETS.square;
```

---

### 3. Image-prompt intent in `/api/chat` (extend existing route)

**Response type** for image intents: `{ ok: true, type: "image-generation", prompt: string }` — **no `answer` field**.

**Both paths require admin authentication** (`requireAdmin`) — not just `rebuild` requests. Image intent checks must execute before the existing `if (!message) return 400` guard, because Path A requests have no `message` field.

**Trigger paths:**

**Path A — explicit intent (from editor panel):**
POST body includes `{ intent: "image-prompt", description: string }`. The route checks `body.intent === "image-prompt"` **first**, before extracting `body.message` or applying the empty-message 400 guard. Calls `requireAdmin`, then skips RAG entirely and calls LLM directly with the image-prompt system prompt below.

**Path B — natural language (from chat tab):**
Falls through to the existing `body.message` path. After extracting `message`, if `lower` includes any of: `"generate image"`, `"create image"`, `"make image"`, `"skapa bild"`, `"genera imagen"` — call `requireAdmin` and treat as image intent. Extract description from the message itself.

**LLM system prompt:**
> *"Write a concise, vivid image generation prompt suited for FLUX (max 60 words). Return only the prompt, no explanation, no quotes. Content to base it on: [description]"*

**`sendChat` update in `AdminDashboard.js`:**

When the chat API returns `{ ok: true, type: "image-generation", prompt }`, the `sendChat` function appends the message as:
```js
{ role: "assistant", type: "image-generation", prompt: json.prompt }
```
(not `content: json.answer` — the `content` field is absent for image-generation messages).

**Chat message renderer:**
```jsx
messages.map((m, i) =>
  m.type === "image-generation"
    ? <ImageGenerationPanel key={i} initialPrompt={m.prompt} onSave={null} context="chat" description="" uploadBackend={uploadBackend} />
    : <div key={i}>{m.content}</div>
)
```

---

### 4. `ImageGenerationPanel` (new React component)

**File:** `src/components/admin/ImageGenerationPanel.js`

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `description` | `string` | Product/course text to seed prompt generation via LLM. Empty string when `initialPrompt` is provided (chat context). |
| `initialPrompt` | `string?` | Skip LLM step — pre-fill textarea directly (used from chat intent) |
| `onSave` | `(url: string) => void \| null` | Called after image saved to storage. `null` in chat context (hides Save buttons). In editor context: `(url) => updateProduct(index, "imageUrl", url)` — the parent provides this callback. |
| `context` | `"editor" \| "chat"` | `"editor"` shows a collapsible inline panel; `"chat"` renders as a chat bubble card |
| `uploadBackend` | `string` | Value of `uploadBackend` state from `AdminDashboard.js`, forwarded to `/api/admin/upload?backend=` |

**States:**
- `prompt` — editable string, initially `initialPrompt` if provided, else empty until LLM returns
- `promptLoading` — true while LLM generates prompt
- `count` — `2` or `3` (toggle buttons), default `2`. The server accepts `[1, 3]` but the UI only exposes 2 and 3 — a future "1 image" UI option would work without server changes.
- `size` — one of the preset keys, default `"square"`
- `generating` — true while FLUX calls run
- `images` — `string[]` of base64 data URLs (cleared on new generation)
- `quota` — `{ used, limit, remaining, resetsAt }`, fetched via GET on mount and updated after each generation
- `saving` — `number | null` — index of image currently being saved to storage

**On mount:**
1. GET `/api/admin/generate-image` → populate `quota`
2. If `description` is non-empty and `initialPrompt` is absent: POST `/api/chat` with `{ intent: "image-prompt", description }` → on success set `prompt` from `json.prompt`; on failure leave `prompt` empty (user types manually)

**Layout (editor context):**
```
┌─ AI Images ──────────────────────────────────────────────────┐
│ ▓▓▓░░  3 of 5 used today — resets in 6h 14m                 │
│                                                               │
│ [Prompt textarea ← editable]                [↺ Regenerate]   │
│                                                               │
│ Images:  [ 2 ]  [ 3 ]                                        │
│ Size:  [Square▼]  (tooltip: "Larger sizes use more neurons") │
│                                          [✨ Generate]        │
│                              (disabled + message if remaining=0)│
│                                                               │
│ ┌──────┐ ┌──────┐ ┌──────┐                                   │
│ │ img  │ │ img  │ │ img  │                                    │
│ │[Save]│ │[Save]│ │[Save]│  ← hidden if onSave is null       │
│ │[↓ DL]│ │[↓ DL]│ │[↓ DL]│                                   │
│ └──────┘ └──────┘ └──────┘                                   │
└──────────────────────────────────────────────────────────────┘
```

**Size selector:** A `<select>` dropdown (or button group) showing preset labels. Each option includes a parenthetical use-case hint, e.g. `"Square — Instagram, product"`. A tooltip on the selector reads: *"Larger presets consume more Cloudflare AI neurons."*

**[↺ Regenerate prompt]:** Visible in `context="editor"` only. Hidden in `context="chat"` since `description=""`. Also **disabled** (not just visible) when `description` is empty even in editor context (e.g. product with no name or description) — clicking with an empty description would produce a meaningless LLM prompt. Re-calls `/api/chat` with `{ intent: "image-prompt", description }` to get a new prompt variant.

**Quota warning states:**
- `remaining` ≥ 3: no warning
- `remaining` 1–2: amber inline message "Only N image(s) remaining today"
- `remaining` 0: generate button disabled, red message "Daily limit reached. Resets at [HH:MM] UTC."

**Save flow:**
1. Convert base64 data URL to `Blob` (MIME type `image/png`)
2. Append to `FormData` as `file` field with filename `ragbaz-ai-image.png` and MIME type `image/png`
3. POST to `/api/admin/upload?backend=${uploadBackend}` as multipart form data (existing endpoint)
4. On success: call `onSave(json.url)` — read the `url` field from the JSON response
5. On failure: show inline error toast; image remains displayed for retry or download

**Download flow:**
Create `<a href={dataURL} download="ragbaz-ai-image.png">` programmatically and `.click()` it.

---

### 5. Product/course editor integration

In `AdminDashboard.js`, below the existing image URL field in the product edit form:

- Add `[✨ Generate images]` toggle button (small, secondary style)
- Clicking toggles `showImageGen` boolean state — panel is collapsed by default
- `<ImageGenerationPanel>` mounted when `showImageGen` is true
- Props:
  - `description`: `product.description || product.name`
  - `onSave`: `(url) => updateProduct(index, "imageUrl", url)` — updates the product's `imageUrl` field in the existing form state
  - `context="editor"`
  - `uploadBackend={uploadBackend}` — forwarded from `AdminDashboard.js` local state

For **WP courses/events** in the access tab: `description` is assembled inline at the JSX call site as `stripHtml(allWpContent.find(item => item.uri === selectedCourse)?.content || "")`. This is not a new prop threaded into the component — the assembly happens at the call site, keeping `ImageGenerationPanel` decoupled.

---

### 6. Chat tab integration

In the chat message renderer within `AdminDashboard.js`:
- Each message object may have `type: "image-generation"` and `prompt: string`
- When present: render `<ImageGenerationPanel initialPrompt={msg.prompt} onSave={null} context="chat" description="" uploadBackend={uploadBackend} />`
- `onSave={null}` means Save buttons are hidden — download-only in chat context since there is no product in scope
- `description=""` since `initialPrompt` bypasses the LLM prompt-generation step
- `[↺ Regenerate prompt]` is hidden in chat context (no `description` to regenerate from)

---

## Quota Tracking

| Property | Value |
|----------|-------|
| KV key | `ai-image-quota-{YYYY-MM-DD}` (UTC date) |
| Value shape | `{ count: number }` |
| TTL | 30 hours (ensures cleanup even if key written near midnight) |
| Scope | Account-wide (KV is global across all Worker instances) |
| Limit source | `parseInt(process.env.AI_IMAGE_DAILY_LIMIT ?? "5", 10)` read at request time |
| Increment | Number of **successfully generated** images, not the requested count |
| KV null / failure | Treat as `{ count: 0 }` (fail open — do not lock admin out) |
| `resetsAt` | `new Date(Date.UTC(y, m, d + 1)).toISOString()` — midnight of the next UTC calendar day, computed fresh on every request |
| Race policy | Accepted overage of up to `count_max - 1` images per day (admin-only, low traffic) |

---

## Error Handling

| Scenario | API behaviour | UI behaviour |
|----------|--------------|--------------|
| Quota exceeded | 429 + `{ ok: false, error, quota }` | Button disabled, reset time shown |
| All FLUX calls fail | 502 + `{ ok: false, error }` | Toast error, quota unchanged |
| Some FLUX calls fail | 200 + partial `images` array + quota | Show available images; toast "N of M generated" where N=`images.length` and M=the `count` the client sent |
| KV read/write fails | Proceed with `count=0` / skip increment | Quota shown as unknown |
| Save to storage fails | — (client-side) | Inline error toast, image stays for retry/download |
| Prompt generation fails | Chat route returns error | Show empty editable textarea; user types prompt manually |
| Unrecognised `size` key | Server falls back to `square` | — |

---

## New files

| File | Purpose |
|------|---------|
| `src/app/api/admin/generate-image/route.js` | FLUX image generation + quota |
| `src/components/admin/ImageGenerationPanel.js` | Shared generation UI component |

## Modified files

| File | Change |
|------|--------|
| `src/lib/ai.js` | Add `generateImage(prompt, width, height)` helper — reads raw `ArrayBuffer` (not JSON) |
| `src/app/api/chat/route.js` | Add `image-prompt` intent (checked before `message`) + natural language image keywords |
| `src/components/admin/AdminDashboard.js` | Mount panel in product editor + update `sendChat` + chat message renderer |

---

## Out of scope

- Public-facing image generation (admin-only)
- Storing generated images in an admin gallery or history
- Inpainting, img2img, or other FLUX variants
- Per-user quota (single shared admin quota is sufficient)
- Distributed quota locking
- Custom pixel dimensions (named presets only)
- Automatic upscaling to true 300 dpi (user handles externally if needed)
