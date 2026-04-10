# Review: Claude Download/Asset/Route Fixes (commit `ec280ee`)

## Scope reviewed

- `src/components/shop/ShopProductDetail.js`
- `src/app/digital/[slug]/route.js`
- `src/lib/shopProducts.js`
- `src/lib/digitalProducts.js`
- `src/lib/s3upload.js`
- asset URI emitters under admin/media/upload helpers

## Findings (ordered by severity)

### 1) P0: Product detail render now crashes (`item` is undefined)

- File: `src/components/shop/ShopProductDetail.js:194`
- Issue:
  - `{item.description}` is referenced, but `item` is not defined in this component.
  - Also wraps `<pre>` inside `<p>`, which is invalid HTML structure.
- Impact:
  - `/shop/[slug]` can hard-fail at render time.
- Suggested correction:
  - Use `product.description`.
  - Render as either:
    - `<p className="whitespace-pre-wrap ...">{product.description}</p>`
    - or a standalone `<pre ...>{product.description}</pre>` (not nested in `<p>`).

### 2) P0: `/digital/[slug]` can throw before 404 handling

- File: `src/app/digital/[slug]/route.js:69-70`
- Issue:
  - `log(product.slug)` / `log(product.assetId)` run before `if (!product ...)`.
- Impact:
  - Missing/invalid slug can throw before clean 404 path.
- Suggested correction:
  - Move those logs below the null check or guard them.

### 3) P1: Shop buyable URI regression still present

- File: `src/lib/shopProducts.js:523`
- Issue:
  - `const buyableUri = d.slug;` remains.
  - Previously identified route fix (`/shop/...`) is still commented out.
- Impact:
  - Digital shop cards can resolve to wrong relative paths and 404.
- Suggested correction:
  - Restore explicit `/shop/${...}` URI generation for digital products.

### 4) P1: `resolveFileUrl()` still returns raw `assetId` as URL fallback

- File: `src/lib/digitalProducts.js:490-491`
- Used by:
  - `src/app/digital/[slug]/route.js:120`
  - `src/app/api/digital/download/route.js:86`
- Issue:
  - Asset-mode fallback resolves to `assetId` string, not concrete URL.
- Impact:
  - Download flow can still redirect to invalid non-URL target after signing fallback.
- Suggested correction:
  - Resolve asset ID to asset record URL/variant URL, not raw ID.
  - If unresolved, return explicit 404/422 (no redirect to ID string).

### 5) P1: Runtime detection was replaced with hardcoded constants

- File: `src/lib/s3upload.js:24-25`
- Issue:
  - `const isNodeRuntime = false; const isEdgeRuntime = true;`
- Impact:
  - Node S3 SDK paths are forcibly disabled, potentially breaking node-runtime routes and S3 backend behavior.
- Suggested correction:
  - Restore robust runtime detection logic (or explicit env-driven flags with tests).

### 6) P2: `/asset` vs `/assets` URI normalization remains incomplete

- Files:
  - `src/lib/mediaAssetRegistry.js:105`
  - `src/app/api/admin/media-library/cyberduck-r2/route.js:133`
  - `src/lib/uploadPipeline.js:152`
  - `src/app/api/admin/upload/route.js:143`
- Issue:
  - Multiple writers still emit `/asset/{id}`, while route surface is `/assets/[assetId]`.
- Impact:
  - Inconsistent links and possible dead paths unless legacy alias route is added.
- Suggested correction:
  - Canonicalize emitted URIs to `/assets/{id}`.
  - Add compatibility redirect route `/asset/[assetId] -> /assets/[assetId]`.

## Positive notes

- `src/app/api/digital/download/route.js` now calls `resolveFileUrl(product)` before signing/redirecting.
- `createSignedDownloadUrl()` prefix handling (`r2:` / `s3:`) was partially refactored toward explicit parsing.

## Recommended next slice order

1. Fix P0 issues in `ShopProductDetail` and `/digital/[slug]`.
2. Restore canonical shop buyable URIs.
3. Replace `assetId` fallback in `resolveFileUrl` with asset-record URL resolution.
4. Revert hardcoded runtime constants in `s3upload`.
5. Finish `/asset` vs `/assets` normalization plus compatibility route.
