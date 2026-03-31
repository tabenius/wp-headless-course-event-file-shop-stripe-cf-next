# Uncommitted Change Triage and Abandon Plan (2026-03-20)

## Scope

This document summarizes the current uncommitted workspace state on `main`, identifies what is worth preserving, and gives a safe plan to abandon the current local change set without losing high-value work.

## Snapshot

- Branch: `main` (tracking `origin/main`)
- Staged: `29 files`, `+3637/-65`
- Unstaged: `24 files`, `+480/-168` plus 2 binary zip updates
- Untracked: local skill mirrors, tenant override files, and 3 nested repos (`ragbaz.xyz`, `wp-cf-front`, `wp-cf-front-oss`)
- Mixed staged+unstaged files: `src/components/admin/ImageUploader.js`, `src/app/api/stripe/webhook/route.js`, `src/app/avatar/[avatarId]/page.js`

## What Is Worth Saving

## 1) High Value: Asset/Product Data Model and Purchase Flow

Files:
- `src/lib/digitalProducts.js`
- `src/lib/shopProducts.js`
- `src/app/api/digital/checkout/route.js`
- `src/app/api/digital/products/route.js`
- `src/app/api/stripe/webhook/route.js` (staged + unstaged)
- `src/app/shop/[slug]/page.js`
- `src/app/inventory/page.js`
- `src/app/inventory/[assetId]/page.js`
- `src/app/assets/[assetId]/page.js`

Why this is valuable:
- Introduces `productMode` (`asset`, `manual_uri`, `digital_file`) and `assetId`.
- Moves buyable/owned mounts to derived paths (`/shop/{assetId}`, `/inventory/{assetId}`) instead of persisted product URIs.
- Adds checkout/webhook metadata support for `asset_product`.
- Adds inventory UX for owned products and owned asset routing.

## 2) High Value: Upload + Asset Metadata Authoring

Files:
- `src/app/api/admin/upload/route.js`
- `src/app/api/admin/media-library/route.js`

Why this is valuable:
- Adds author metadata (`authorType`, `authorId`) and persists it for WP/R2 metadata.
- Persists uploaded assets into the asset store bridge (`registerUploadedAsset`).
- Keeps compatibility with existing upload backends.

## 3) Medium/High Value: Identity and Profile Foundation

Files:
- `src/lib/userStore.js`
- `src/lib/username.js`
- `src/auth.js`
- `src/components/layout/UserMenu.js`
- `src/app/me/page.js`
- `src/app/profile/page.js`
- `src/app/profile/[username]/page.js`
- `src/app/api/avatar/me/route.js`
- `src/app/api/avatar/relationships/route.js`
- `src/app/api/avatar/[avatarId]/route.js`
- `src/components/profile/AvatarMePanel.js`
- `src/lib/avatarStore.js`

Why this is valuable:
- Adds immutable opaque hex usernames derived from email+secret.
- Adds `/me` and avatar profile management flow.
- Adds profile menu entry and session propagation of username/public-avatar state.

Risk to address before landing:
- `src/lib/avatarStore.js` uses `node:crypto`; all routes that import it must run in Node runtime or the implementation must be moved to Web Crypto.
- Several new profile/avatar UIs are currently hardcoded English and not integrated with `i18n`.

## 4) Medium Value: Admin UX Improvements

Files:
- `src/components/admin/AdminProductsTab.js`
- `src/components/admin/ImageUploader.js` (mixed staged+unstaged)
- `src/components/admin/AdminMediaLibraryTab.js` (unstaged)
- `src/components/admin/AdminHeader.js`

Why this is valuable:
- Keyboard-first list focus/navigation and Escape-close behavior in product editor.
- Product tab label cleanup (`Products`, `Types`, `Downloads`).
- Stripe test-payments link removal in Products header.
- Uploader reset/escape and crop controls improvements.
- Asset library filters/sort/stats (type filter, sort modes, summary row).

## Save With Caution or Split Out

## A) Feed-Specific Avatar Work (likely postpone/remove)

Files:
- `src/lib/avatarFeedStore.js` (large, includes feeds/follows/items/composite logic)
- `src/app/api/avatar/assets/route.js` (imports `avatarFeedStore`)
- staged + unstaged versions of `src/app/avatar/[avatarId]/page.js` (feed section already removed in unstaged)

Recommendation:
- Keep asset record functions from `avatarFeedStore` if needed.
- Split feed/follow/item protocol into a future branch/module if feed scope is still postponed.

## B) Tenant-Generalization Layer (valuable, but keep cohesive)

Files:
- `src/lib/tenantConfig.js` (untracked)
- `tenantoverride/xtas.nu/config.js` (untracked)
- `tenantoverride/xtas.nu/README.md` (untracked)
- plus unstaged integrations in `email.js`, `site.js`, `transformContent.js`, support/welcome/admin docs, and tests.

Recommendation:
- Save as one unit or drop as one unit to avoid partial tenant behavior.

## Low Value / Regenerable / Local Noise

Probably do not preserve:
- `packages/ragbaz-bridge-plugin/dist/ragbaz-bridge.zip` (binary artifact)
- `public/downloads/ragbaz-bridge/ragbaz-bridge.zip` (binary artifact)
- tool-skill mirror folders (`.adal`, `.agent`, `.augment`, `.codebuddy`, etc.)
- symlink skill entries (`skills/stripe-best-practices`, `skills/upgrade-stripe`) unless intentionally tracked

Keep separate from this repo cleanup:
- `ragbaz.xyz/` (own git repo)
- `wp-cf-front/` (own git repo)
- `wp-cf-front-oss/` (own git repo)

## Salvage Plan (Before Abandoning)

## Step 1: Create forensic snapshots

```bash
mkdir -p /tmp/uncommitted-salvage-2026-03-20
git diff --cached > /tmp/uncommitted-salvage-2026-03-20/staged.patch
git diff > /tmp/uncommitted-salvage-2026-03-20/unstaged.patch
git ls-files --others --exclude-standard > /tmp/uncommitted-salvage-2026-03-20/untracked.txt
```

## Step 2: Save high-value untracked sources explicitly

```bash
tar -czf /tmp/uncommitted-salvage-2026-03-20/tenant-config.tgz \
  src/lib/tenantConfig.js tenantoverride
```

## Step 3: Optional targeted salvage branch

```bash
git switch -c salvage/uncommitted-2026-03-20
```

Recommended commit order on that branch:
1. Asset/product model + checkout/webhook/inventory
2. Upload/media metadata authoring
3. Identity/profile foundation (without feed protocol)
4. Admin UX polish
5. Tenant-config abstraction

## Abandon Plan (Destructive, Do Not Run Until Snapshots Exist)

## Step 1: Revert tracked changes

```bash
git restore --staged --worktree .
```

## Step 2: Clean untracked files while preserving nested repos

```bash
git clean -fd -- . \
  ':(exclude)ragbaz.xyz' \
  ':(exclude)wp-cf-front' \
  ':(exclude)wp-cf-front-oss'
```

## Step 3: Verify clean state

```bash
git status --short --branch
```

Expected result:
- No staged/unstaged/untracked changes in this repo.
- Nested repos remain on disk for independent handling.

## Final Recommendation

If only one subset is preserved, keep the asset/product model + checkout/webhook + inventory flow first. It delivers immediate business value and aligns with the intended URI/data-model direction, while feed protocol work can be postponed cleanly.
