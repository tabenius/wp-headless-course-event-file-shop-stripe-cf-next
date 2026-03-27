# Performance Hardening (2026-03-27)

This document tracks recent performance and stability hardening in storefront/admin runtime paths.

## Changes Landed

1. GraphQL probe throttling for storefront runtime
- File: `src/lib/storefrontGraphqlProbe.js`
- `probeStorefrontRagbazGraphql()` now runs at most once per process per TTL window.
- Prevents an extra GraphQL introspection request on every page request.

2. Universal upload byte cap
- File: `src/app/api/admin/upload/route.js`
- Added configurable hard cap that applies to **all uploads** before/after buffer read.
- This prevents oversized uploads from consuming excessive memory.

3. Health-check parallelization + timeout guard
- File: `src/app/api/admin/health/route.js`
- Added timeout-aware fetch helper.
- WordPress checks, Stripe check, and KV check now execute in parallel.
- Reduces worst-case health endpoint latency and limits stall risk from slow upstreams.

4. URI-safe REST fallback selection
- File: `src/app/[...uri]/page.js`
- REST fallback now validates candidate URI/link path against requested URI before selecting.
- Prevents false-positive page matches on slug collisions.

5. Menu fallback correctness
- Files: `src/lib/menuFilter.js`, `src/lib/menu.js`
- Added `ensureCoreMenuEntriesByExistence()` and switched menu assembly to existence-aware core-link appending.
- Prevents unconditional appending of non-existing core links.

6. Admin TDZ/use-before-init fixes
- Files: `src/components/admin/AdminDashboard.js`, `src/components/admin/AdminMediaLibraryTab.js`
- Reordered state/callback declarations to avoid use-before-define/TDZ runtime risks.

## New Environment Knobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAX_UPLOAD_BYTES` | `104857600` (100 MB) | Hard cap for every upload request |
| `MAX_IMAGE_UPLOAD_BYTES` | `20971520` (20 MB) | Additional stricter cap for image-only uploads |
| `HEALTH_FETCH_TIMEOUT_MS` | `8000` | Per-request timeout used by health probes |
| `STOREFRONT_GRAPHQL_PROBE_TTL_MS` | `900000` | Probe throttle window in ms (15 min) |
| `STOREFRONT_RESOLVE_DEBUG` | `0` | Enables verbose URI resolver logs when `1` |
| `GRAPHQL_EDGE_CACHE_TTL_SECONDS` | `60` | TTL for edge-cached public GraphQL responses |
| `GRAPHQL_EDGE_CACHE_STALE_SECONDS` | `120` | Stale-while-revalidate window for edge-cached GraphQL |

## Operational Notes

- “Per process” means per active Next.js/Worker runtime instance.  
  No cron is required for probe throttling.
- For multi-instance deployments, each instance runs one probe per TTL window.
