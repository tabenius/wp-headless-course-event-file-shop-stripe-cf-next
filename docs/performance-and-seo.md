# Performance & SEO Playbook

This guide documents current performance bottlenecks, Web Vitals targets, SEO implications, and a practical roadmap for this project.

## Scope

- Platform: Next.js 16 App Router + WordPress (WPGraphQL) + Cloudflare Workers.
- Audience: operators and developers who need to tune public-site speed and search visibility.
- Focus: public storefront and content routes (`/`, `/courses`, `/events`, `/blog`, `/shop`, content catch-all).

## Snapshot (2026-03-20)

All values below are local measurements from the current codebase (`npm run build`, `npm run start`) and should be treated as baseline trend data, not global internet RUM.

### Route cache behavior and timing

| Route      | Cache behavior  | Header signals                         | Local TTFB sample |
| ---------- | --------------- | -------------------------------------- | ----------------- |
| `/`        | Cacheable       | `x-nextjs-cache: HIT`, `s-maxage=1800` | `~0.003s`         |
| `/courses` | Cacheable       | `x-nextjs-cache: HIT`, `s-maxage=1800` | `~0.003s`         |
| `/events`  | Cacheable       | `x-nextjs-cache: HIT`, `s-maxage=1800` | `~0.003s`         |
| `/blog`    | Cacheable       | `x-nextjs-cache: HIT`, `s-maxage=1800` | `~0.004s`         |
| `/shop`    | Dynamic/private | `Cache-Control: private, no-store`     | `~0.54s`          |

### HTML payload samples

| Route      | HTML bytes (raw) | Download bytes (`curl --compressed`) |
| ---------- | ---------------- | ------------------------------------ |
| `/`        | `97,668`         | `13,333`                             |
| `/courses` | `39,054`         | `7,755`                              |
| `/events`  | `48,470`         | `10,745`                             |
| `/blog`    | `51,753`         | `10,413`                             |
| `/shop`    | `64,619`         | `15,603`                             |

### Build artifact size snapshot

| Asset class                         | Current size  | Notes                                  |
| ----------------------------------- | ------------- | -------------------------------------- |
| JS chunks (sum, raw)                | `1,391,213 B` | Not all loaded on one route            |
| JS chunks (sum, gzip)               | `424,270 B`   | Transfer estimate of all chunks        |
| CSS chunks (sum, raw)               | `116,567 B`   | Global + route CSS                     |
| CSS chunks (sum, gzip)              | `20,425 B`    | Transfer estimate                      |
| WOFF2 fonts in `.next/static/media` | `515,052 B`   | Browser usually loads subset           |
| Checked-in `public/*` image assets  | `104,591 B`   | WP media dominates total in production |

## Web Vitals and related targets

Use these as operational thresholds:

| Metric            | Good target | Why it matters                        |
| ----------------- | ----------- | ------------------------------------- |
| LCP               | `<= 2.5s`   | Main content becomes visible quickly  |
| INP               | `<= 200ms`  | Interaction responsiveness            |
| CLS               | `<= 0.1`    | Visual stability                      |
| TTFB (supporting) | `<= 0.8s`   | Backend/network responsiveness signal |

Lighthouse lab metrics are complementary:

- Performance score is sensitive to LCP, CLS, JS main-thread cost, render-blocking resources, and network chain depth.
- SEO score validates technical basics (crawlability, metadata, structured hints) but does not replace ranking strategy.

## Roundtrips and bottlenecks

### 1) Dynamic `/shop` remains the clearest latency hotspot

- `/shop` still does authenticated + personalized work and is intentionally `private, no-store`.
- Current path includes shop aggregation, digital-access lookup, and course-access ownership checks.
- Even after batching ownership checks, this route remains much slower than cached content routes.

### 2) WordPress roundtrip depth can grow quickly

- Shop aggregation currently combines multiple source queries (`products`, `lpCourses`, `events`, plus store/access data).
- Additional schema introspection can occur when field support is first evaluated.
- Catch-all content route is improved, but fallback paths can still perform extra upstream calls when `nodeByUri` misses.

