# AI Image Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add FLUX.1 schnell image generation to the admin UI, integrated into both the product/course editor and the existing AI chat tab, with named size presets and a per-day KV quota.

**Architecture:** A new `generateImage` helper in `src/lib/ai.js` calls the FLUX API and returns a raw `ArrayBuffer`. A new edge route `/api/admin/generate-image` (GET for quota, POST to generate) enforces the daily limit via Cloudflare KV. A shared `ImageGenerationPanel` React component handles the whole UI flow — prompt generation, size selection, image display, save/download — and is mounted in the shop product editor and in the chat message renderer.

**Tech Stack:** Next.js 15 App Router (edge runtime), Cloudflare Workers AI (FLUX.1 schnell), Cloudflare KV (via `src/lib/cloudflareKv.js`), React hooks, Node `node:test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-03-18-ai-image-generation-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/ai.js` | Add `generateImage(prompt, width, height)` — raw binary fetch |
| Create | `src/lib/imageQuota.js` | Exported pure helpers: SIZE_PRESETS, resolveSize, clampCount, computeResetsAt, arrayBufferToBase64 |
| Create | `src/app/api/admin/generate-image/route.js` | GET quota / POST generate; quota tracking in KV |
| Create | `tests/generate-image.test.js` | Unit tests — imports from real source files |
| Create | `src/components/admin/ImageGenerationPanel.js` | Shared generation UI (prompt, size, images, quota) |
| Modify | `src/lib/i18n/en.json` | Add image generation UI strings |
| Modify | `src/lib/i18n/sv.json` | Swedish translations |
| Modify | `src/lib/i18n/es.json` | Spanish translations |
| Modify | `src/app/api/chat/route.js` | Add image-prompt intent before 400 guard |
| Modify | `src/components/admin/AdminDashboard.js` | Update sendChat + chat renderer + editor panel toggle |

---

## Chunk 1: Backend

### Task 1: Shared pure helpers in `src/lib/imageQuota.js` + tests

**Files:**
- Create: `src/lib/imageQuota.js` (pure helpers — no side effects, importable in tests)
- Modify: `src/lib/ai.js` (add `generateImage`)
- Create: `tests/generate-image.test.js`

Extracting pure helpers into a separate module means tests import the real implementations, not stubs.

- [ ] **Step 1.1: Create `src/lib/imageQuota.js`**

```js
export const SIZE_PRESETS = {
  square:      { width: 512,  height: 512 },
  landscape:   { width: 896,  height: 512 },
  portrait:    { width: 512,  height: 768 },
  "a6-150dpi": { width: 624,  height: 880 },
};

export function resolveSize(key) {
  return SIZE_PRESETS[key] ?? SIZE_PRESETS.square;
}

export function clampCount(raw) {
  return Math.max(1, Math.min(3, Math.floor(Number(raw) || 1)));
}

export function computeResetsAt() {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  return new Date(Date.UTC(y, m, d + 1)).toISOString();
}

export function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:image/png;base64," + btoa(binary);
}
```

- [ ] **Step 1.2: Write the failing tests in `tests/generate-image.test.js`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  arrayBufferToBase64,
  resolveSize,
  clampCount,
  computeResetsAt,
  SIZE_PRESETS,
} from "../src/lib/imageQuota.js";

// ── arrayBufferToBase64 ──────────────────────────────────────────────────────
test("arrayBufferToBase64 produces correct data URL prefix", () => {
  const buf = new Uint8Array([137, 80, 78, 71]).buffer; // PNG magic bytes
  assert.ok(arrayBufferToBase64(buf).startsWith("data:image/png;base64,"));
});

test("arrayBufferToBase64 round-trips through atob correctly", () => {
  const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
  const dataUrl = arrayBufferToBase64(original.buffer);
  const b64 = dataUrl.replace("data:image/png;base64,", "");
  const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  assert.deepEqual(Array.from(decoded), Array.from(original));
});

test("arrayBufferToBase64 handles empty buffer", () => {
  assert.equal(arrayBufferToBase64(new ArrayBuffer(0)), "data:image/png;base64,");
});

// ── resolveSize ──────────────────────────────────────────────────────────────
test("resolveSize returns square dimensions", () => {
  assert.deepEqual(resolveSize("square"), { width: 512, height: 512 });
});

