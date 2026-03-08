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

## WordPress GraphQL Authentication

Two authentication methods are supported for WPGraphQL requests:

| Method | Variables | Header |
|--------|-----------|--------|
| **Bearer token** (JWT / plugin token) | `WORDPRESS_GRAPHQL_AUTH_TOKEN` | `Authorization: Bearer <token>` |
| **Basic auth** (WP Application Password) | `WORDPRESS_GRAPHQL_USERNAME` + `WORDPRESS_GRAPHQL_APPLICATION_PASSWORD` | `Authorization: Basic <base64>` |

If both a username and an application password are set, Basic auth takes precedence. If only a bearer token is set, it is used as-is. The helper in `src/lib/wordpressGraphqlAuth.js` handles the logic and is used by all GraphQL consumers (`client.js`, `courseAccess.js`, `health/route.js`).

**Backwards compatibility:** if `WORDPRESS_GRAPHQL_USERNAME` is set and the token in `WORDPRESS_GRAPHQL_AUTH_TOKEN` looks like an application password (contains spaces, no dots), it is automatically used as Basic auth credentials.

## Optional WPGraphQL Features

Some GraphQL fragment fields require specific WordPress plugins. They are disabled by default and can be enabled via environment variables:

| Feature | Env var | Required plugin |
|---------|---------|-----------------|
| Editor Blocks (Gutenberg block data) | `NEXT_PUBLIC_WORDPRESS_EDITOR_BLOCKS=1` | [WPGraphQL Content Blocks](https://github.com/wpengine/wp-graphql-content-blocks) |
| Event CPT | `NEXT_PUBLIC_WORDPRESS_EVENT_CPT=1` | A plugin that registers an `Event` post type in WPGraphQL |
| LearnPress courses | `NEXT_PUBLIC_WORDPRESS_LEARNPRESS=1` | LearnPress + the `Articulate-LearnPress-Stripe` mu-plugin (see `docs/wordpress/mu-plugins/`) |

When disabled, queries omit these fields entirely so they never cause schema errors. Content rendering falls back to the `content` HTML field when `editorBlocks` is unavailable.

## LearnPress Integration

When `NEXT_PUBLIC_WORDPRESS_LEARNPRESS=1` is set and the mu-plugin is installed:

- `/courses` lists all LearnPress courses with price, duration, and featured image.
- Individual course pages (`/courses/<slug>`) are rendered via the catch-all route with the app's auth/paywall flow.
- The mu-plugin registers `lp_course` and `lp_lesson` as WPGraphQL types (`LpCourse`/`LpLesson`) and adds custom fields: `price`, `priceRendered`, `duration`, and `curriculum`.
- Course access is controlled by the same mechanism as before — see [WordPress LearnPress setup](wordpress-learnpress-course-access.md).

## Diagnostics

- `NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG=1` logs every GraphQL request/response (auth mode, endpoint, HTTP status, payload) to the server console.

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
