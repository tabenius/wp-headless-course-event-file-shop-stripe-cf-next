# Dokumentation (Svenska)

## Översikt

Detta projekt kombinerar Next.js, WordPress/WPGraphQL och Stripe för att skydda kursinnehåll bakom inloggning och betalning.

## Huvudflöden

1. Besökaren öppnar en kurssida.
2. Om användaren inte är inloggad visas inloggning.
3. Om användaren saknar åtkomst visas paywall.
4. Stripe Checkout genomför betalning.
5. Webhook ger kursbehörighet automatiskt.
6. Användaren kan läsa skyddat kursinnehåll.

## Viktig konfiguration

- `NEXT_PUBLIC_WORDPRESS_URL`: WordPress-URL för GraphQL-innehåll.
- `COURSE_ACCESS_BACKEND=wordpress`: använder WordPress/LearnPress-backend.
- `WORDPRESS_GRAPHQL_AUTH_TOKEN`: token för admin-mutationer.
- `AUTH_SECRET`: signerar auth/session.
- `ADMIN_USERNAME` och `ADMIN_PASSWORD`: inloggning till admin-UI.
- `STRIPE_SECRET_KEY` och `STRIPE_WEBHOOK_SECRET`: Stripe-betalningar.
- `COURSE_ACCESS_STORE` och `USER_STORE_BACKEND`: lokal lagring eller Cloudflare KV.

## Börja här

- Projektöversikt: `README.md`
- WordPress/LearnPress-setup: `docs/wordpress-learnpress-course-access.md`
- Cloudflare-deploy: `docs/cloudflare-workers-deploy.md`

## Köra lokalt

```bash
npm install
cp .env.example .env
npm run dev
```