test("resolveSize returns landscape dimensions", () => {
  assert.deepEqual(resolveSize("landscape"), { width: 896, height: 512 });
});

test("resolveSize returns portrait dimensions", () => {
  assert.deepEqual(resolveSize("portrait"), { width: 512, height: 768 });
});

test("resolveSize returns a6-150dpi dimensions", () => {
  assert.deepEqual(resolveSize("a6-150dpi"), { width: 624, height: 880 });
});

test("resolveSize falls back to square for unrecognised key", () => {
  assert.deepEqual(resolveSize("unknown"), SIZE_PRESETS.square);
});

test("resolveSize falls back to square for undefined", () => {
  assert.deepEqual(resolveSize(undefined), SIZE_PRESETS.square);
});

// ── clampCount ───────────────────────────────────────────────────────────────
test("clampCount clamps 0 to 1", () => assert.equal(clampCount(0), 1));
test("clampCount passes through 2", () => assert.equal(clampCount(2), 2));
test("clampCount passes through 3", () => assert.equal(clampCount(3), 3));
test("clampCount clamps 4 to 3", () => assert.equal(clampCount(4), 3));
test("clampCount handles string '2'", () => assert.equal(clampCount("2"), 2));
test("clampCount handles NaN → 1", () => assert.equal(clampCount("abc"), 1));
test("clampCount floors 2.9 to 2", () => assert.equal(clampCount(2.9), 2));

// ── computeResetsAt ──────────────────────────────────────────────────────────
test("computeResetsAt returns ISO string at UTC midnight", () => {
  const result = computeResetsAt();
  assert.ok(result.endsWith("T00:00:00.000Z"), `Expected midnight UTC, got ${result}`);
  assert.ok(new Date(result) > new Date(), "Expected future timestamp");
});
```

- [ ] **Step 1.3: Run tests — should FAIL (module not yet created)**

```bash
npm test
```

Expected: `ERR_MODULE_NOT_FOUND` or similar — confirming tests import the real file.

- [ ] **Step 1.4: Verify the file exists** (you just created it in Step 1.1 — if tests now pass, the cycle is working)

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 1.5: Add `generateImage` to `src/lib/ai.js`**

Append to the end of `src/lib/ai.js` (after `chatWithContext`):

```js
import { arrayBufferToBase64 as _toBase64 } from "./imageQuota.js";
export { arrayBufferToBase64 } from "./imageQuota.js";

export async function generateImage(prompt, width = 512, height = 512) {
  const model = process.env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error("CF_API_TOKEN missing");
  const res = await fetch(cfEndpoint(model), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, width, height }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF AI image error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}
```

> **Note:** `arrayBufferToBase64` lives in `imageQuota.js` and is re-exported from `ai.js` for consumers that already import from `ai`. The route imports directly from `imageQuota.js` to avoid circular dependencies.

- [ ] **Step 1.6: Run tests again**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 1.7: Commit**

```bash
git add src/lib/imageQuota.js src/lib/ai.js tests/generate-image.test.js
git commit -m "feat: add imageQuota helpers, generateImage, and unit tests

Pure helpers (resolveSize, clampCount, computeResetsAt, arrayBufferToBase64)
extracted to src/lib/imageQuota.js so tests import real implementations.
generateImage bypasses cfRun to read raw ArrayBuffer from FLUX (edge-safe)."
```

---

### Task 2: `/api/admin/generate-image` route (GET quota + POST generate)

**Files:**
- Create: `src/app/api/admin/generate-image/route.js`

> **Note on env vars:** The route needs both `CF_ACCOUNT_ID` (for `generateImage` → `cfEndpoint`) and `CLOUDFLARE_ACCOUNT_ID` + `CF_KV_NAMESPACE_ID` (for `cloudflareKv.js`). All three plus `CF_API_TOKEN` must be set. If `CF_KV_NAMESPACE_ID` is absent, quota is silently skipped (fail-open).

- [ ] **Step 2.1: Create the route file**

Create `src/app/api/admin/generate-image/route.js`:

```js
export const runtime = "edge";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { generateImage } from "@/lib/ai";
import { resolveSize, clampCount, computeResetsAt, arrayBufferToBase64 } from "@/lib/imageQuota";
import { readCloudflareKvJson, writeCloudflareKvJson } from "@/lib/cloudflareKv";

