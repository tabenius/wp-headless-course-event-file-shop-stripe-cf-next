# Digital Download Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make digital download products fully functional — auto-assign assetIds to all R2 items, fix "Create product from asset", add free/paid pricing model, and deliver downloads through `/digital/{slug}` behind the paywall.

**Architecture:** All digital products are asset-backed. The media library auto-assigns assetIds to R2 objects missing them. Products require explicit pricing (free boolean or price > 0) to be listed. A new `/digital/{slug}` route proxies file downloads behind auth + ownership checks. A new `/api/digital/claim` endpoint handles free product access grants.

**Tech Stack:** Next.js (App Router, edge + nodejs runtimes), Cloudflare R2, Cloudflare KV, Stripe, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-03-31-digital-download-products-design.md`

---

### Task 1: Add `free` field to product sanitization and listability check

**Files:**

- Modify: `src/lib/digitalProducts.js:77-156` (sanitizeProduct), add `isProductListable` export
- Test: `tests/digital-products.test.js` (new)

- [ ] **Step 1: Write failing tests for `free` field and listability**

Create `tests/digital-products.test.js`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

// Direct import of the module to test sanitizeProduct indirectly via saveDigitalProducts
// We test the public interface: sanitizeProducts shape and isProductListable

test("sanitizeProduct preserves free: true and forces priceCents to 0", async () => {
  const { sanitizeProductForTest } = await import(
    "../src/lib/digitalProducts.js"
  );
  const result = sanitizeProductForTest({
    name: "Free Asset",
    slug: "free-asset",
    type: "digital_file",
    productMode: "asset",
    assetId: "r2:test.jpg",
    priceCents: 500,
    free: true,
    active: true,
  });
  assert.equal(result.free, true);
  assert.equal(result.priceCents, 0);
});

test("sanitizeProduct defaults free to false", async () => {
  const { sanitizeProductForTest } = await import(
    "../src/lib/digitalProducts.js"
  );
  const result = sanitizeProductForTest({
    name: "Paid Asset",
    slug: "paid-asset",
    type: "digital_file",
    productMode: "asset",
    assetId: "r2:paid.jpg",
    priceCents: 1900,
    active: true,
  });
  assert.equal(result.free, false);
  assert.equal(result.priceCents, 1900);
});

test("isProductListable returns true for free product", async () => {
  const { isProductListable } = await import("../src/lib/digitalProducts.js");
  assert.equal(
    isProductListable({ active: true, free: true, priceCents: 0 }),
    true,
  );
});

test("isProductListable returns true for paid product with price", async () => {
  const { isProductListable } = await import("../src/lib/digitalProducts.js");
  assert.equal(
    isProductListable({ active: true, free: false, priceCents: 1900 }),
    true,
  );
});

test("isProductListable returns false for ambiguous pricing", async () => {
  const { isProductListable } = await import("../src/lib/digitalProducts.js");
  assert.equal(
    isProductListable({ active: true, free: false, priceCents: 0 }),
    false,
  );
});

test("isProductListable returns false for inactive product", async () => {
  const { isProductListable } = await import("../src/lib/digitalProducts.js");
  assert.equal(
    isProductListable({ active: false, free: true, priceCents: 0 }),
    false,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/digital-products.test.js`
Expected: FAIL — `sanitizeProductForTest` and `isProductListable` not exported.

- [ ] **Step 3: Implement `free` field in sanitizeProduct and export helpers**

In `src/lib/digitalProducts.js`, modify `sanitizeProduct` (line 77) to add `free` handling. Add after the `priceCents` calculation (around line 114):

```javascript
const free = product?.free === true;
const effectivePriceCents = free ? 0 : priceCents;
```

In the return object (line 136), replace `priceCents,` with:

```javascript
    priceCents: effectivePriceCents,
    free,
```

Add the `isProductListable` export at the end of the file:

