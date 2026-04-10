# Implementation Plan: Digital Downloads, Assets, Routes, Products (2026-04-06)

## Context

This plan implements the issues identified in:

- `docs/plans/2026-04-06-digital-download-assets-routes-audit.md`

Goal: remove route/download breakage and runtime crashes first, then normalize asset routing and storage behavior.

## Constraints

- Prefer small, reversible commits (one work package per commit).
- Keep behavior backward-compatible for existing product records.
- Avoid schema migrations unless absolutely needed.
- Do not mix lint-toolchain fixes with runtime feature fixes in the same commit.

## Work package order (must follow)

1. WP-1: Runtime crash + null-guard fixes (safe/fast)
2. WP-2: Shop URI generation and route consistency
3. WP-3: Digital download resolution for asset-mode products
4. WP-4: Signed URL parser correctness in storage layer
5. WP-5: `/asset` vs `/assets` normalization + compatibility route
6. WP-6: Decide and align `/api/digital/download` path
7. WP-7: Runtime detection cleanup in `s3upload` + verification
8. WP-8: Lint/tooling repair and final regression run

---

## WP-1: Runtime crash + null-guard fixes

### Files

- `src/components/shop/ShopProductDetail.js`
- `src/app/digital/[slug]/route.js`

### Changes

1. `ShopProductDetail` render crash:

- Replace `item.description` with `product.description`.
- Replace invalid nested `<p><pre>...</pre></p>` with one block:
  - either `<pre ...>{product.description}</pre>`
  - or `<p className="whitespace-pre-wrap ...">{product.description}</p>`

2. `/digital/[slug]` null dereference:

- Move `log(product.slug)` / `log(product.assetId)` below:
  - `if (!product || !isProductListable(product)) return 404`
- Guard any debug logging on nullable objects.

### Acceptance

- `/shop/[slug]` no longer throws `ReferenceError`.
- Unknown `/digital/<bad-slug>` returns clean 404.

---

## WP-2: Shop URI generation and route consistency

### Files

- `src/lib/shopProducts.js`
- `src/components/shop/ShopIndex.js` (verify consumer expectations)
- `src/components/shop/ShopProductDetail.js` (buyableUri logic)

### Changes

1. Restore explicit shop URI:

- Replace `const buyableUri = d.slug;`
- With canonical route:
  - `mode === "asset" && d.assetId ? /shop/{assetId} : /shop/{slug}`

2. Ensure `item.uri` in shop cards is always absolute path (starts with `/`).

3. Ensure detail-page callback URLs still point to the same buyable URI variant used in listing.

### Acceptance

- Shop cards click through to `/shop/...` for digital products.
- No relative-path accidental routing from slug-only values.

---

## WP-3: Digital download resolution for asset-mode products

### Files

- `src/app/digital/[slug]/route.js`
- `src/lib/avatarFeedStore.js` (lookup helper reuse if needed)

### Changes

1. Replace current `resolveFileUrl(product)` behavior:

- Do not return raw `assetId` as fallback URL.
- New resolution order:
  1. valid `product.fileUrl` (http/https)
  2. for `productMode === "asset"`:
     - load asset record by `assetId`
     - select primary downloadable URL from `asset.source.url` or best variant URL
  3. if none found: return empty and render explicit not-available response

2. Keep redirect flow:

- if signed URL available -> 302 to signed URL
- else if resolved URL http/https -> 302 to raw URL
- else -> 404/422 response (never redirect to `assetId` text)

3. Add defensive validator:

- `isHttpUrl(candidate)` utility in route (or shared helper).

### Acceptance

- Asset-mode product with missing `fileUrl` but existing asset record still downloads/opens.
- No redirects to malformed targets like `asset:xyz` or bare IDs.

---

## WP-4: Signed URL parser correctness in `s3upload`

### Files

- `src/lib/s3upload.js`

### Changes

1. Refactor `createSignedDownloadUrl` input parsing:

- Use immutable parsed variables:
  - `inputUrl`
  - optional `prefixBackend` from `r2:` / `s3:`
  - `resolvedUrl` (prefix stripped)
- Do not mutate source variable then reuse stale `safeUrl`.

2. Backend candidate priority:

- if prefixed -> try prefix backend first, then fallback backend(s) only if safe.
- if unprefixed -> existing backend preference order.

3. Ensure `resolveStorageObjectKey` always receives parsed URL string.

### Acceptance

- `createSignedDownloadUrl({ fileUrl: "r2:https://..." })` resolves key and signs.
- `s3:` prefix behaves equivalently.
- Invalid prefixed values fail safely and return null.