function kvKey() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `ai-image-quota-${y}-${m}-${d}`;
}

async function readQuota() {
  try {
    const data = await readCloudflareKvJson(kvKey());
    return { count: Number(data?.count) || 0 };
  } catch {
    return { count: 0 };
  }
}

async function incrementQuota(currentCount, by) {
  // currentCount: the value we read before generation (avoid extra KV round-trip)
  if (by <= 0) return;
  try {
    await writeCloudflareKvJson(kvKey(), { count: currentCount + by }, { expirationTtl: 30 * 3600 });
  } catch {
    // fail open — quota undercount is acceptable per spec
  }
}

function buildQuotaResponse(used, limit) {
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, resetsAt: computeResetsAt() };
}

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth?.error) return auth.error;

  const limit = parseInt(process.env.AI_IMAGE_DAILY_LIMIT ?? "5", 10);
  const { count: used } = await readQuota();
  return NextResponse.json({ ok: true, quota: buildQuotaResponse(used, limit) });
}

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth?.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = (body?.prompt || "").trim();
  if (!prompt) return NextResponse.json({ ok: false, error: "prompt required" }, { status: 400 });

  const count = clampCount(body?.count);
  const { width, height } = resolveSize(body?.size);
  const limit = parseInt(process.env.AI_IMAGE_DAILY_LIMIT ?? "5", 10);

  const { count: used } = await readQuota();
  if (used + count > limit) {
    return NextResponse.json(
      { ok: false, error: "Daily limit reached", quota: buildQuotaResponse(used, limit) },
      { status: 429 },
    );
  }

  // Run FLUX calls in parallel; collect successes only
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => generateImage(prompt, width, height)),
  );
  const buffers = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  if (buffers.length === 0) {
    const firstError = results.find((r) => r.status === "rejected")?.reason?.message || "All FLUX calls failed";
    return NextResponse.json({ ok: false, error: firstError }, { status: 502 });
  }

  const images = buffers.map(arrayBufferToBase64);

  // Pass `used` (pre-generation read) to avoid an extra KV round-trip.
  // Response reflects local computation: new used = used + images.length.
  await incrementQuota(used, images.length);
  const newUsed = used + images.length;

  return NextResponse.json({
    ok: true,
    images,
    quota: buildQuotaResponse(newUsed, limit),
  });
}
```

- [ ] **Step 2.2: Smoke-test the build compiles cleanly**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds (exits 0). Fix any import/syntax errors before continuing.

- [ ] **Step 2.3: Commit**

```bash
git add src/app/api/admin/generate-image/route.js
git commit -m "feat: add /api/admin/generate-image route (GET quota / POST FLUX)

Edge runtime. Quota tracked in KV (ai-image-quota-YYYY-MM-DD, 30h TTL).
Fails open on KV error. Parallel FLUX calls; partial success allowed.
Size resolved from named presets (square/landscape/portrait/a6-150dpi)."
```

---

### Task 3: Update `/api/chat` for image-prompt intent

**Files:**
- Modify: `src/app/api/chat/route.js`

The intent check must happen **before** the `if (!message) return 400` guard (line 99), because `intent: "image-prompt"` requests have no `message` field.

Also add import for `chatWithContext` (already imported) and handle the natural-language image keywords (Path B) inside the existing message flow.

- [ ] **Step 3.1: Insert image intent handling before the 400 guard**

In `src/app/api/chat/route.js`, replace lines 96–105:

```js
// BEFORE (lines 96-105):
    const body = await request.json();
    const message = (body?.message || "").trim();
    const force = body?.rebuild === true;
    if (!message) return NextResponse.json({ ok: false, error: "Message required" }, { status: 400 });

    const admin = force ? requireAdmin(request) : null;
    if (admin?.error) return admin.error;

    // Lightweight intent routing for admin-only helpers
    const lower = message.toLowerCase();
    const origin = new URL(request.url).origin;