```javascript
export function isProductListable(product) {
  if (!product?.active) return false;
  if (product.free === true) return true;
  return typeof product.priceCents === "number" && product.priceCents > 0;
}
```

Export `sanitizeProductForTest` for testing (only the pure function, no I/O):

```javascript
export function sanitizeProductForTest(product) {
  return sanitizeProduct(product, new Set());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/digital-products.test.js`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/digitalProducts.js tests/digital-products.test.js
git commit -m "feat: add free boolean to product schema and listability check"
```

---

### Task 2: Enforce product type mutual exclusivity

**Files:**

- Modify: `src/lib/digitalProducts.js:77-156` (sanitizeProduct)
- Test: `tests/digital-products.test.js` (append)

- [ ] **Step 1: Write failing tests for mutual exclusivity**

Append to `tests/digital-products.test.js`:

```javascript
test("sanitizeProduct clears courseUri when mode is asset", async () => {
  const { sanitizeProductForTest } = await import(
    "../src/lib/digitalProducts.js"
  );
  const result = sanitizeProductForTest({
    name: "Asset Product",
    slug: "asset-product",
    productMode: "asset",
    assetId: "r2:file.jpg",
    courseUri: "/courses/stale",
    fileUrl: "https://example.com/stale.pdf",
  });
  assert.equal(result.productMode, "asset");
  assert.equal(result.assetId, "r2:file.jpg");
  assert.equal(result.courseUri, "");
  assert.equal(result.fileUrl, "");
});

test("sanitizeProduct clears assetId and fileUrl when mode is manual_uri", async () => {
  const { sanitizeProductForTest } = await import(
    "../src/lib/digitalProducts.js"
  );
  const result = sanitizeProductForTest({
    name: "Course Product",
    slug: "course-product",
    productMode: "manual_uri",
    courseUri: "/courses/test",
    assetId: "r2:stale.jpg",
    fileUrl: "https://example.com/stale.pdf",
  });
  assert.equal(result.productMode, "manual_uri");
  assert.equal(result.courseUri, "/courses/test");
  assert.equal(result.assetId, "");
  assert.equal(result.fileUrl, "");
});

test("sanitizeProduct clears courseUri and assetId when mode is digital_file", async () => {
  const { sanitizeProductForTest } = await import(
    "../src/lib/digitalProducts.js"
  );
  const result = sanitizeProductForTest({
    name: "Direct File",
    slug: "direct-file",
    productMode: "digital_file",
    fileUrl: "https://example.com/file.pdf",
    courseUri: "/courses/stale",
    assetId: "r2:stale.jpg",
  });
  assert.equal(result.productMode, "digital_file");
  assert.equal(result.fileUrl, "https://example.com/file.pdf");
  assert.equal(result.courseUri, "");
  assert.equal(result.assetId, "");
});

test("sanitizeProduct derives type from mode, not from input type field", async () => {
  const { sanitizeProductForTest } = await import(
    "../src/lib/digitalProducts.js"
  );
  const asset = sanitizeProductForTest({
    name: "Asset",
    slug: "asset-type",
    productMode: "asset",
    assetId: "r2:x.jpg",
    type: "course",
  });
  assert.equal(asset.type, "digital_file");

  const course = sanitizeProductForTest({
    name: "Course",
    slug: "course-type",
    productMode: "manual_uri",
    courseUri: "/courses/x",
    type: "digital_file",
  });
  assert.equal(course.type, "course");
});
```

- [ ] **Step 2: Run tests to verify new tests fail (or check existing behavior)**

Run: `node --experimental-test-module-mocks --test tests/digital-products.test.js`
Expected: The `asset` mode test should fail because `fileUrl` is not cleared for asset mode currently. Lines 147-150 of the current code only clear per-mode but `fileUrl` is kept for `asset` mode.

- [ ] **Step 3: Tighten the return object in sanitizeProduct**

In `src/lib/digitalProducts.js`, replace the return object's conditional field lines (around line 147-150) with:

```javascript
    fileUrl: productMode === "digital_file" ? fileUrl : "",
    courseUri: productMode === "manual_uri" ? courseUri : "",
    mimeType: productMode === "digital_file" || productMode === "asset" ? mimeType : "",
    assetId: productMode === "asset" ? assetId : "",
