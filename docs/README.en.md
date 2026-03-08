# Documentation (English)

## Overview

This project combines Next.js, WordPress/WPGraphQL, and Stripe to protect course content behind login and payment.

## Core flows

1. Visitor opens a course page.
2. If unauthenticated, the app requests sign-in.
3. If authenticated but missing access, a paywall is shown.
4. Stripe checkout completes payment.
5. Webhook grants access entitlement.
6. User can read protected course content.

## Main configuration

- `NEXT_PUBLIC_WORDPRESS_URL`: WordPress base URL for GraphQL content.
- `COURSE_ACCESS_BACKEND=wordpress`: use WordPress/LearnPress integration.
- `WORDPRESS_GRAPHQL_AUTH_TOKEN`: bearer token for privileged admin mutations, or use `WORDPRESS_GRAPHQL_USERNAME` + `WORDPRESS_GRAPHQL_APPLICATION_PASSWORD` for WordPress Application Password auth.
- `AUTH_SECRET`: signs auth/session state.
- `ADMIN_EMAILS` and `ADMIN_PASSWORDS`: comma-separated admin login pairs for the admin UI.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: Stripe payments.
- `COURSE_ACCESS_STORE` and `USER_STORE_BACKEND`: local vs Cloudflare KV state.
- `DIGITAL_ACCESS_STORE` and `CF_DIGITAL_ACCESS_KV_KEY`: storage for purchased digital file access.

## Digital files

Digital products are configured in `config/digital-products.json`:

- `name`: product name shown in UI/Stripe.
- `slug`: auto-generated/editable URL slug.
- `description`: optional storefront text.
- `imageUrl`: optional product image URL.
- `type`: `digital_file` or `course`.
- `priceCents` and `currency`: payment amount.
- `fileUrl`: downloadable file URL (HTTP/HTTPS) for digital files.
- `courseUri`: linked course path for course products.
- `active`: controls storefront visibility.

Storefront route: `/shop` and product route: `/shop/[slug]`.
## Where to start

- Project setup: `README.md`
- WordPress/LearnPress backend: `docs/wordpress-learnpress-course-access.md`
- Cloudflare deployment: `docs/cloudflare-workers-deploy.md`

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```
