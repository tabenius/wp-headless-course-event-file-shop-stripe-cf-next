# Digital Download Products Design

**Date:** 2026-03-31
**Status:** Approved

## Goal

Make digital download products fully functional: any asset in the media library can become a purchasable (or free) product, delivered through a clean `/digital/{slug}` URL behind the paywall. Fix the broken "Create product from asset" flow and ensure all R2 items have assetIds.

## Principles

- All digital products are asset-backed. There is no "direct URL without asset" product mode going forward.
- A product is exactly one type: asset-backed digital file OR course. Never both.
- Products must have unambiguous pricing (explicit price or explicitly free) to appear in the shop.

---

## Section 1: Auto-assign assetId for R2 items

**Problem:** R2 items uploaded via external S3 clients (Cyberduck, WinSCP) have no `asset_id` in their object metadata, so they appear in the media library with `assetId: null`.

**Solution:** During the media library GET route's HEAD probe phase, when an R2 object has no `asset_id` metadata:

1. Generate a deterministic assetId from the object key: normalize `r2:{key}` (e.g. `r2:sofiacerne/photo.jpg` becomes `r2:sofiacerne.photo.jpg` after the existing `sanitizeAssetId` rules).
2. Write the assetId back to the R2 object metadata via a PUT copy-object (same key, updated custom metadata, preserve existing metadata).
3. Return the item with the new assetId in the response — no second fetch needed.

**Concurrency:** Two concurrent requests discovering the same unregistered object both generate the same deterministic assetId (based on key), so the second write is a harmless idempotent overwrite.

**Scope:** Only `src/app/api/admin/media-library/route.js` changes (the `fetchBucketMedia` / HEAD probe section). The upload route and register route already handle assetIds correctly.

---

## Section 2: Fix "Create product from asset" flow

**Problem:** The "Create product" button in the media library sends `item.asset?.assetId` which is null for R2 items without metadata. Additionally, `sanitizeProduct` can silently drop newly created products without reporting why.

**Fixes:**

1. **Root cause eliminated by Section 1** — all items will have assetIds after first listing.
2. **Better error reporting:** If `saveDigitalProducts` produces fewer items than expected after sanitization, the `from-asset` route returns the specific validation reason instead of a generic error.
3. **New product defaults changed:**
   - `priceCents: 0` (unchanged)
   - `free: false` (new field, see Section 3)
   - `active: false` (changed from `true`) — product is hidden until pricing is resolved
4. **After creation:** Redirect to Products tab as today. Product shows a warning badge: "Set a price or mark as free to list this product."

**Files:** `src/app/api/admin/products/from-asset/route.js`, `src/lib/digitalProducts.js`

---

## Section 3: Free product boolean and pricing validation

**New field:** `free: boolean` on the product schema (default `false`).

### Price resolution

1. **Local override** (admin sets price in Products tab) — highest priority
2. **WooCommerce price** (synced from WC if product is linked) — fallback
3. **Unset** — product hidden from shop until resolved

### Pricing states

| `free`  | `priceCents` | Result                                             |
| ------- | ------------ | -------------------------------------------------- |
| `true`  | forced to 0  | Listable as free product                           |
| `false` | > 0          | Listable with Stripe checkout                      |
| `false` | 0            | **Ambiguous** — hidden from shop, warning in admin |

### Sanitization rules

- `free: true` → `priceCents` forced to `0`
- `free` persisted as boolean in `sanitizeProduct`

### Products tab UI

- "Free product" toggle (checkbox/switch) next to the price field
- When on: disable price input, show "This product is free"
- When off and `priceCents === 0`: yellow warning "Set a price or mark as free"
- Ambiguous products get a yellow badge in the product list

### Checkout behavior

- `free: true` → skip Stripe, grant access directly, redirect to download/inventory
- `free: false, priceCents > 0` → existing Stripe checkout flow

**Files:** `src/lib/digitalProducts.js`, `src/components/admin/AdminProductsTab.js`, `src/components/shop/ShopProductDetail.js`

---

## Section 4: `/digital/{slug}` download route

**New route handler:** `src/app/digital/[slug]/route.js`

### Flow

