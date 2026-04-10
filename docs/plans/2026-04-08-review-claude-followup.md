# 2026-04-08 Follow-up Review: Claude Fixes (downloads/assets/routes)

Scope: follow-up review of current `main` working tree after the earlier review of commit `ec280ee`.

## Findings

### P0 - Free-claim path is broken by rate-limit response shape mismatch

- File: `src/app/digital/[slug]/route.js`
- Lines: `94`, `99`
- Problem:
  - Code checks `if (!rl.allowed)` but `checkRateLimit()` now returns `{ limited, remaining }`.
  - `rl.allowed` is therefore `undefined`, making the condition always true and forcing 429 for free claims.
  - The response body also references `rl.limit`, which is no longer returned.
- Impact:
  - Free digital claim/download flow can fail for valid users.

### P1 - Password-reset token expiry comparisons use incompatible datetime formats

- Files:
  - `src/lib/passwordResetStore.js`
  - `migrations/0013_password_reset_tokens.sql`
- Problem:
  - `expires_at` is written as ISO-8601 with `T`/`Z` (`new Date(...).toISOString()`).
  - Reads and cleanup compare with `datetime(now)` string format.
  - String comparison across these formats is unreliable in SQLite-style text comparisons.
- Impact:
  - Expired tokens may incorrectly validate, or valid tokens may be rejected around boundary cases.

### P1 - Asset-mode file resolution still incomplete across asset stores

- File: `src/lib/digitalProducts.js`
- Lines: `494-501`
- Problem:
  - `resolveFileUrl()` now attempts `avatarFeedStore.getAssetRecord(assetId)` only.
  - Cyberduck R2 ingest persists entries in `media_assets` (`mediaAssetRegistry`) rather than `avatarFeedStore`.
  - For asset-mode products without `fileUrl`, lookup can still fail even when the asset exists in media registry.
- Impact:
  - Some asset-mode products remain non-downloadable (`File not available`/fallback behavior).

### P2 - Explicit edge runtime remains in digital download route

- File: `src/app/api/digital/download/route.js`
- Line: `12`
- Problem:
  - Route still sets `export const runtime = "edge"`.
  - This has been a known source of stack-specific issues in this deployment setup.
- Impact:
  - Increased risk of runtime/platform mismatches in production.

## What appears improved

- Undefined variable crash in product detail description rendering was fixed (`item.description` -> `product.description`).
- Null dereference logs in `/digital/[slug]` were removed.
- Upload route and cyberduck route now consistently use `NextResponse.json(...)` in error paths.
- URI normalization moved many paths from `/asset/...` to `/assets/...`.

## Suggested fix order

1. Fix P0 (`rl.allowed`/`rl.limit` mismatch in `/digital/[slug]`).
2. Fix password-reset expiry comparisons to a single consistent datetime strategy.
3. Extend `resolveFileUrl()` fallback chain to include media-asset registry lookup for asset-mode products.
4. Remove explicit edge runtime override from `/api/digital/download` unless explicitly required and verified.