### 3) Asset weight distribution still follows normal web economics

- HTML is relatively cheap after compression.
- CSS cost is moderate.
- JS, fonts, and especially media (WordPress images) dominate real-world transfer and parse time.

## Common pitfalls

- Reintroducing server-side auth/session reads into globally shared public shells.
- Leaving debug flags enabled (`NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG=1`, non-zero `GRAPHQL_DELAY_MS`).
- Disabling image optimization (`next/image` unoptimized paths).
- Shipping production source maps to everyone.
- Growing font families/weights without auditing first-content render impact.
- Adding uncached network dependencies in `layout` or top-level route code.

## What has been improved in this project

These measures are already implemented and are meaningful for performance:

1. Header auth split to client nav to keep public shells cacheable.
   Path: `src/components/layout/Header.js`, `src/components/layout/HeaderNavClient.js`

2. Menu fetch memoization with `cache(...)`.
   Path: `src/lib/menu.js`

3. Catch-all content route dedupe/caching and fallback parallelization.
   Path: `src/app/[...uri]/page.js`

4. GraphQL artificial delay default set to `0`; debug flags default-off in docs/config.
   Path: `src/lib/client.js`, `src/lib/courseAccess.js`, `.env.example`

5. Shop page uses a static catalog shell with async ownership enrichment (`/api/shop/ownership`) including retry/backoff, so anonymous traffic avoids user-bound access checks in the initial HTML path.
   Path: `src/app/shop/page.js`, `src/components/shop/ShopIndex.js`, `src/app/api/shop/ownership/route.js`

6. Shop catalog aggregation now uses a short-lived server cache to reduce repeated WordPress/KV recomputation.
   Path: `src/lib/shopProducts.js`

7. Asset-based digital products now consume stored responsive variants (`sm/md/lg`) through a width-aware image loader fallback strategy.
   Path: `src/lib/avatarFeedStore.js`, `src/lib/shopProducts.js`, `src/components/shop/ShopIndex.js`

8. Style bootstrap fetch switched to cache-friendly behavior.
   Path: `src/app/layout.js`, `src/app/api/site-style/route.js`

9. Downloaded font CSS is served in a core-weight mode by default to reduce first-render font payload.
   Path: `src/app/api/site-fonts/route.js`, `src/lib/downloadedFonts.js`

10. Performance budgets are now enforced in CI before deployment.
    Path: `scripts/check-performance-budgets.mjs`, `.github/workflows/deploy.yml`

11. Production browser source maps made opt-in.
    Path: `next.config.mjs`

## Quantifying impact by asset category

These are practical directional impacts for this stack:

| Category   | Typical impact profile                               | In this project right now                                                              |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Images     | Usually biggest payload driver; directly affects LCP | `public` assets are small, but WP media quality/format choice will dominate            |
| JavaScript | Affects transfer + parse/execute + INP/TBT           | Aggregate chunk output is large; route-splitting and hydration boundaries are critical |
| Fonts      | Can block text rendering if not tuned                | `display: swap` is in place; total font artifact size still warrants ongoing audit     |
| CSS        | Usually manageable if trimmed and non-blocking       | Current CSS totals are modest relative to JS/media                                     |
| HTML       | Usually compresses very well                         | Current compressed HTML payloads are low-to-moderate                                   |

Simple transfer intuition:

- `100 KB` over `10 Mbps` is roughly `~0.08s` transfer.
- `500 KB` over `10 Mbps` is roughly `~0.4s`.
- `1 MB` over `10 Mbps` is roughly `~0.8s`.

That is before parse/decode/layout cost and before network variability on mobile.

## Compared to plain WordPress

This is a directional architectural comparison (not a controlled benchmark):

| Dimension                | Typical plain WP (uncached)   | Typical WP + page cache          | This Next.js + WPGraphQL architecture                                                  |
| ------------------------ | ----------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| TTFB consistency         | Variable under plugin/db load | Better for anonymous pages       | Very strong on cacheable routes; dynamic routes depend on personalization depth        |
| Personalization          | Often plugin/PHP-heavy        | Usually bypasses full-page cache | Explicit per-route control; can keep most routes cached while isolating dynamic routes |
| Frontend payload control | Theme/plugin dependent        | Same                             | Stronger control via route-level rendering, `next/image`, metadata, code splitting     |
| Cache invalidation model | Plugin-specific               | Plugin/CDN-specific              | App-managed (`revalidate`, route caching headers, edge behaviors)                      |

