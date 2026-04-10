# Digital Download / Asset / Route / Product Audit (2026-04-06)

## Scope

Audit-only pass over `main` for bug candidates related to:

- digital file downloads
- asset handling
- route wiring
- product flow integrity

No product/runtime code changes were made in this pass.

## High-impact bug candidates

### P0: Shop product detail runtime crash (`item` is undefined)

- File: `src/components/shop/ShopProductDetail.js:190`
- Problem: JSX renders `{item.description}` but `item` is not defined in this component.
- Likely impact: `/shop/[slug]` detail view can crash at render time.
- Suggested fix:
  - Replace `item.description` with `product.description`.
  - Remove nested `<pre>` inside `<p>` and use a valid block structure.
- Validation:
  - Open at least one product detail page with/without description.
  - Verify no `ReferenceError: item is not defined` in console/server logs.

### P0: Null dereference in `/digital/[slug]` route before existence check

- File: `src/app/digital/[slug]/route.js:68-70`
- Problem: `log(product.slug)` and `log(product.assetId)` run before `if (!product ...)`.
- Likely impact: Unknown/malformed slug can throw before returning 404.
- Suggested fix:
  - Move those logs below the null check, or guard each access.
- Validation:
  - Request a non-existing slug and confirm clean 404 (no runtime exception).

### P0: Broken buyable URI generation in shop catalog

- File: `src/lib/shopProducts.js:510-518`
- Problem: `buyableUri` is set to `d.slug` (relative string), not `/shop/{...}`.
- Likely impact: Shop cards may link to wrong path (e.g. `/asset-slug`) instead of `/shop/...`, causing 404/routing drift.
- Suggested fix:
  - Restore absolute shop path generation (`/shop/${...}`).
  - Keep explicit behavior for asset-mode IDs if still required.
- Validation:
  - From `/shop`, click digital card body area and verify it lands on `/shop/[slug or assetId]`.

### P0: Asset-mode digital download fallback can redirect to invalid path

- File: `src/app/digital/[slug]/route.js:46-52,100-127`
- Problem:
  - `resolveFileUrl()` falls back to `assetId` for asset products.
  - `createSignedDownloadUrl()` expects a public URL and usually returns null for raw asset IDs.
  - Route then redirects to raw `assetId` string.
- Likely impact: Purchased asset product can fail download/open flow (bad redirect target).
- Suggested fix:
  - Resolve asset ID -> concrete object URL before signing/redirecting.
  - If unresolved, return explicit 404/422 with actionable message.
- Validation:
  - Purchase/claim an asset-mode product with no `fileUrl`; confirm successful access URL resolution.

### P0: Signed URL shorthand parser appears broken (`r2:`/`s3:`)

- File: `src/lib/s3upload.js:333-355`
- Problem:
  - `safeUrl` is computed before mutating `fileUrl`.
  - Prefix parsing sets `backend = fileUrl.substring(0,3)` after trimming prefix, producing invalid backend tokens.
- Likely impact: Signed URL generation fails for shorthand-prefixed values, then falls back to raw URL path.
- Suggested fix:
  - Parse into immutable `scheme` + `value` variables.
  - Use parsed `value` consistently for object-key resolution.
- Validation:
  - Unit-test `createSignedDownloadUrl()` with:
    - full public URL
    - `r2:<public-url>`
    - `s3:<public-url>`
    - invalid inputs

## Medium-impact bug candidates

### P1: Runtime mode hardcoded in storage layer

- File: `src/lib/s3upload.js:15-26`
- Problem: `isNodeRuntime=false` and `isEdgeRuntime=true` are hardcoded.
- Likely impact:
  - Node SDK paths for S3 can never execute.
  - Route behavior depends on edge fallback availability and may fail in node-only contexts.
- Suggested fix:
  - Restore proper runtime detection (or explicit env-driven detection with tests).
  - Verify both node and edge execution paths.
- Validation:
  - Exercise upload/list/head/delete flows in both local dev (node) and deployed worker contexts.

### P1: `/asset/` vs `/assets/` route namespace drift

- Files:
  - `src/app/api/admin/upload/route.js:145`
  - `src/app/api/admin/media-library/route.js:163`
  - `src/app/api/admin/media-library/cyberduck-r2/route.js:135`
  - `src/lib/uploadPipeline.js:147`
  - `src/lib/mediaAssetRegistry.js:93`
  - `src/lib/avatarFeedStore.js:230,818`
  - Route present at `src/app/assets/[assetId]/page.js`
- Problem: Some code emits `/asset/{id}`, other parts and actual route use `/assets/{id}`.
- Likely impact: Broken deep links and inconsistent asset URI semantics across admin/storefront.
- Suggested fix:
  - Choose one canonical path (`/assets/{id}` seems current route reality).
  - Add one compatibility redirect route if needed (`/asset/[id] -> /assets/[id]`).
- Validation:
  - Verify all generated asset URIs open valid pages.
  - Search for remaining hardcoded `/asset/` literals.

## Lower-priority but relevant candidates

### P2: `/api/digital/download` likely stale/under-integrated

- File: `src/app/api/digital/download/route.js`
- Problem:
  - No in-repo callers found.
  - Uses `product.fileUrl` directly; asset-mode products without `fileUrl` can fail redirect behavior.
- Suggested fix:
  - Decide canonical download entrypoint (`/digital/[slug]` route vs API route).
  - Remove dead path or align logic with canonical route resolver.

### P2: Lint pipeline currently broken (tooling issue blocks safety net)

- Command: `npm run lint` in `main`
- Error: `TypeError: scopeManager.addGlobals is not a function` (ESLint 10.1.0 stack)
- Suggested fix:
  - Align ESLint version/plugins/parser stack.
  - Re-enable lint as gating signal before code changes in this area.

## Suggested execution order for fixes

1. Fix P0 runtime crashes and route breakages (`ShopProductDetail`, `/digital/[slug]` null access, `shopProducts` URI generation).
2. Fix download resolution/signing correctness (`resolveFileUrl` strategy + `createSignedDownloadUrl` parser).
3. Normalize asset URI namespace (`/asset` vs `/assets`) and add redirect compatibility if needed.
4. Repair runtime detection in `s3upload` and verify node/edge coverage.
5. Decide fate of `/api/digital/download` (remove or align), then add tests.
6. Repair lint toolchain and run full lint/test pass.

## Regression test checklist

- Shop index card click routes for:
  - digital file product
  - asset-mode product
  - manual URI product
- Product detail render with and without descriptions.
- `/digital/[slug]` behavior:
  - logged-out redirect
  - owned paid product
  - free product auto-grant path
  - missing product -> 404
- Signed URL creation:
  - URL formats and TTL bounds
  - `response-content-disposition` correctness
- Asset URI consistency:
  - links from admin media panel
  - links from generated/uploaded asset records
