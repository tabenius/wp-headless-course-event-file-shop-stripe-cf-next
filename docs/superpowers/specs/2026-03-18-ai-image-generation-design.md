# AI Image Generation — Design Spec
**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Add AI-powered image generation to the admin UI using Cloudflare Workers AI (FLUX.1 schnell). Users can generate 2–3 fitting images from a product description or course content via a shared `ImageGenerationPanel` component that lives both inside the product/course editor and inline in the existing AI chat tab.

---

## Goals

- Generate a draft image prompt from a product/course description using the existing LLM
- Let the user review and edit the prompt, then generate 2–3 images
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
   (existing LLM,      (new — FLUX.1 schnell via cfRun)
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

**POST** `{ prompt: string, count: number }`

Steps:
1. `requireAdmin`
2. Clamp `count` to `Math.max(1, Math.min(3, Math.floor(Number(count) || 1)))` — server enforces [1, 3] regardless of client input
3. Read quota from KV key `ai-image-quota-{YYYY-MM-DD}` (UTC date). KV is account-global, so this is an account-wide cap
4. If `quota.count + count > AI_IMAGE_DAILY_LIMIT` → 429 with quota info, no generation attempted
5. Run `count` FLUX calls in parallel via `cfRun` (existing helper in `src/lib/ai.js`)
   - Model: `@cf/black-forest-labs/flux-1-schnell` (overridable via `CF_IMAGE_MODEL`)
   - Default output: 512×512 PNG (~200–400 KB per image; 3 images ≈ 1–1.5 MB base64 — well within CF Worker limits)
   - Each call returns `ArrayBuffer` (PNG bytes)
6. Collect results. If some calls fail and some succeed, continue with the successful subset
7. Convert successful results to `data:image/png;base64,...`
8. Increment KV quota by the number of **successfully generated** images (not the requested count). TTL 30 h
9. **Race condition policy:** Two concurrent admin requests may both pass the quota check and together generate up to `limit + count_max - 1` (≤ 7) images on a given day. This is accepted as a known non-issue given the low traffic of an admin-only tool. It is not worth the complexity of a distributed lock.
10. Return:
```json
{
  "ok": true,
  "images": ["data:image/png;base64,..."],
  "quota": { "used": 3, "limit": 5, "remaining": 2, "resetsAt": "2026-03-19T00:00:00Z" }
}
```

**GET** — returns current quota only (no generation). Used by the panel on mount to show status before the user generates anything.

**Error if all FLUX calls fail:** return 502 with `{ ok: false, error: "..." }`. Quota is not incremented.

**Configuration:**
- `AI_IMAGE_DAILY_LIMIT` — integer env var, read at request time (default `"5"`)
- `CF_IMAGE_MODEL` — model string override (default `@cf/black-forest-labs/flux-1-schnell`)

### 2. Image-prompt + image-generation intent in `/api/chat` (extend existing route)

**Single response type** for all image-related intents: `{ ok: true, type: "image-generation", prompt: string }`.

Triggered by:
- `{ intent: "image-prompt", description: string }` in POST body (from the editor — skips RAG, goes straight to LLM)
- Natural language keywords in the message: "generate image", "create image", "make image", "skapa bild", "genera imagen" (from chat)

LLM system prompt for prompt generation:
> *"Write a concise, vivid image generation prompt suited for FLUX (max 60 words). Return only the prompt, no explanation, no quotes. Content to base it on: [description]"*

The chat message renderer checks for `type === "image-generation"` and mounts `ImageGenerationPanel` with `initialPrompt` set. All other messages render as text.

### 3. `ImageGenerationPanel` (new React component)

**File:** `src/components/admin/ImageGenerationPanel.js`

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `description` | `string` | Product/course text to seed prompt generation via LLM |
| `initialPrompt` | `string?` | Skip LLM step — pre-fill textarea directly (used from chat intent) |
| `onSave` | `(url: string) => void \| null` | Called after image saved to storage. `null` in chat context (download-only). In editor context, calls `updateProduct(index, "imageUrl", url)` — the parent is responsible for providing this callback correctly |
| `context` | `"editor" \| "chat"` | `"editor"` shows a collapsible inline panel; `"chat"` renders as a chat bubble card |

**States:**
- `prompt` — editable string, initially `initialPrompt` if provided, else empty until LLM returns
- `promptLoading` — true while LLM generates prompt
- `count` — `2` or `3` (toggle buttons)
- `generating` — true while FLUX calls run
- `images` — `string[]` of base64 data URLs (cleared on new generation)
- `quota` — `{ used, limit, remaining, resetsAt }`, fetched via GET on mount and updated after each generation
- `saving` — `number | null` — index of image currently being saved to storage

**Layout (editor context):**
```
┌─ AI Images ──────────────────────────────────────────────┐
│ ▓▓▓░░  3 of 5 used today — resets in 6h 14m             │
│                                                           │
│ [Prompt textarea ← editable]              [↺ Regenerate] │
│                                                           │
│ Images:  [ 2 ]  [ 3 ]        [✨ Generate]               │
│                         (disabled + message if remaining=0)│
│                                                           │
│ ┌──────┐ ┌──────┐ ┌──────┐                               │
│ │ img  │ │ img  │ │ img  │                               │
│ │[Save]│ │[Save]│ │[Save]│  ← hidden if onSave is null  │
│ │[↓ DL]│ │[↓ DL]│ │[↓ DL]│                               │
│ └──────┘ └──────┘ └──────┘                               │
└──────────────────────────────────────────────────────────┘
```

**Quota warning states:**
- `remaining` ≥ 3: no warning
- `remaining` 1–2: amber inline message "Only N image(s) remaining today"
- `remaining` 0: generate button disabled, red message "Daily limit reached. Resets at [HH:MM] UTC."

**Save flow:**
1. Convert base64 data URL to `Blob`
2. POST to `/api/admin/upload?backend=[uploadBackend]` as multipart form data (existing endpoint)
3. On success: call `onSave(url)` with the returned storage URL
4. On failure: show inline error toast; image remains displayed for retry or download

**Download flow:**
Create `<a href=dataURL download="ragbaz-ai-image.png">` programmatically and `.click()` it.

**[↺ Regenerate prompt]:** Re-calls `/api/chat` with `{ intent: "image-prompt", description }` to get a new prompt variant from the LLM.

### 4. Product/course editor integration

In `AdminDashboard.js`, below the existing image URL field in the product edit form:

- Add `[✨ Generate images]` toggle button (small, secondary style)
- Clicking toggles `showImageGen` boolean state — panel is collapsed by default
- `<ImageGenerationPanel>` mounted when `showImageGen` is true
- Props:
  - `description`: `product.description || product.name`
  - `onSave`: `(url) => updateProduct(index, "imageUrl", url)` — updates the product's `imageUrl` field in the existing form state
  - `context="editor"`

For **WP courses/events** in the access tab: description assembled from `allWpContent.find(item => item.uri === selectedCourse)?.content` stripped of HTML via the existing `stripHtml` utility.

### 5. Chat tab integration

In the chat message renderer within `AdminDashboard.js`:
- Each message object may have `type: "image-generation"` and `prompt: string`
- When present: render `<ImageGenerationPanel initialPrompt={msg.prompt} onSave={null} context="chat" description="" />`
- `onSave={null}` means Save buttons are hidden — download-only in chat context since there is no product in scope
- `description=""` since `initialPrompt` bypasses the LLM prompt-generation step

---

## Quota Tracking

| Property | Value |
|----------|-------|
| KV key | `ai-image-quota-{YYYY-MM-DD}` (UTC date) |
| Value shape | `{ count: number }` |
| TTL | 30 hours (ensures cleanup; covers midnight rollover) |
| Scope | Account-wide (KV is global across all Worker instances) |
| Limit source | `parseInt(process.env.AI_IMAGE_DAILY_LIMIT ?? "5", 10)` read at request time |
| Increment | Number of **successfully generated** images, not the requested count |
| KV failure | Treat quota as `{ count: 0 }` (fail open — do not lock admin out) |
| Race policy | Accepted overage of up to `count_max - 1` images per day (admin-only, low traffic) |

---

## Error Handling

| Scenario | API behaviour | UI behaviour |
|----------|--------------|--------------|
| Quota exceeded | 429 + quota info | Button disabled, reset time shown |
| All FLUX calls fail | 502 + error message | Toast error, quota unchanged |
| Some FLUX calls fail | 200 + partial images + quota | Show available images, toast "N of M generated" |
| KV read/write fails | Proceed with count=0 / skip increment | Quota shown as unknown |
| Save to storage fails | — (client-side) | Inline error toast, image stays for retry/download |
| Prompt generation fails | — (chat route returns error) | Show empty editable textarea; user types prompt manually |

---

## New files

| File | Purpose |
|------|---------|
| `src/app/api/admin/generate-image/route.js` | FLUX image generation + quota |
| `src/components/admin/ImageGenerationPanel.js` | Shared generation UI component |

## Modified files

| File | Change |
|------|--------|
| `src/lib/ai.js` | Add `generateImage(prompt)` helper returning `ArrayBuffer` |
| `src/app/api/chat/route.js` | Add `image-prompt` intent + natural language image intent |
| `src/components/admin/AdminDashboard.js` | Mount panel in product editor + chat message renderer |

---

## Out of scope

- Public-facing image generation (admin-only)
- Storing generated images in an admin gallery or history
- Inpainting, img2img, or other FLUX variants
- Per-user quota (single shared admin quota is sufficient)
- Distributed quota locking