```

This already matches the existing code for `courseUri`, `mimeType`, and `assetId`. The key change is `fileUrl` — currently it allows `fileUrl` to pass through for `asset` mode if present. Replace so that only `digital_file` mode keeps `fileUrl`.

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --experimental-test-module-mocks --test tests/digital-products.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/digitalProducts.js tests/digital-products.test.js
git commit -m "fix: enforce product type mutual exclusivity in sanitizeProduct"
```

---

### Task 3: Auto-assign assetId for R2 items without metadata

**Files:**

- Modify: `src/app/api/admin/media-library/route.js:682-742` (HEAD probe section in fetchBucketMedia)
- Uses: `replaceBucketObjectMetadata` from `src/lib/s3upload.js` (already exists, lines 776-870)

- [ ] **Step 1: Read the existing HEAD probe section**

Verify the code at lines 682-742 of `src/app/api/admin/media-library/route.js`. The key insertion point is after line 713 where `assetId` is read from metadata.

- [ ] **Step 2: Add auto-assign logic after assetId read**

In `src/app/api/admin/media-library/route.js`, after line 713 (`const assetId = sanitizeAssetId(meta.asset_id, 96);`), add auto-assign logic. Replace the block from line 713 to line 721 with:

```javascript
let assetId = sanitizeAssetId(meta.asset_id, 96);
if (!assetId && row.key) {
  // Auto-assign a deterministic assetId for R2 objects uploaded via external clients
  assetId = sanitizeAssetId(`r2:${row.key}`, 96);
  if (assetId) {
    try {
      await replaceBucketObjectMetadata({
        key: row.key,
        metadata: { asset_id: assetId },
        backend,
      });
    } catch {
      // Non-fatal: assetId is still usable this request even if write-back fails
    }
  }
}
const ownerUri = normalizeOwnerUri(meta.asset_owner_uri || "/");
const assetUri = sanitizeText(meta.asset_uri, 400) || buildAssetIdUri(assetId);
```

- [ ] **Step 3: Add import for replaceBucketObjectMetadata**

At the top of `src/app/api/admin/media-library/route.js`, verify `replaceBucketObjectMetadata` is imported from `@/lib/s3upload`. If not already imported, add it to the existing import block:

```javascript
import {
  headBucketObject,
  listBucketObjects,
  replaceBucketObjectMetadata,
  // ... other existing imports
} from "@/lib/s3upload";
```

- [ ] **Step 4: Verify the existing `replaceBucketObjectMetadata` handles the merge correctly**

The function at `src/lib/s3upload.js:776-870` already merges incoming metadata with existing metadata and does a get+put round-trip for R2. Confirm it preserves existing metadata keys — it does via `const replaced = { ...(current.customMetadata || {}) }` on line 801.

- [ ] **Step 5: Test manually by checking ESLint**

Run: `npx eslint src/app/api/admin/media-library/route.js`
Expected: No new errors (warnings from existing baseline are OK).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/media-library/route.js
git commit -m "feat: auto-assign assetId to R2 objects missing metadata"
```

---

### Task 4: Fix "Create product from asset" defaults and error reporting

**Files:**

- Modify: `src/app/api/admin/products/from-asset/route.js:138-175`

- [ ] **Step 1: Update product defaults in from-asset route**

In `src/app/api/admin/products/from-asset/route.js`, replace the `nextProduct` object (lines 138-153) with:

```javascript
const nextProduct = {
  name,
  slug: resolveProductSlug(name, assetId),
  type: "digital_file",
  productMode: "asset",
  description: "",
  imageUrl,
  priceCents: 0,
  free: false,
  currency: "SEK",
  fileUrl,
  mimeType,
  assetId,
  vatPercent: null,
  courseUri: "",
  active: false,
};
```

Changes from current: `free: false` added, `active: false` (was `true`).

- [ ] **Step 2: Add error reporting when sanitization drops the product**

Replace the save + find block (lines 155-168) with:

```javascript
const inputCount = products.length + 1;
const saved = await saveDigitalProducts([...products, nextProduct]);