```

With:

```js
    const body = await request.json();

    // ── Image-prompt intent (Path A) — must come before the !message guard ──
    if (body?.intent === "image-prompt") {
      const adminAuth = requireAdmin(request);
      if (adminAuth?.error) return adminAuth.error;
      const description = (body?.description || "").trim();
      const imageSystemPrompt =
        `Write a concise, vivid image generation prompt suited for FLUX (max 60 words). ` +
        `Return only the prompt, no explanation, no quotes. Content to base it on: ${description}`;
      const prompt = await chatWithContext(imageSystemPrompt, [
        { role: "user", content: description || "generate a compelling product image" },
      ]);
      return NextResponse.json({ ok: true, type: "image-generation", prompt: prompt.trim() });
    }

    const message = (body?.message || "").trim();
    const force = body?.rebuild === true;
    if (!message) return NextResponse.json({ ok: false, error: "Message required" }, { status: 400 });

    const admin = force ? requireAdmin(request) : null;
    if (admin?.error) return admin.error;

    // Lightweight intent routing for admin-only helpers
    const lower = message.toLowerCase();
    const origin = new URL(request.url).origin;
```

- [ ] **Step 3.2: Add Path B — natural language image keywords**

After the existing payments block (around line 175), before `const index = await buildIndex(force);`, insert:

```js
    // ── Image-generation (Path B) — natural language ──
    const imageKeywords = ["generate image", "create image", "make image", "skapa bild", "genera imagen"];
    if (imageKeywords.some((kw) => lower.includes(kw))) {
      const adminAuth = requireAdmin(request);
      if (adminAuth?.error) return adminAuth.error;
      const imageSystemPrompt =
        `Write a concise, vivid image generation prompt suited for FLUX (max 60 words). ` +
        `Return only the prompt, no explanation, no quotes. Content to base it on: ${message}`;
      const prompt = await chatWithContext(imageSystemPrompt, [
        { role: "user", content: message },
      ]);
      return NextResponse.json({ ok: true, type: "image-generation", prompt: prompt.trim() });
    }
```

- [ ] **Step 3.3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: exits 0.

- [ ] **Step 3.4: Commit**

```bash
git add src/app/api/chat/route.js
git commit -m "feat: add image-prompt intent to /api/chat

Path A: explicit { intent: 'image-prompt', description } — checked before
400 guard since no message field is present.
Path B: natural language keywords (EN/SV/ES) in regular message flow.
Both return { ok: true, type: 'image-generation', prompt }."
```

---

## Chunk 2: Frontend

### Task 4: i18n strings

**Files:**
- Modify: `src/lib/i18n/en.json`, `sv.json`, `es.json`

> **Pre-condition:** `en.json`, `sv.json`, and `es.json` each had a missing comma after `"languageHint"` (invalid JSON) and two duplicate `"stats"` top-level keys (silently discarded by parsers). These were fixed before Task 4 began — all three files are now valid JSON with a single `"stats"` block. The new image generation keys are already added to all three files as part of that fix. **Task 4 steps are already complete — skip to Task 5.**

- [ ] **Step 4.1: Verify i18n is valid and keys are present**

```bash
node -e "
  ['en','sv','es'].forEach(l => {
    const d = JSON.parse(require('fs').readFileSync('src/lib/i18n/' + l + '.json', 'utf8'));
    console.log(l + ' generateImages:', d.admin.generateImages);
  });
"
```

Expected: prints the translated string for each locale. If missing, re-check the file.

- [ ] **Step 4.2 (original): Add strings to `en.json`** *(already done — kept for reference)*

In `src/lib/i18n/en.json`, add inside the `"admin"` object (after the last key in that object, before the closing `}`):

```json
    "generateImages": "✨ Generate images",
    "aiImagesTitle": "AI Images",
    "imagePromptPlaceholder": "Describe the image (or wait for AI to generate a prompt)...",
    "regeneratePrompt": "↺ Regenerate prompt",
    "imageCount": "Images:",
    "imageSize": "Size:",
    "generateButton": "✨ Generate",
    "saveImage": "Save",
    "downloadImage": "↓ Download",
    "quotaStatus": "{used} of {limit} used today — resets in {time}",
    "quotaWarning": "Only {n} image(s) remaining today",
    "quotaExhausted": "Daily limit reached. Resets at {time} UTC.",
    "imageSizeSquare": "Square — Instagram, product (512×512)",
    "imageSizeLandscape": "Landscape banner — Facebook, header (896×512)",
    "imageSizePortrait": "Portrait — Story, Pinterest (512×768)",
    "imageSizeA6": "A6 card — print proof 150 dpi (624×880)",
    "imageSizeNeuronTip": "Larger presets consume more Cloudflare AI neurons",
    "imagePartialFail": "{n} of {m} images generated",
    "imageSaveFailed": "Could not save image — try again or download instead",
    "imageGenFailed": "Image generation failed"
