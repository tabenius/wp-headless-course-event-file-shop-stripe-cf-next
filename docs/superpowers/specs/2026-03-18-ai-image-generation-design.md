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
- Protect the free-tier neuron budget: image generation is capped at `AI_IMAGE_DAILY_LIMIT` (default 5) images per UTC day, tracked separately from chat usage
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

**POST** `{ prompt: string, count: 1 | 2 | 3 }`

Steps:
1. `requireAdmin`
2. Read quota from KV key `ai-image-quota-{YYYY-MM-DD}` (UTC)
3. If `quota.count + count > AI_IMAGE_DAILY_LIMIT` → return 429 with quota info
4. Run `count` FLUX calls in parallel using existing `cfRun` in `src/lib/ai.js`
   Model: `@cf/black-forest-labs/flux-1-schnell`
   Returns: `ArrayBuffer` (PNG bytes per call)
5. Convert each buffer to `data:image/png;base64,...`
6. Increment KV quota: `count += count`, TTL 30 h (covers midnight rollover safely)
7. Return:
```json
{
  "ok": true,
  "images": ["data:image/png;base64,..."],
  "quota": { "used": 3, "limit": 5, "remaining": 2, "resetsAt": "2026-03-19T00:00:00Z" }
}
```

**GET** — returns current quota only (no generation). Used by the panel on mount to show status.

**Configuration:**
- `AI_IMAGE_DAILY_LIMIT` env var (default `5`), read at request time
- Model overridable via `CF_IMAGE_MODEL` env var (default `@cf/black-forest-labs/flux-1-schnell`)

### 2. Image-prompt intent in `/api/chat` (extend existing route)

New intent branch triggered by:
- `{ intent: "image-prompt", description: string }` in the POST body (from editor)
- Natural language: "generate image", "skapa bild", "genera imagen" (from chat)

When triggered from the **editor**: calls LLM with system prompt:
> *"Write a concise, vivid image generation prompt (max 60 words) suited for FLUX image generation. Return only the prompt, no explanation. Product/course: [description]"*
Returns `{ ok: true, type: "image-prompt", prompt: "..." }`.

When triggered from **chat** (natural language): same LLM call, infers description from RAG context or the message itself. Returns `{ ok: true, type: "image-generation", prompt: "..." }` — the chat renderer then mounts `ImageGenerationPanel`.

### 3. `ImageGenerationPanel` (new React component)

**File:** `src/components/admin/ImageGenerationPanel.js`

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `description` | `string` | Product/course text to seed prompt generation |
| `initialPrompt` | `string?` | Skip LLM step if prompt already available (from chat intent) |
| `onSave` | `(url: string) => void \| null` | Called after image saved to storage. `null` in chat context (download-only) |
| `context` | `"editor" \| "chat"` | Slight layout differences |

**States:**
- `prompt` — editable textarea, initially empty until LLM returns
- `promptLoading` — true while LLM generates prompt
- `count` — 2 or 3 (toggle)
- `generating` — true while FLUX calls run
- `images` — `string[]` of base64 data URLs
- `quota` — `{ used, limit, remaining, resetsAt }` fetched on mount and after each generation
- `saving` — index of image currently being saved

**Layout (editor context):**
```
┌─ AI Images ──────────────────────────────────────────────┐
│ ▓▓▓░░  3 of 5 used today — resets in 6h 14m             │
│                                                           │
│ [Prompt textarea ← editable]              [↺ Regenerate] │
│                                                           │
│ Images:  [ 2 ]  [ 3 ]        [✨ Generate]               │
│                          (disabled + warning if quota=0)  │
│                                                           │
│ ┌──────┐ ┌──────┐ ┌──────┐                               │
│ │ img  │ │ img  │ │ img  │                               │
│ │[Save]│ │[Save]│ │[Save]│                               │
│ │[↓ DL]│ │[↓ DL]│ │[↓ DL]│                               │
│ └──────┘ └──────┘ └──────┘                               │
└──────────────────────────────────────────────────────────┘
```

**Quota warning states:**
- 1–2 remaining: amber warning "Only N images remaining today"
- 0 remaining: generate button disabled, red message "Daily image limit reached. Resets at [time] UTC."

**Save flow:**
Converts base64 data URL to a `Blob`, POSTs to `/api/admin/upload?backend=[uploadBackend]` (existing endpoint). On success calls `onSave(url)` so the editor can update `product.imageUrl`.

**Download flow:**
Creates an `<a href=dataURL download="ragbaz-ai-image.png">` and clicks it programmatically.

### 4. Product/course editor integration

In `AdminDashboard.js`, below the existing image URL field in the product edit form:

- Add `[✨ Generate images]` button (small, secondary style)
- Toggles an inline `ImageGenerationPanel` (collapsed by default)
- `description` assembled from: `product.description || product.name`
- `onSave` sets `product.imageUrl` via existing `updateProduct(index, "imageUrl", url)`
- `uploadBackend` passed through from existing admin state

For **course access** items (WP courses/events): description assembled from `allWpContent.find(uri).content` stripped of HTML.

### 5. Chat tab integration

In the chat message renderer (within `AdminDashboard.js`):
- Messages with `type === "image-generation"` render `ImageGenerationPanel` instead of a text bubble
- `context="chat"`, `onSave={null}` (download-only — no product in scope)
- `initialPrompt` set from the returned `prompt` field (skips LLM step)

---

## Quota Tracking

**KV key:** `ai-image-quota-{YYYY-MM-DD}` (UTC date)
**Value:** `{ count: number }`
**TTL:** 30 hours (ensures cleanup even if the date-based key rollover misses)
**Limit:** `parseInt(process.env.AI_IMAGE_DAILY_LIMIT ?? "5")`
**Read at:** request time (so limit changes take effect immediately)

Quota is **additive and non-transactional** — there is no locking. In the unlikely case of concurrent requests, the count may slightly exceed the limit by at most one batch. This is acceptable given the low traffic of an admin tool.

---

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| Quota hit | 429 from API; panel shows disabled button + reset time |
| CF AI error | 502 from API; panel shows inline error toast |
| KV read/write failure | Log error, treat quota as 0 used (fail open so admin isn't locked out) |
| Save to storage fails | Toast error; image stays displayed for manual retry or download |
| Prompt generation fails | Show empty editable textarea; user types prompt manually |

---

## New files

| File | Purpose |
|------|---------|
| `src/app/api/admin/generate-image/route.js` | FLUX image generation + quota |
| `src/components/admin/ImageGenerationPanel.js` | Shared generation UI component |

## Modified files

| File | Change |
|------|--------|
| `src/lib/ai.js` | Add `generateImage(prompt)` helper returning ArrayBuffer |
| `src/app/api/chat/route.js` | Add image-prompt intent + chat image-generation intent |
| `src/components/admin/AdminDashboard.js` | Mount panel in product editor + chat message renderer |

---

## Out of scope

- Public-facing image generation (admin-only)
- Storing generated images in the admin's own gallery/history
- Inpainting, img2img, or other FLUX variants
- Per-user quota (single shared admin quota is sufficient)