const created =
  saved.find(
    (entry) =>
      entry?.productMode === "asset" &&
      normalizeAssetId(entry?.assetId || "") === assetId,
  ) || null;

if (!created) {
  return NextResponse.json(
    {
      ok: false,
      error: `Product was rejected during validation. Check that the asset has a valid name and assetId (got: "${assetId}").`,
    },
    { status: 400 },
  );
}

return NextResponse.json({
  ok: true,
  created: true,
  product: created,
  total: saved.length,
});
```

- [ ] **Step 3: Verify with ESLint**

Run: `npx eslint src/app/api/admin/products/from-asset/route.js`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/products/from-asset/route.js
git commit -m "fix: create-from-asset defaults to inactive with explicit error on validation failure"
```

---

### Task 5: Create `/digital/{slug}` download route

**Files:**

- Create: `src/app/digital/[slug]/route.js`

- [ ] **Step 1: Create the download route handler**

Create `src/app/digital/[slug]/route.js`:

```javascript
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasDigitalAccess } from "@/lib/digitalAccessStore";
import {
  getDigitalProductBySlug,
  isProductListable,
} from "@/lib/digitalProducts";

export const runtime = "nodejs";

function getFileName(product) {
  const candidates = [product.name, product.assetId, product.slug, product.id];
  for (const candidate of candidates) {
    const safe = String(candidate || "").trim();
    if (!safe) continue;
    // If it already has an extension, use it
    if (/\.\w{1,8}$/.test(safe)) return safe;
    // Try to derive extension from mimeType
    const ext = mimeToExtension(product.mimeType);
    return ext ? `${safe}${ext}` : safe;
  }
  return `download.bin`;
}

function mimeToExtension(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  const map = {
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "video/mp4": ".mp4",
    "application/json": ".json",
    "text/csv": ".csv",
    "text/markdown": ".md",
  };
  return map[mime] || "";
}

function resolveFileUrl(product) {
  // Asset-mode products: fileUrl may be empty, use the asset's public URL
  if (product.fileUrl) return product.fileUrl;
  if (product.imageUrl && product.productMode === "asset")
    return product.imageUrl;
  return "";
}

export async function GET(request, { params }) {
  const { slug } = await params;
  const product = await getDigitalProductBySlug(slug);

  if (!product || !isProductListable(product)) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (product.type !== "digital_file") {
    return new NextResponse("Not found", { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.email) {
    const loginUrl = `/auth/signin?callbackUrl=${encodeURIComponent(`/digital/${encodeURIComponent(slug)}`)}`;
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }

  const canDownload = await hasDigitalAccess(product.id, session.user.email);
  if (!canDownload) {
    const shopUrl = `/shop/${encodeURIComponent(product.slug || product.id)}`;
    return NextResponse.redirect(new URL(shopUrl, request.url));
  }

  const fileUrl = resolveFileUrl(product);
  if (!fileUrl) {
    return new NextResponse("File not available", { status: 404 });
  }

  try {
    const upstream = await fetch(fileUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return new NextResponse("File not available", { status: 502 });
    }

    const fileName = getFileName(product);
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Digital download proxy failed:", error);
    return new NextResponse("Download failed", { status: 502 });
  }
}
```

- [ ] **Step 2: Verify with ESLint**

