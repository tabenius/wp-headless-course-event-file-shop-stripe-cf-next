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
- `ADMIN_EMAILS` och `ADMIN_PASSWORDS`: kommaseparerade admin-par för inloggning till admin-UI.
- `STRIPE_SECRET_KEY` och `STRIPE_WEBHOOK_SECRET`: Stripe-betalningar.
- `COURSE_ACCESS_STORE` och `USER_STORE_BACKEND`: lokal lagring eller Cloudflare KV.
- `DIGITAL_ACCESS_STORE` och `CF_DIGITAL_ACCESS_KV_KEY`: lagring av åtkomst till köpta digitala filer.

## Digitala filer

Digitala produkter konfigureras i `config/digital-products.json`:

- `name`: produktnamn i UI/Stripe.
- `slug`: auto-genererad/redigerbar URL-slug.
- `description`: valfri text i butiken.
- `imageUrl`: valfri bild-URL för produkten.
- `type`: `digital_file` eller `course`.
- `priceCents` och `currency`: betalningsbelopp.
- `fileUrl`: nedladdnings-URL (HTTP/HTTPS) för digitala filer.
- `courseUri`: kursens path för kursprodukter.
- `active`: styr om produkten visas i butiken.

Butikssida: `/shop` och produktsida: `/shop/[slug]`.

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