```

- [ ] **Step 4.2: Add strings to `sv.json`**

In `src/lib/i18n/sv.json`, add the same keys translated:

```json
    "generateImages": "✨ Generera bilder",
    "aiImagesTitle": "AI-bilder",
    "imagePromptPlaceholder": "Beskriv bilden (eller vänta på att AI genererar en prompt)...",
    "regeneratePrompt": "↺ Generera ny prompt",
    "imageCount": "Bilder:",
    "imageSize": "Storlek:",
    "generateButton": "✨ Generera",
    "saveImage": "Spara",
    "downloadImage": "↓ Ladda ner",
    "quotaStatus": "{used} av {limit} använda idag — återställs om {time}",
    "quotaWarning": "Bara {n} bild(er) kvar idag",
    "quotaExhausted": "Daglig gräns nådd. Återställs {time} UTC.",
    "imageSizeSquare": "Kvadrat — Instagram, produkt (512×512)",
    "imageSizeLandscape": "Liggande banner — Facebook, rubrik (896×512)",
    "imageSizePortrait": "Stående — Story, Pinterest (512×768)",
    "imageSizeA6": "A6-kort — trycksäker 150 dpi (624×880)",
    "imageSizeNeuronTip": "Större format förbrukar fler Cloudflare AI-neuroner",
    "imagePartialFail": "{n} av {m} bilder genererade",
    "imageSaveFailed": "Kunde inte spara bilden — försök igen eller ladda ner",
    "imageGenFailed": "Bildgenerering misslyckades"
```

- [ ] **Step 4.3: Add strings to `es.json`**

In `src/lib/i18n/es.json`, add:

```json
    "generateImages": "✨ Generar imágenes",
    "aiImagesTitle": "Imágenes IA",
    "imagePromptPlaceholder": "Describe la imagen (o espera a que la IA genere un prompt)...",
    "regeneratePrompt": "↺ Regenerar prompt",
    "imageCount": "Imágenes:",
    "imageSize": "Tamaño:",
    "generateButton": "✨ Generar",
    "saveImage": "Guardar",
    "downloadImage": "↓ Descargar",
    "quotaStatus": "{used} de {limit} usadas hoy — se reinicia en {time}",
    "quotaWarning": "Solo quedan {n} imagen(es) hoy",
    "quotaExhausted": "Límite diario alcanzado. Se reinicia a las {time} UTC.",
    "imageSizeSquare": "Cuadrado — Instagram, producto (512×512)",
    "imageSizeLandscape": "Banner horizontal — Facebook, encabezado (896×512)",
    "imageSizePortrait": "Vertical — Story, Pinterest (512×768)",
    "imageSizeA6": "Tarjeta A6 — prueba de impresión 150 ppp (624×880)",
    "imageSizeNeuronTip": "Los formatos más grandes consumen más neuronas de Cloudflare AI",
    "imagePartialFail": "{n} de {m} imágenes generadas",
    "imageSaveFailed": "No se pudo guardar la imagen — inténtalo de nuevo o descárgala",
    "imageGenFailed": "Error al generar la imagen"
```

- [ ] **Step 4.4: Check i18n key is available**

> The `t()` function in this project is at `src/lib/i18n/index.js`. Confirm it supports `{placeholders}` by checking an existing usage like `t("health.backendLabel", { backend })`. If it uses a different interpolation style, update the placeholder syntax above to match.

```bash
grep -n "function t\|replace\|interpolat" /home/xyzzy/xtas-cf-stripe-course-grahql-wordpress/src/lib/i18n/index.js | head -10
```

- [ ] **Step 4.5: Commit i18n**

```bash
git add src/lib/i18n/en.json src/lib/i18n/sv.json src/lib/i18n/es.json
git commit -m "feat: add AI image generation i18n strings (EN/SV/ES)"
```

---

### Task 5: `ImageGenerationPanel` component

**Files:**
- Create: `src/components/admin/ImageGenerationPanel.js`

This is a self-contained React component. It has no dependencies on `AdminDashboard` state — everything it needs comes through props.

- [ ] **Step 5.1: Create the component**

Create `src/components/admin/ImageGenerationPanel.js`:

```js
"use client";