Run: `npx eslint src/app/digital/[slug]/route.js`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/digital/[slug]/route.js
git commit -m "feat: add /digital/{slug} download route behind paywall"
```

---

### Task 6: Create `/api/digital/claim` endpoint for free products

**Files:**

- Create: `src/app/api/digital/claim/route.js`

- [ ] **Step 1: Create the claim route**

Create `src/app/api/digital/claim/route.js`:

```javascript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { grantDigitalAccess, hasDigitalAccess } from "@/lib/digitalAccessStore";
import { getDigitalProductBySlug } from "@/lib/digitalProducts";

export const runtime = "edge";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: "Login required." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const productSlug = String(body?.productSlug || "").trim();
  if (!productSlug) {
    return NextResponse.json(
      { ok: false, error: "Missing product slug." },
      { status: 400 },
    );
  }

  const product = await getDigitalProductBySlug(productSlug);
  if (!product || !product.active) {
    return NextResponse.json(
      { ok: false, error: "Product not found." },
      { status: 404 },
    );
  }

  if (product.free !== true) {
    return NextResponse.json(
      { ok: false, error: "This product is not free." },
      { status: 400 },
    );
  }

  const email = session.user.email.toLowerCase();
  const alreadyOwned = await hasDigitalAccess(product.id, email);
  if (alreadyOwned) {
    return NextResponse.json({
      ok: true,
      alreadyOwned: true,
      redirectUrl: `/digital/${encodeURIComponent(product.slug)}`,
    });
  }

  await grantDigitalAccess(product.id, email);

  return NextResponse.json({
    ok: true,
    alreadyOwned: false,
    redirectUrl: `/digital/${encodeURIComponent(product.slug)}`,
  });
}
```

- [ ] **Step 2: Verify with ESLint**

Run: `npx eslint src/app/api/digital/claim/route.js`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/digital/claim/route.js
git commit -m "feat: add /api/digital/claim endpoint for free product access"
```

---

### Task 7: Update AdminProductsTab — free toggle, mode-switch cleanup, pricing warnings

**Files:**

- Modify: `src/components/admin/AdminProductsTab.js:221-305` (PriceAccessForm), `1621-1642` (mode buttons)
- Modify: `src/lib/i18n/en.json`, `src/lib/i18n/sv.json`, `src/lib/i18n/es.json`

- [ ] **Step 1: Add i18n keys for free product UI**

Add to `en.json` admin section (near existing `freeAccess` key):

```json
    "productFree": "Free product",
    "productFreeHint": "This product is free. No payment required.",
    "productPriceAmbiguous": "Set a price or mark as free to list this product.",
    "productCreatedSetPrice": "Set a price or mark as free to list this product in the shop."
```

Add to `sv.json`:

```json
    "productFree": "Gratisprodukt",
    "productFreeHint": "Denna produkt är gratis. Ingen betalning krävs.",
    "productPriceAmbiguous": "Ange ett pris eller markera som gratis för att visa produkten.",
    "productCreatedSetPrice": "Ange ett pris eller markera som gratis för att visa produkten i butiken."
```

Add to `es.json`:

```json
    "productFree": "Producto gratuito",
    "productFreeHint": "Este producto es gratuito. No requiere pago.",
    "productPriceAmbiguous": "Establece un precio o marca como gratuito para mostrar el producto.",
    "productCreatedSetPrice": "Establece un precio o marca como gratuito para mostrar el producto en la tienda."
```

- [ ] **Step 2: Update PriceAccessForm to use `free` boolean from product**

In `src/components/admin/AdminProductsTab.js`, the `PriceAccessForm` component (line 221) already has a "free access" checkbox that checks `parsedPrice === 0`. Replace this with a proper `free` prop.

Add `free` and `setFree` to the props:

```javascript
function PriceAccessForm({
  price,
  setPrice,
  free,
  setFree,
  currency,
  setCurrency,
  // ... rest unchanged
}) {
```

Replace the existing free checkbox block (around lines 265-276) with:

