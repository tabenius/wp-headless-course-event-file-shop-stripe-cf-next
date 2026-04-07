# Changelog

This changelog summarizes major product-facing changes week by week.
It is intentionally high-level and focused on user/admin experience.

## Week of 2026-03-30

- Improved **admin UI quality** across the dark theme:
  - fixed hover button contrast, hamburger menu icon visibility, accordion text-on-white, and alternating table row contrast.
  - restyled the UI feedback bar to be smaller and less intrusive.
  - fixed payment status badges to display translated labels (EN/SV/ES) instead of raw Stripe status strings.
  - converted the payments reload button to a compact icon button with loading animation.
- Fixed **missing diacritics** across Swedish and Spanish translations (guide tooltips, docs links, operator hints).
- Fixed **`{lang}` template substitution** in help link tooltips and made tooltips contextual (showing the guide topic instead of generic text).
- Improved **storefront performance** via ISR architecture hardening:
  - removed global `force-dynamic` from root layout (Codex), added explicit `force-dynamic` to all auth-dependent pages to prevent ISR caching of authenticated content.
  - converted `/shop/[slug]` product pages from fully dynamic to **ISR with client-side ownership island** — product info is statically cached, ownership/auth checks happen client-side via API, improving TTFB and SEO for product pages.
  - deferred `searchParams` resolution in the catch-all route so free content (posts, pages) remains ISR-eligible while paid content stays dynamic.
- Added **sales trend chart** (SVG) with MA20/MA200 overlays and RSI-14 oscillator to the payments tab.
- Fixed admin startup crash (`e.json is not a function`) caused by `adminFetch` wrapper misuse across multiple call sites.
- Hardened **health check accuracy**: WordPress checks gated on CMS URL, OAuth provider status now detects placeholder credentials and probes authorization endpoints.

## Week of 2026-03-23

- Introduced a significantly improved **Asset Derivation Editor** for media workflows:
  - richer image operator controls,
  - better step editing flow,
  - stronger keyboard support,
  - safer full-quality save flow.
- Added new image operator capabilities including **Tilt Shift** (radial + linear), text overlay controls, and faster preview options for large images.
- Expanded admin guidance with **in-context docs links/tooltips** across key tabs, with language-aware routing to public docs.
- Improved storefront UX and reliability:
  - better dark-mode readability,
  - improved event presentation on the homepage,
  - stronger menu/link hardening to avoid dead-end navigation.
- Increased storefront and admin performance stability through cache tuning, route hardening, and reduced GraphQL roundtrips in critical paths.
- Advanced RAGBAZ control-plane integrations:
  - stronger bridge onboarding flow,
  - tenant slug claim support,
  - clearer call-home and relay status visibility,
  - improved vitals/report handling.

## Week of 2026-03-16

- Reshaped the admin panel into a faster control-room workflow with clearer tab navigation and improved hotkey ergonomics.
- Improved product/access management usability, including better digital-download editing flow inside the products area.
- Hardened upload and media editing interactions so image update actions are more predictable and less error-prone.
- Upgraded admin visual clarity in both light and dark themes (contrast, status indicators, header readability).
- Improved diagnostics affordances and operational status signaling in admin so issues are easier to spot and act on.

## Week of 2026-03-09

- Strengthened commerce and access-management experience:
  - clearer payment/readout behavior,
  - improved VAT/category handling,
  - better consistency across product/access paths.
- Improved documentation discoverability and admin-side guidance flow.
- Continued stability work on deployment/runtime behavior to reduce avoidable regressions during iterative delivery.

## Week of 2026-03-02

- Continued foundation hardening for headless WordPress + Cloudflare operation.
- Expanded operational tooling and environment setup guidance to support faster onboarding and safer day-to-day administration.
- Prepared the groundwork for later admin usability, media workflow, and storefront reliability improvements delivered in subsequent weeks.