When WP is heavily tuned with full-page cache + object cache + optimized theme, it can be very fast. The main advantage here is explicit control and predictability across mixed content, commerce, and custom flows.

## How Next.js has helped and can help further

### How Next.js has already helped in this project

- Route-level caching with `revalidate` + cache headers gave fast, repeatable public TTFB on cacheable routes.
- Server/client boundary control let us move session-dependent header behavior client-side without sacrificing shared route cacheability.
- `next/image` optimization and `sizes` give responsive image delivery instead of full-size image transfer.
- App Router metadata APIs made canonical/Open Graph/Twitter handling consistent across route types.

### How Next.js can help further

- Move more catalog pages toward static shell + streamed/personalized islands.
- Introduce stronger route-segment cache policy discipline (`force-cache` vs dynamic) for expensive read paths.
- Expand image and font budgets with route-specific loading strategy and stricter bundle boundaries.
- Add automated build-time checks for bundle growth and cacheability regressions.

## SEO perspective

### Classic SEO and PageRank realities

- PageRank/backlinks still matter for discovery and authority.
- Content quality, topical relevance, internal linking, and crawlability remain core.
- Performance supports SEO indirectly through better user behavior and crawl efficiency, and directly through page experience signals.

### Technical SEO already present

- Canonical URLs on core routes and content pages.
- Open Graph/Twitter metadata.
- JSON-LD structured data for organization and content types.
- `robots.txt` and `sitemap.xml` generation.

Primary paths:

- `src/app/layout.js`
- `src/app/[...uri]/page.js`
- `src/app/robots.js`
- `src/app/sitemap.js`

### Lighthouse and practical interpretation

- Lighthouse is a lab proxy, not field truth.
- Use it for regression detection and optimization prioritization.
- Pair it with field telemetry (RUM) for decisions.

## Positive future outcome and next steps

If the next optimization wave is implemented, a realistic outcome is:

- cacheable public routes stay in very low TTFB territory,
- `/shop` TTFB approaches static-route behavior for anonymous users,
- better LCP on image-heavy pages,
- stronger Lighthouse consistency and crawl efficiency.

## Suggested roadmap with tradeoffs

1. Split `/shop` into static catalog shell + user ownership enrichment API. (Implemented)
   Expected gain: major TTFB reduction for anonymous traffic.
   Tradeoff: additional client-side state path; ownership badges become async.

2. Add a dedicated lightweight storefront access/config query (avoid admin-heavy course state reads).
   Expected gain: lower backend roundtrips and payload.
   Tradeoff: extra API/schema maintenance.

3. Precompute and cache aggregated shop catalog (KV/edge cache with short TTL).
   Expected gain: fewer upstream WordPress calls.
   Tradeoff: cache invalidation complexity after content updates.

4. Enforce image pipeline defaults (WebP by default, AVIF where practical, size variants). (Implemented, continue tuning)
   Expected gain: better LCP and lower transfer.
   Tradeoff: extra storage + processing + variant bookkeeping.

5. Trim font variants and verify actual loaded subset on first view.
   Expected gain: faster first render and reduced layout shifts.
   Tradeoff: reduced typography flexibility.

6. Add RUM Web Vitals collection and make performance budgets part of CI. (Implemented)
   Expected gain: detect real regressions early.
   Tradeoff: instrumentation/storage overhead and alert tuning effort.

## Operational checklist

- Keep `NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG=0`, `WORDPRESS_GRAPHQL_DEBUG=0`, `GRAPHQL_DELAY_MS=0` in production.
- Re-run route/header probes after major content or architecture changes.
- Run Lighthouse on representative pages: home, content page, `/shop`, checkout entry route.
- Monitor both lab and field data; optimize for field outcomes first.
