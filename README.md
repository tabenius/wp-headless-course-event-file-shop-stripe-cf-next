# XTAS Course Access (Next.js + WordPress + Stripe)

A Next.js 15 application for WordPress/WPGraphQL content with authenticated course access, Stripe checkout, and optional Cloudflare Workers deployment.

## Features

- WordPress content via GraphQL (`NEXT_PUBLIC_WORDPRESS_URL`)
- Auth flows with email/password and optional OAuth providers
- Course & event paywalls + entitlement control
- Shop-driven digital product sales with Stripe checkout & downloads
- Stripe Checkout + webhook-based access granting
- Admin UI for course/event access rules, shop products, health checks
- Storage backends:
  - WordPress/LearnPress backend
  - Cloudflare KV or local fallback
- Cloudflare Workers deployment support via OpenNext

## Tech Stack

- Next.js 15 (App Router)
- React 19
- WPGraphQL
- Stripe API
- Cloudflare Workers + KV (optional)

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

See [.env.example](.env.example) for full configuration.

Minimum for WordPress content:

- `NEXT_PUBLIC_WORDPRESS_URL`

Common production variables:

- `AUTH_SECRET`
- `ADMIN_EMAILS` / `ADMIN_PASSWORDS`
- `COURSE_ACCESS_BACKEND`
- `WORDPRESS_GRAPHQL_AUTH_TOKEN` (Bearer token), or:
- `WORDPRESS_GRAPHQL_USERNAME` + `WORDPRESS_GRAPHQL_APPLICATION_PASSWORD` (Basic auth for WP Application Passwords)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `DIGITAL_ACCESS_STORE` (local|cloudflare)
- `CF_DIGITAL_ACCESS_KV_KEY`

### WordPress GraphQL Authentication

Two authentication methods are supported for WPGraphQL requests:

| Method | Variables | Header |
|--------|-----------|--------|
| **Bearer token** (JWT / plugin token) | `WORDPRESS_GRAPHQL_AUTH_TOKEN` | `Authorization: Bearer <token>` |
| **Basic auth** (WP Application Password) | `WORDPRESS_GRAPHQL_USERNAME` + `WORDPRESS_GRAPHQL_APPLICATION_PASSWORD` | `Authorization: Basic <base64>` |

If both a username and an application password are set, Basic auth takes precedence. If only a bearer token is set, it is used as-is. The helper in `src/lib/wordpressGraphqlAuth.js` handles the logic and is used by all GraphQL consumers (`client.js`, `courseAccess.js`, `health/route.js`).

**Backwards compatibility:** if `WORDPRESS_GRAPHQL_USERNAME` is set and the token in `WORDPRESS_GRAPHQL_AUTH_TOKEN` looks like an application password (contains spaces, no dots), it is automatically used as Basic auth credentials.

### Optional WPGraphQL Features

Some GraphQL fragment fields require specific WordPress plugins. They are disabled by default and can be enabled via environment variables:

| Feature | Env var | Required plugin |
|---------|---------|-----------------|
| Editor Blocks (Gutenberg block data) | `NEXT_PUBLIC_WORDPRESS_EDITOR_BLOCKS=1` | [WPGraphQL Content Blocks](https://github.com/wpengine/wp-graphql-content-blocks) |
| Event CPT | `NEXT_PUBLIC_WORDPRESS_EVENT_CPT=1` | A plugin that registers an `Event` post type in WPGraphQL |
| LearnPress courses | `NEXT_PUBLIC_WORDPRESS_LEARNPRESS=1` | LearnPress + the `Articulate-LearnPress-Stripe` mu-plugin (see `docs/wordpress/mu-plugins/`) |

When disabled, queries omit these fields entirely so they never cause schema errors. Content rendering falls back to the `content` HTML field when `editorBlocks` is unavailable.

### LearnPress Integration

When `NEXT_PUBLIC_WORDPRESS_LEARNPRESS=1` is set and the mu-plugin is installed:

- `/courses` lists all LearnPress courses with price, duration, and featured image.
- Individual course pages (`/courses/<slug>`) are rendered via the catch-all route with the app's auth/paywall flow.
- The mu-plugin registers `lp_course` and `lp_lesson` as WPGraphQL types (`LpCourse`/`LpLesson`) and adds custom fields: `price`, `priceRendered`, `duration`, and `curriculum`.
- Course access is controlled by the same mechanism as before — see [WordPress LearnPress setup](docs/wordpress-learnpress-course-access.md).

### Diagnostics

- `NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG=1` logs every GraphQL request/response (auth mode, endpoint, HTTP status, payload) to the server console.

Shop + access catalogs:

- `config/digital-products.json` defines products, pricing, slugs, image/file URLs, and delivery type.
- `config/digital-products.example.json` is the seed/example catalog.
- `/shop` lists all products; `/shop/[slug]` renders each detail.
- The admin UI under `Shop produkter` lets you attach images, files, or course URIs (early bird, premium packages, etc.) to the same course/event access backend.
Courses and events continue to use their WP URI paywall once access is granted, while shop products can either unlock files or grant access to those URIs.

## Scripts

- `npm run dev` - local development
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - lint source
- `npm run prettier` - format code
- `npm run cf:build` - Cloudflare OpenNext build
- `npm run cf:preview` - build + local Wrangler preview
- `npm run cf:deploy` - build + deploy to Cloudflare

## Documentation

English and Swedish docs are available in `docs/`:

- [English guide](docs/README.en.md)
- [Svensk guide](docs/README.sv.md)
- [Cloudflare Workers deploy (SV)](docs/cloudflare-workers-deploy.md)
- [WordPress LearnPress setup (EN)](docs/wordpress-learnpress-course-access.md)

## License

Licensed under the MIT License. See [LICENSE](LICENSE).

## Dokumentation (Svenska)

Den här komponten kombinerar Next.js, WordPress/WPGraphQL, Stripe och Cloudflare för att sälja kurser, händelser och andra digitala produkter.

### Funktioner

- WordPress-innehåll via GraphQL (`NEXT_PUBLIC_WORDPRESS_URL`).
- Inlogg med e-post/lösenord + OAuth.
- Paywalls för kurser och evenemang med Stripe-registrering och behörighetskontroll.
- `/shop`-butik som listar filer, kursprodukter och premiumpaket.
- Automatiska nedladdningar och kursinstruktioner efter köp.
- Admingränssnitt för accessregler, hälsokontroller och produktkatalog.
- Cloudflare Workers + KV-stöd.

### Kom igång

1. Kopiera `.env.example` till `.env` och ange produkten vars `NEXT_PUBLIC_WORDPRESS_URL` pekar på din WP-sajt.
2. (`npm run config`) startar ett interaktivt verktyg med guide för `.env`, shopkatalog, URL-beräkningar och adminlänk.
3. `npm run dev` startar Next.js lokalt; `/shop` visar produkterna, `/courses/...` och `/events/...` är skyddade.
4. Ange `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` och konfigurera webhook på `/api/stripe/webhook`.

### Shop & produkter

- Produkterna definieras i `config/digital-products.json`. Varje post har `name`, `slug`, `description`, `imageUrl`, `priceCents`, `currency`, `type` (`digital_file` eller `course`), `fileUrl` och `courseUri`.
- `/shop` visar samtliga aktiva produkter; klicka genom till `/shop/[slug]` för detaljer.
- Kursprodukter (type=`course`) levererar en länk till kursens URI och återanvänder kursaccess-flödet (inklusive early bird/premium).
- Digitala filer (type=`digital_file`) streamas via `/api/digital/download` när användaren har köpt dem.
- Admin UI (`/admin`) innehåller en sektion “Shop-produkter” där du kan justera bilder/URL:er samt koppla produkter till kurser eller filer.

### Verktyg & drift

- `npm run theme:css` genererar CSS från `theme.json`; `predev`, `prebuild`, `prestart`, `precf:build` kör detta automatiskt.
- `npm run config` öppnar `scripts/configure.mjs` med en meny som stödjer shop-guiden, adminlänkar och JSON-validering.
- För Cloudflare: använd `npm run cf:build`, `npm run cf:deploy` och se till att `CLOUDFLARE_IMAGE_RESIZING=1` om du använder `next/image`.

### Fortsätt gärna med

1. Lägg till riktiga filer/bilder i `config/digital-products.json` eller via admin och klicka på “List products + generated URLs” i konfigurationsverktyget.
2. Kör `npm run lint` + `npm run test:theme` innan deploy, sedan `npm run cf:deploy` eller `npm run start` i produktion.
3. Säkerställ att Stripe-webhooken är länkad till `/api/stripe/webhook` och att `purchase_kind` metadata matchar dina produkter.