import { useState, useEffect, useCallback } from "react";
import { t } from "@/lib/i18n";

const SIZE_PRESETS = [
  { key: "square",     label: () => t("admin.imageSizeSquare") },
  { key: "landscape",  label: () => t("admin.imageSizeLandscape") },
  { key: "portrait",   label: () => t("admin.imageSizePortrait") },
  { key: "a6-150dpi",  label: () => t("admin.imageSizeA6") },
];

function formatTimeUntil(isoString) {
  const diff = Math.max(0, new Date(isoString) - Date.now());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ImageGenerationPanel({
  description = "",
  initialPrompt,
  onSave,
  context = "editor",
  uploadBackend = "wordpress",
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [promptLoading, setPromptLoading] = useState(false);
  const [count, setCount] = useState(2);
  const [size, setSize] = useState("square");
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState([]);
  const [quota, setQuota] = useState(null);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Fetch quota on mount
  useEffect(() => {
    fetch("/api/admin/generate-image")
      .then((r) => r.json())
      .then((j) => { if (j?.ok) setQuota(j.quota); })
      .catch(() => {});
  }, []);

  // Auto-generate prompt from description on mount (editor context, no initialPrompt)
  const generatePrompt = useCallback(async () => {
    if (!description) return;
    setPromptLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "image-prompt", description }),
      });
      const json = await res.json();
      if (json?.ok && json?.prompt) setPrompt(json.prompt);
    } catch {
      // leave prompt empty — user types manually
    } finally {
      setPromptLoading(false);
    }
  }, [description]);

  useEffect(() => {
    if (!initialPrompt && description) generatePrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setImages([]);
    try {
      const res = await fetch("/api/admin/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), count, size }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 429) {
          if (json?.quota) setQuota(json.quota);
          const resetTime = json.quota?.resetsAt ? new Date(json.quota.resetsAt).toUTCString().slice(17, 22) : "?";
          showToast(t("admin.quotaExhausted", { time: resetTime }));
        } else {
          showToast(json?.error || t("admin.imageGenFailed"));
        }
        return;
      }
      if (json.quota) setQuota(json.quota);
      setImages(json.images || []);
      if (json.images?.length < count) {
        showToast(t("admin.imagePartialFail", { n: json.images.length, m: count }), "info");
      }
    } catch (err) {
      showToast(err.message || t("admin.imageGenFailed"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(dataUrl, idx) {
    if (!onSave) return;
    setSaving(idx);
    try {
      const blob = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext("2d").drawImage(img, 0, 0);
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/png",
          );
        };
        img.onerror = reject;
        img.src = dataUrl;
      });
      const form = new FormData();
      form.append("file", new File([blob], "ragbaz-ai-image.png", { type: "image/png" }));
      const res = await fetch(`/api/admin/upload?backend=${encodeURIComponent(uploadBackend)}`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Upload failed");
      onSave(json.url);
    } catch (err) {
      showToast(err.message || t("admin.imageSaveFailed"));
    } finally {
      setSaving(null);
    }
  }

  function handleDownload(dataUrl, idx) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ragbaz-ai-image-${idx + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const remaining = quota ? Math.max(0, quota.remaining) : null;
  const quotaExhausted = remaining === 0;

  return (
    <div className={`border rounded p-4 space-y-3 bg-purple-50 ${context === "chat" ? "text-sm" : ""}`}>
      {/* Header */}
      <div className="text-sm font-semibold text-purple-800">{t("admin.aiImagesTitle")}</div>

      {/* Quota bar */}
      {quota && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="flex gap-0.5">
              {Array.from({ length: quota.limit }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-sm ${i < quota.used ? "bg-purple-500" : "bg-gray-200"}`}
                />
              ))}
            </div>
            <span>
              {t("admin.quotaStatus", { used: quota.used, limit: quota.limit, time: formatTimeUntil(quota.resetsAt) })}
            </span>
          </div>
          {remaining !== null && remaining <= 2 && remaining > 0 && (
            <p className="text-xs text-amber-700">{t("admin.quotaWarning", { n: remaining })}</p>
          )}
          {quotaExhausted && (
            <p className="text-xs text-red-700">
              {t("admin.quotaExhausted", { time: new Date(quota.resetsAt).toUTCString().slice(17, 22) })}
            </p>
          )}
        </div>
      )}

      {/* Prompt textarea + regenerate */}
      <div className="flex gap-2 items-start">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={promptLoading ? t("admin.regeneratePrompt") + "..." : t("admin.imagePromptPlaceholder")}
          disabled={promptLoading}
          className="flex-1 border rounded px-3 py-2 text-sm resize-none"
        />
        {context === "editor" && (
          <button
            type="button"
            onClick={generatePrompt}
            disabled={promptLoading || !description}
            title={!description ? "No description available" : undefined}
            className="px-2 py-1 rounded border text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
          >
            {promptLoading ? "…" : t("admin.regeneratePrompt")}
          </button>
        )}
      </div>

      {/* Controls: count + size + generate */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">{t("admin.imageCount")}</span>
          <div className="flex gap-1">
            {[2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={`px-3 py-1 rounded border text-sm ${
                  count === n ? "bg-purple-600 text-white border-purple-600" : "hover:bg-gray-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500" title={t("admin.imageSizeNeuronTip")}>
            {t("admin.imageSize")} ⓘ
          </span>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            {SIZE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.label()}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || quotaExhausted || !prompt.trim()}
          className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 text-sm ml-auto"
        >
          {generating ? "…" : t("admin.generateButton")}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`text-xs px-3 py-2 rounded ${toast.type === "info" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
          {toast.msg}
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <img
                src={img}
                alt={`Generated ${idx + 1}`}
                className="rounded border object-cover"
                style={{ width: 160, height: 160 }}
              />
              <div className="flex gap-1">
                {onSave && (
                  <button
                    type="button"
                    onClick={() => handleSave(img, idx)}
                    disabled={saving !== null}
                    className="flex-1 px-2 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    {saving === idx ? "…" : t("admin.saveImage")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDownload(img, idx)}
                  className="flex-1 px-2 py-1 rounded border text-xs hover:bg-gray-50"
                >
                  {t("admin.downloadImage")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: exits 0. Fix any import errors.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/admin/ImageGenerationPanel.js
git commit -m "feat: add ImageGenerationPanel React component

Handles prompt generation, size selection (4 presets), quota display,
parallel FLUX generation, per-image save and download. Works in both
editor (collapsible, save enabled) and chat (card, download-only) contexts."
```

---

### Task 6: Wire `ImageGenerationPanel` into `AdminDashboard.js`

**Files:**
- Modify: `src/components/admin/AdminDashboard.js`

Three changes: (A) update `sendChat` to handle `type: "image-generation"` responses, (B) update the chat renderer to mount the panel for those messages, (C) add `showImageGen` toggle + panel below the description textarea in the shop product editor.

- [ ] **Step 6.1: Add import at the top of `AdminDashboard.js`**

Find the existing imports near the top (around lines 1–30) and add:

```js
import ImageGenerationPanel from "./ImageGenerationPanel";
```

- [ ] **Step 6.2: Update `sendChat` to handle image-generation responses**

Replace the `setChatMessages` line on success inside `sendChat` (around line 686):

```js
// BEFORE:
      setChatMessages((prev) => [...prev, { role: "assistant", content: json.answer, sources: json.sources || [] }]);

// AFTER:
      if (json.type === "image-generation") {
        setChatMessages((prev) => [...prev, { role: "assistant", type: "image-generation", prompt: json.prompt }]);
      } else {
        setChatMessages((prev) => [...prev, { role: "assistant", content: json.answer, sources: json.sources || [] }]);
      }
```

- [ ] **Step 6.3: Update chat message renderer to mount panel for image messages**

In the chat tab JSX (around line 2876–2897), the messages are rendered with `{m.content}`. Wrap the inner content with a branch:

```js
// BEFORE (approx lines 2877-2897):
              chatMessages.map((m, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{m.role === "user" ? "You" : "AI"}</div>
                  <div className="whitespace-pre-wrap text-sm text-gray-900">{m.content}</div>
                  {m.table && (
                  ...
                  )}
                </div>
              ))

// AFTER: replace the inner div for assistant messages:
              chatMessages.map((m, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{m.role === "user" ? "You" : "AI"}</div>
                  {m.type === "image-generation" ? (
                    <ImageGenerationPanel
                      key={`img-${idx}`}
                      initialPrompt={m.prompt}
                      description=""
                      onSave={null}
                      context="chat"
                      uploadBackend={uploadBackend}
                    />
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap text-sm text-gray-900">{m.content}</div>
                      {m.table && (
                        <div className="text-[11px] text-gray-600 bg-gray-50 border rounded px-2 py-1 whitespace-pre-wrap font-mono">
                          {m.table}
                        </div>
                      )}
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
              ))
```

- [ ] **Step 6.4: Add `showImageGen` state near other boolean states**

Find the block of `useState` declarations (around line 349–365). Add:

```js
const [showImageGen, setShowImageGen] = useState(false);
```

- [ ] **Step 6.5: Add toggle button + panel after the description textarea in the shop product editor**

In the shop product edit section (around line 2088–2092, just after the description `<textarea>`), add:

```jsx
              <div>
                <button
                  type="button"
                  onClick={() => setShowImageGen((v) => !v)}
                  className="text-xs px-3 py-1 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                  {t("admin.generateImages")}
                </button>
                {showImageGen && (
                  <div className="mt-2">
                    <ImageGenerationPanel
                      description={selectedShopProduct.description || selectedShopProduct.name || ""}
                      onSave={(url) => updateProduct(shopIndex, "imageUrl", url)}
                      context="editor"
                      uploadBackend={uploadBackend}
                    />
                  </div>
                )}
              </div>
```

- [ ] **Step 6.6: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: exits 0. Fix any JSX/import errors before committing.

- [ ] **Step 6.7: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6.8: Commit**

```bash
git add src/components/admin/AdminDashboard.js
git commit -m "feat: wire ImageGenerationPanel into AdminDashboard

- sendChat branches on type='image-generation' response
- Chat renderer mounts panel for image messages (download-only)
- Shop product editor: toggle button + panel after description field
  (onSave writes to imageUrl via updateProduct)"
```

---

### Task 7: Push and verify deploy

- [ ] **Step 7.1: Push to trigger auto-deploy**

```bash
git push
```

- [ ] **Step 7.2: Smoke-test in browser**

1. Open admin → Shop / Products tab → select a product with a description
2. Click "✨ Generate images" below the description
3. Verify prompt auto-generates from the description, size selector shows 4 presets
4. Generate 2 images — verify quota bar updates, images appear with Save/Download buttons
5. Click Download — verify PNG downloads
6. If storage is configured, click Save — verify `imageUrl` field updates in the form
7. Open admin → Chat tab
8. Type "generate image for a meditation course" — verify panel appears in the chat with Download button
9. Verify quota bar in both contexts shows consistent counts

- [ ] **Step 7.3: Update worklog**

Append to `claude+codex-coop.md`:

```
- AI image generation implemented: new /api/admin/generate-image route (edge, GET quota + POST FLUX), ImageGenerationPanel component with size presets (square/landscape/portrait/A6-150dpi), quota tracked in KV, wired into shop product editor and chat tab. i18n EN/SV/ES.
```

```bash
git add claude+codex-coop.md
git commit -m "chore: log AI image generation implementation in worklog"
git push
```

---

## Environment variables checklist

Before testing, ensure these are set in `.env.local` / Cloudflare dashboard:

| Variable | Purpose | Required for |
|----------|---------|-------------|
| `CF_ACCOUNT_ID` | Cloudflare account — used by `cfEndpoint()` | FLUX image generation |
| `CF_API_TOKEN` | Cloudflare API token (AI Write + KV Write) | Both generation and quota |
| `CLOUDFLARE_ACCOUNT_ID` | Used by `cloudflareKv.js` | KV quota tracking |
| `CF_KV_NAMESPACE_ID` | KV namespace ID | KV quota tracking (quota bypassed if absent) |
| `AI_IMAGE_DAILY_LIMIT` | Integer, default `5` | Optional override |
| `CF_IMAGE_MODEL` | Model override | Optional, defaults to FLUX.1 schnell |