---

## WP-5: `/asset` vs `/assets` normalization

### Files (high confidence)

- `src/app/api/admin/upload/route.js`
- `src/app/api/admin/media-library/route.js`
- `src/app/api/admin/media-library/cyberduck-r2/route.js`
- `src/lib/uploadPipeline.js`
- `src/lib/mediaAssetRegistry.js`
- `src/lib/avatarFeedStore.js`
- add compatibility route: `src/app/asset/[assetId]/page.js`

### Changes

1. Canonicalize generated asset URIs to `/assets/{assetId}` everywhere.

2. Backward compatibility:

- Add `app/asset/[assetId]/page.js` that redirects to `/assets/{assetId}`.
- Do not break existing records containing `/asset/...`.

3. Optional normalization on write:

- when writing metadata, if incoming `asset.uri` empty -> emit canonical `/assets/...`.
- keep reading legacy values unchanged.

### Acceptance

- New asset records produce `/assets/...`.
- Old `/asset/...` links still resolve via redirect.

---

## WP-6: Align or retire `/api/digital/download`

### Decision gate

Pick one:

- Option A (recommended): keep endpoint and align with `/digital/[slug]` logic.
- Option B: deprecate endpoint and remove dead callers/docs.

### If Option A

- Reuse same resolver logic from WP-3 for asset-mode products.
- Preserve auth/access checks.
- Ensure returned redirects are only valid http/https URLs.

### If Option B

- Mark as deprecated in comments/docs, return explicit 410 + migration hint, or remove route.
- Confirm no frontend/admin callers remain.

### Acceptance

- No stale half-implemented path remains.
- One canonical download code path documented.

---

## WP-7: Runtime detection cleanup in `s3upload`

### Files

- `src/lib/s3upload.js`

### Changes

1. Remove temporary hardcoded:

- `const isNodeRuntime = false;`
- `const isEdgeRuntime = true;`

2. Restore deterministic runtime checks compatible with OpenNext CF:

- Node runtime: `typeof process !== "undefined" && !!process.versions?.node && process.env.NEXT_RUNTIME !== "edge"`
- Edge runtime: `typeof EdgeRuntime !== "undefined" || process.env.NEXT_RUNTIME === "edge"`

3. Verify all call sites that depend on node-only SDK paths have correct guards.

### Acceptance

- Node routes can use SDK paths where intended.
- Edge routes continue using R2 binding/edge signing paths.

---

## WP-8: Lint/tooling repair and regression pass

### Files

- ESLint config/package set (repo root)

### Changes

1. Resolve `scopeManager.addGlobals` ESLint runtime error:

- align ESLint + parser + plugin versions.
- ensure single compatible stack in lockfile.

2. Run:

- `npm run lint`
- targeted tests around digital/shop/storage routes (add if missing)

### Acceptance

- Lint passes.
- New tests (if added) cover:
  - product detail render
  - `/digital/[slug]` missing product behavior
  - buyable URI generation
  - signed URL prefix parsing
  - asset URI normalization behavior

---

## Suggested commit slices

1. `fix(shop): resolve product detail crash and invalid description render`
2. `fix(digital): guard null product access in /digital route`
3. `fix(shop): restore canonical /shop buyable URIs for digital products`
4. `fix(digital): resolve asset-mode download URL from asset record`
5. `fix(storage): correct prefixed signed-url parsing for r2/s3`
6. `refactor(assets): canonicalize uri to /assets and add /asset redirect`
7. `refactor(digital): align or retire /api/digital/download endpoint`
8. `fix(storage): restore runtime detection in s3upload`
9. `chore(lint): repair eslint toolchain and re-enable lint gate`

---

## QA script (manual)

1. Open `/shop`, click 3 digital products (file, asset, manual_uri).
2. Open `/shop/[slug]` for each and verify no render crash.
3. As logged out user, hit `/digital/<owned-slug>` -> redirected to signin.
4. As owner, hit `/digital/<asset-mode-slug>` -> valid redirect target, no bare ID.
5. Validate old `/asset/<id>` link redirects to `/assets/<id>`.
6. Validate new uploads/ingests generate `/assets/<id>` URIs.
7. Run lint/tests and smoke deploy preview.

---

## Risk notes

- Highest regression risk: WP-3 and WP-4 (download behavior).
- Mitigation:
  - land in separate commits,
  - test each with known fixture products,
  - keep old fallback only where safe and explicit.