1. Look up product by slug via `getDigitalProductBySlug(slug)`
2. If not found, not active, or not listable (ambiguous pricing) → 404
3. If not logged in → redirect to login with return URL (`/digital/{slug}`)
4. Check ownership via `hasDigitalAccess(product.id, email)`
5. If not owned → redirect to `/shop/{slug}` (purchase page)
6. If owned → proxy the file from the asset's URL (reuse logic from `/api/digital/download`)
7. Set `Content-Disposition: attachment` with a clean filename derived from the asset key/title

### Existing routes preserved

- `/api/digital/download` stays as the API-level proxy (used internally)
- `/inventory` stays as the full list of all purchased products (courses + digital files + assets)

### Link updates

- Inventory page links to `/digital/{slug}` for digital file products
- Purchase confirmation emails use `/digital/{slug}`
- Webhook fulfillment emails use `/digital/{slug}`

**Files:** `src/app/digital/[slug]/route.js` (new), `src/app/inventory/page.js`, `src/app/api/stripe/webhook/route.js`

---

## Section 5: Free product claim flow

**New API route:** `POST /api/digital/claim`

### Flow

1. Require authenticated user
2. Accept `{ productSlug }` in POST body
3. Look up product — verify exists, active, and `free: true`
4. Call `grantDigitalAccess(product.id, email)` directly — no Stripe
5. Return `{ ok: true, redirectUrl: "/digital/{slug}" }`

### Shop page changes

- `free: true` → show "Free" price label + "Download" / "Get access" button
- `free: false` → existing Stripe checkout button with price display

**Files:** `src/app/api/digital/claim/route.js` (new), `src/components/shop/ShopProductDetail.js`

---

## Section 6: Product type mutual exclusivity

**Enforce in `sanitizeProduct`:** A product mode is exactly one of three values, and irrelevant fields are cleared:

| Mode           | Required    | Cleared                |
| -------------- | ----------- | ---------------------- |
| `asset`        | `assetId`   | `courseUri`            |
| `manual_uri`   | `courseUri` | `assetId`, `fileUrl`   |
| `digital_file` | `fileUrl`   | `courseUri`, `assetId` |

**Product type derived from mode, never set independently:**

- `asset` or `digital_file` → `type: "digital_file"`
- `manual_uri` → `type: "course"`

**UI enforcement:** When mode is switched in AdminProductsTab, clear stale fields from the product object immediately (not just visually hidden).

**Validation:** `sanitizeProduct` returns `null` (rejects) if a product has conflicting fields that survive normalization (e.g. both `assetId` and `courseUri` non-empty after mode resolution). This is mostly already implemented (lines 122-125 of `digitalProducts.js`) but the UI side needs tightening.

**Files:** `src/lib/digitalProducts.js`, `src/components/admin/AdminProductsTab.js`

---

## i18n keys needed

All three locales (EN/SV/ES):

- `admin.productFree` / `admin.productFreeHint`
- `admin.productPriceAmbiguous` (warning text)
- `admin.productCreatedSetPrice` (post-creation nudge)
- `shop.freeProduct` / `shop.claimFree`
- `shop.downloadProduct`
- `digital.notOwned` / `digital.loginRequired`

---

## Files changed (summary)

| File                                             | Change                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `src/app/api/admin/media-library/route.js`       | Auto-assign assetId during HEAD probe                        |
| `src/lib/s3upload.js`                            | Add helper to write metadata back to R2 object               |
| `src/app/api/admin/products/from-asset/route.js` | Better error reporting, new defaults                         |
| `src/lib/digitalProducts.js`                     | `free` field, stricter mutual exclusivity, listability check |
| `src/components/admin/AdminProductsTab.js`       | Free toggle, pricing warnings, mode-switch cleanup           |
| `src/components/admin/AdminMediaLibraryTab.js`   | Minor: button should work now (no code change needed)        |
| `src/app/digital/[slug]/route.js`                | **New:** download route behind paywall                       |
| `src/app/api/digital/claim/route.js`             | **New:** free product claim endpoint                         |
| `src/components/shop/ShopProductDetail.js`       | Free vs paid display, claim button                           |
| `src/app/inventory/page.js`                      | Link to `/digital/{slug}`                                    |
| `src/app/api/stripe/webhook/route.js`            | Email links use `/digital/{slug}`                            |
| `src/lib/i18n/{en,sv,es}.json`                   | New keys                                                     |
