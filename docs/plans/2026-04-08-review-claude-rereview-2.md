# 2026-04-08 Re-Review #2: Claude Fixes (downloads/assets/routes)

Scope: second re-review of current `main` working tree, after the follow-up note.

## Re-check of previous blockers

- The free-claim rate-limit shape mismatch in `/digital/[slug]` appears fixed (`rl.limited` + constant limit payload).
- Password-reset expiry comparison now uses ISO-to-ISO parameterized comparison (no `datetime(now)` string-format mismatch).
- `/api/digital/download` no longer forces `runtime = "edge"`.

## Findings

### P0 - Runtime detection is hardcoded, breaking Node fallback paths for R2/S3 helpers

- Files:
  - `src/lib/s3upload.js` (`isNodeRuntime = false`, `isEdgeRuntime = true`)
  - `src/app/api/admin/media-library/cyberduck-r2/route.js` (explicit `runtime = "nodejs"`)
- Key lines:
  - `src/lib/s3upload.js:24-25`
  - `src/lib/s3upload.js:137-144`
  - `src/lib/s3upload.js:848-873`
  - `src/app/api/admin/media-library/cyberduck-r2/route.js:15,156,165`
- Problem:
  - If Workers R2 binding is unavailable, `listBucketObjects/headBucketObject` should fall back to SDK path.
  - With `isNodeRuntime` hardcoded false, `assertNodeS3Support(...)` always throws in that fallback path.
  - `isS3Configured("r2")` can still report configured due `isEdgeRuntime` being hardcoded true, which makes failures surprising at runtime.
- Impact:
  - High risk of 500s for Cyberduck R2/manual media flows and other SDK-dependent R2/S3 operations outside true edge-binding contexts.

### P1 - Asset-mode fallback now works functionally but is O(N) per download

- File: `src/lib/digitalProducts.js`
- Key lines: `501-506`
- Problem:
  - `resolveFileUrl()` fetches the entire media asset registry (`listMediaAssetRegistry()`) and then scans in memory for matching `assetId`.
- Impact:
  - Download latency and DB load scale linearly with registry size; this can become a production bottleneck.

### P2 - `/asset/...` legacy path still emitted in one admin API and placeholders

- Files:
  - `src/app/api/admin/media-library/route.js`
  - `src/components/admin/media-library/MediaAnnotationEditorPanel.js`
  - `src/lib/i18n/en.json`, `sv.json`, `es.json`
- Key lines:
  - `src/app/api/admin/media-library/route.js:161`
  - `src/components/admin/media-library/MediaAnnotationEditorPanel.js:232`
  - `src/lib/i18n/en.json:520` (and same key positions in `sv.json`, `es.json`)
- Problem:
  - Some flows still generate/show `/asset/<id>` while most of the system now uses `/assets/<id>`.
- Impact:
  - Inconsistent asset URIs and avoidable redirect churn/confusion in admin tooling.

## Suggested next order

1. Replace hardcoded runtime flags in `s3upload.js` with robust runtime detection; re-test Cyberduck R2 flow in both Workers and Node-fallback contexts.
2. Add an indexed-by-id media-registry lookup API and use it from `resolveFileUrl()` instead of full-table scans.
3. Finish `/asset` -> `/assets` normalization in remaining API/UI/i18n surfaces.