```javascript
<label className="inline-flex items-center gap-2 text-sm text-gray-700">
  <input
    type="checkbox"
    checked={free}
    onChange={(e) => {
      setFree(e.target.checked);
      if (e.target.checked) setPrice("0");
    }}
    className="accent-slate-600"
  />
  <span>{t("admin.productFree")}</span>
</label>;
{
  free && (
    <p className="text-xs text-green-600">{t("admin.productFreeHint")}</p>
  );
}
{
  !free && (Number.parseFloat(String(price || "0")) || 0) === 0 && (
    <p className="text-xs text-amber-600 font-medium">
      {t("admin.productPriceAmbiguous")}
    </p>
  );
}
```

Disable the price input when free:

```javascript
<input
  type="number"
  value={price}
  onChange={(e) => setPrice(e.target.value)}
  min="0"
  step="0.01"
  placeholder="0.00"
  disabled={free}
  className={`flex-1 border rounded px-3 py-2 text-sm ${
    free ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""
  }`}
/>
```

- [ ] **Step 3: Wire `free` state through the product editing flow**

Find where `PriceAccessForm` is rendered (search for `<PriceAccessForm`) and ensure `free` and `setFree` are passed. The product state should read `product.free` and `updateProduct(shopIndex, "free", value)` should be used for setFree.

- [ ] **Step 4: Clear stale fields on mode switch**

Replace the mode-switch buttons (lines 1621-1642) to clear conflicting fields when switching:

```javascript
                          <button
                            type="button"
                            onClick={() => {
                              updateProduct(shopIndex, "productMode", "asset");
                              updateProduct(shopIndex, "courseUri", "");
                              updateProduct(shopIndex, "fileUrl", "");
                            }}
                            className={`rounded-full border px-2.5 py-1 text-[11px] ${
                              selectedShopMode === "asset"
                                ? "admin-pill-active"
                                : "admin-pill-subtle"
                            }`}
                          >
                            {t("admin.productSourceAsset", "Asset")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateProduct(shopIndex, "productMode", "digital_file");
                              updateProduct(shopIndex, "courseUri", "");
                              updateProduct(shopIndex, "assetId", "");
                            }}
                            className={`rounded-full border px-2.5 py-1 text-[11px] ${
                              selectedShopMode === "digital_file"
                                ? "admin-pill-active"
                                : "admin-pill-subtle"
                            }`}
                          >
                            {t("admin.productSourceDirectUrl", "Direct URL")}
                          </button>
```

- [ ] **Step 5: Add ambiguous pricing badge to product list**

In the product list rendering section, find where each product card is rendered and add a warning badge for ambiguous products. After the product name display, add:

```javascript
{
  !product.free && product.priceCents === 0 && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
      {t("admin.productPriceAmbiguous")}
    </span>
  );
}
```

- [ ] **Step 6: Verify with ESLint**

Run: `npx eslint src/components/admin/AdminProductsTab.js`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/AdminProductsTab.js src/lib/i18n/en.json src/lib/i18n/sv.json src/lib/i18n/es.json
git commit -m "feat: free product toggle, pricing warnings, and mode-switch cleanup in admin"
```

---

### Task 8: Update ShopProductDetail for free vs paid display

**Files:**

- Modify: `src/components/shop/ShopProductDetail.js:80-111` (startCheckout), `209-220` (button)
- Modify: `src/lib/i18n/en.json`, `src/lib/i18n/sv.json`, `src/lib/i18n/es.json`

- [ ] **Step 1: Add i18n keys for shop free product display**

Add to `en.json` shop section:

```json
    "freeProduct": "Free",
    "claimFree": "Get for free",
    "claimingFree": "Getting access…",
    "downloadProduct": "Download"
```

Add to `sv.json`:

```json
    "freeProduct": "Gratis",
    "claimFree": "Hämta gratis",
    "claimingFree": "Hämtar åtkomst…",
    "downloadProduct": "Ladda ner"
