# 2026-04-09: Claude Execution Checklist — Move 1/2/3/4 to ragbaz.xyz

Scope requested: move planning for:

1. Docs/manual/changelog surfaces
2. Plugin packaging pipeline
3. Release/download hosting endpoints
4. Admin Info/Health/Diagnostics surfaces

No code changes in this checklist document. This is a handoff plan.

---

## Status update (2026-04-09, Codex)

Started implementation with the first migration slice:

- `main`: added redirects for docs + plugin download/release paths to `ragbaz.xyz`
- `main`: decoupled plugin zip copy from normal `postbuild` (now opt-in via `POSTBUILD_PLUGIN_COPY=1`)
- `main`: added external ops-console links in Admin Info docs panel
- `ragbaz.xyz`: added `/release/ragbaz-bridge/latest` and `/release/ragbaz-bridge/{version}/ragbaz-bridge.zip` support plus richer plugin-info JSON fields

Remaining work is still tracked by the checklist below.

---

## Global Setup

- [ ] Owner: `Claude`
- [ ] Branches:
  - `split/docs`
  - `split/releases`
  - `split/plugin-pipeline`
  - `split/admin-ops`
- [ ] Define freeze window for URL changes
- [ ] Capture baseline from `main`:
  - build time
  - route count
  - docs traffic
  - download traffic

## Phase 1: Docs / Manual / Changelog Split

- [ ] Inventory docs URLs currently served by `main`
- [ ] Mirror docs content to `ragbaz.xyz` under `/docs/...`
- [ ] Add canonical links on `ragbaz.xyz` docs pages
- [ ] Add `301` redirects in `main` from old docs URLs to `ragbaz.xyz`
- [ ] Verify URL map with smoke tests (`curl -I`)
- [ ] Update internal nav links to `ragbaz.xyz/docs`
- [ ] Success gate: all old docs URLs `301`; no docs 404s

### Phase 1 rollback

- [ ] Disable docs redirect rules in `main`
- [ ] Re-point menu/docs links back to local docs
- [ ] Re-deploy `main`

## Phase 2: Release / Download Hosting Split

- [ ] Define stable release path contract on `ragbaz.xyz`:
  - `/release/<product>/<version>/...`
- [ ] Define latest aliases:
  - `/release/<product>/latest`
- [ ] Move artifact hosting + checksum files to `ragbaz.xyz`
- [ ] Add redirects from old `main` download URLs to new release URLs
- [ ] Validate installer/update links against new endpoints
- [ ] Success gate: all downloads resolve from `ragbaz.xyz`, checksum verification passes

### Phase 2 rollback

- [ ] Re-enable old artifact endpoints in `main`
- [ ] Disable release redirects
- [ ] Re-deploy projects as needed

## Phase 3: Plugin Packaging Pipeline Split

- [ ] Move plugin zip build/publish logic into `ragbaz.xyz` CI
- [ ] Configure trigger from `main` tag/release to `ragbaz.xyz` publish workflow
- [ ] Publish artifact + checksum to release path contract
- [ ] Remove artifact copy steps from `main` build/deploy flow
- [ ] Validate clean tag flow: artifact appears at expected release URL
- [ ] Success gate: `main` deploy no longer builds/copies plugin artifacts

### Phase 3 rollback

- [ ] Re-enable old plugin packaging step in `main`
- [ ] Disable cross-repo publish trigger
- [ ] Re-run legacy release pipeline

## Phase 4: Admin Info / Health / Diagnostics Split

- [ ] Identify read-only admin endpoints/pages to migrate
- [ ] Re-host info/health/diagnostics views in `ragbaz.xyz`
- [ ] Implement auth strategy for ops views (shared auth or signed read-only token)
- [ ] Keep write-critical admin flows in `main` (products, access, payments actions)
- [ ] Add "Open Ops Console" link in `main` admin
- [ ] Validate data parity between old/new diagnostic views
- [ ] Success gate: ops tabs work in `ragbaz.xyz` with no write-scope leakage

### Phase 4 rollback

- [ ] Hide/disable ops-console entry in `main`
- [ ] Re-enable prior admin info/health pages in `main`
- [ ] Re-deploy `main`

## Definition of done (all phases)

- [ ] `main` build time reduced vs baseline
- [ ] `main` route count reduced vs baseline
- [ ] Redirect map documented and tested
- [ ] No storefront/admin-core regressions
- [ ] `AGENTS.md` updated with final URL map + rollback notes
