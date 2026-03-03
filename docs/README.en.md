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
- `WORDPRESS_GRAPHQL_AUTH_TOKEN`: token for privileged admin mutations.
- `AUTH_SECRET`: signs auth/session state.
- `ADMIN_USERNAME` and `ADMIN_PASSWORD`: admin UI login.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: Stripe payments.
- `COURSE_ACCESS_STORE` and `USER_STORE_BACKEND`: local vs Cloudflare KV state.

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
