# XTAS Course Access (Next.js + WordPress + Stripe)

A Next.js 15 application for WordPress/WPGraphQL content with authenticated course access, Stripe checkout, and optional Cloudflare Workers deployment.

## Features

- WordPress content via GraphQL (`NEXT_PUBLIC_WORDPRESS_URL`)
- Auth flows with email/password and optional OAuth providers
- Course paywall and entitlement checks
- Stripe Checkout + webhook-based access granting
- Admin UI for access rules and health checks
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
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `COURSE_ACCESS_BACKEND`
- `WORDPRESS_GRAPHQL_AUTH_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

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