```

Add to `es.json`:

```json
    "freeProduct": "Gratis",
    "claimFree": "Obtener gratis",
    "claimingFree": "Obteniendo acceso…",
    "downloadProduct": "Descargar"
```

- [ ] **Step 2: Add free claim handler in ShopProductDetail**

In `src/components/shop/ShopProductDetail.js`, add a `claimFreeProduct` function near `startCheckout`:

```javascript
async function claimFreeProduct() {
  setLoading(true);
  setError("");
  try {
    const response = await fetch("/api/digital/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productSlug: product.slug }),
    });
    const json = await response.json();
    if (response.ok && json?.ok) {
      window.location.href =
        json.redirectUrl || `/digital/${encodeURIComponent(product.slug)}`;
    } else {
      setError(json?.error || t("shop.checkoutFailed"));
    }
  } catch (err) {
    setError(t("shop.checkoutFailed"));
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 3: Update button rendering for free vs paid**

Replace the existing buy button block (lines 209-220) with:

```javascript
{
  product.free ? (
    <button
      type="button"
      onClick={claimFreeProduct}
      disabled={loading}
      className="px-5 py-3 rounded bg-gray-800 text-white shop-cta hover:bg-gray-700 disabled:opacity-50 inline-flex items-center gap-2"
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {loading ? t("shop.claimingFree") : t("shop.claimFree")}
    </button>
  ) : (
    <button
      type="button"
      onClick={startCheckout}
      disabled={loading}
      className="px-5 py-3 rounded bg-gray-800 text-white shop-cta hover:bg-gray-700 disabled:opacity-50 inline-flex items-center gap-2"
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {loading ? t("shop.sendingToStripe") : t("shop.buyProduct")}
    </button>
  );
}
```

- [ ] **Step 4: Update price display for free products**

Find the price display section and add a free label:

```javascript
{
  product.free ? (
    <span className="text-lg font-bold text-green-700">
      {t("shop.freeProduct")}
    </span>
  ) : (
    <span className="text-lg font-bold">
      {(product.priceCents / 100).toFixed(2)} {product.currency}
    </span>
  );
}
```

- [ ] **Step 5: Verify with ESLint**

Run: `npx eslint src/components/shop/ShopProductDetail.js`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/shop/ShopProductDetail.js src/lib/i18n/en.json src/lib/i18n/sv.json src/lib/i18n/es.json
git commit -m "feat: free product claim flow in shop product page"
```

---

### Task 9: Update inventory page and webhook email links to use `/digital/{slug}`

**Files:**

- Modify: `src/app/inventory/page.js:50-86` (buildDigitalOwnedItem)
- Modify: `src/app/api/stripe/webhook/route.js:163-175` (email productUrl)

- [ ] **Step 1: Update inventory download links**

In `src/app/inventory/page.js`, replace the `buildDigitalOwnedItem` function (lines 43-96). Change the asset mode block (lines 56-64) to use `/digital/{slug}`:

```javascript
if (mode === "asset") {
  return {
    key: `digital:${product.id}`,
    name: product.name || product.id,
    description: product.description || "",
    label: digitalTypeLabel(product),
    href: `/digital/${encodeURIComponent(product.slug || product.id)}`,
    action: "Download",
    isDownload: false,
  };
}
```

And change the digital_file block (lines 76-86) similarly:

```javascript
if (product.type === "digital_file") {
  return {
    key: `digital:${product.id}`,
    name: product.name || product.id,
    description: product.description || "",
    label: digitalTypeLabel(product),
    href: `/digital/${encodeURIComponent(product.slug || product.id)}`,
    action: "Download",
    isDownload: false,
  };
}
```

Note: `isDownload: false` because `/digital/{slug}` handles the redirect/auth flow itself (not a raw file link).

- [ ] **Step 2: Update webhook email links**

In `src/app/api/stripe/webhook/route.js`, find the `productUrl` resolution (around lines 163-175). Replace:

```javascript
let productUrl = origin;
if (courseUri) {
  productUrl = `${origin}${courseUri}`;
} else if (assetId) {
  productUrl = `${origin}/inventory/${encodeURIComponent(assetId)}`;
} else if (digitalProductId) {
  productUrl = `${origin}/shop`;
}
```

With:

```javascript
let productUrl = origin;
if (courseUri) {
  productUrl = `${origin}${courseUri}`;
} else if (digitalProductId) {
  // Use slug-based digital download URL; fall back to inventory
  const slug = session?.metadata?.product_slug || digitalProductId;
  productUrl = `${origin}/digital/${encodeURIComponent(slug)}`;
}
```

- [ ] **Step 3: Pass product slug in Stripe checkout metadata**

In `src/app/api/digital/checkout/route.js`, find where the Stripe session metadata is built and add `product_slug`:

```javascript
metadata: {
  // ... existing fields
  product_slug: product.slug,
}
```

- [ ] **Step 4: Verify with ESLint**

Run: `npx eslint src/app/inventory/page.js src/app/api/stripe/webhook/route.js`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/inventory/page.js src/app/api/stripe/webhook/route.js src/app/api/digital/checkout/route.js
git commit -m "feat: use /digital/{slug} links in inventory and purchase emails"
```

---

### Task 10: Deploy, verify, and update coop log

**Files:**

- Modify: `claude+codex-coop.md`

- [ ] **Step 1: Run full lint check**

Run: `npx eslint src/lib/digitalProducts.js src/app/api/admin/media-library/route.js src/app/api/admin/products/from-asset/route.js src/app/digital/[slug]/route.js src/app/api/digital/claim/route.js src/components/admin/AdminProductsTab.js src/components/shop/ShopProductDetail.js src/app/inventory/page.js`
Expected: No new errors.

- [ ] **Step 2: Run tests**

Run: `node --experimental-test-module-mocks --test tests/digital-products.test.js`
Expected: All tests PASS.

- [ ] **Step 3: Run existing test suite**

Run: `npm test`
Expected: All existing tests still pass.

- [ ] **Step 4: Deploy**

Run: `npm run cf:deploy`
Expected: Successful deployment.

- [ ] **Step 5: Update coop log**

Prepend to `claude+codex-coop.md`:

```markdown
## 2026-03-31 (Claude) — digital download products: free/paid model, /digital/{slug} delivery, R2 auto-assetId

- Auto-assigns deterministic assetIds to R2 objects missing `asset_id` metadata during media library listing (write-back via `replaceBucketObjectMetadata`).
- Fixed "Create product from asset" flow: new products default to `active: false` until pricing is set; explicit error messages on validation failure.
- Added `free` boolean to product schema: `free: true` forces `priceCents: 0`, skips Stripe; `free: false` with `priceCents: 0` is ambiguous and hidden from shop.
- Added `isProductListable()` — products need `active: true` AND either `free: true` or `priceCents > 0`.
- Enforced product type mutual exclusivity: mode switch clears stale fields in both `sanitizeProduct` and admin UI.
- New route `/digital/{slug}`: auth + ownership check → proxy file download → redirect to shop if not owned.
- New endpoint `POST /api/digital/claim`: grants access to free products without Stripe.
- Updated `ShopProductDetail` for free vs paid display (claim button vs Stripe checkout).
- Updated inventory page and purchase confirmation emails to use `/digital/{slug}` links.
- Added i18n keys for EN/SV/ES: free product labels, pricing warnings, claim flow copy.
- Validation: ESLint pass, unit tests for sanitizeProduct + isProductListable, full test suite.
```

- [ ] **Step 6: Commit coop log and push**

```bash
git add claude+codex-coop.md
git commit -m "coop: log digital download products feature"
git push
```
