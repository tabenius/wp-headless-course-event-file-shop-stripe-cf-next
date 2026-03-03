# WordPress + LearnPress Course Access Setup

This app now supports two backends for course access:

- `COURSE_ACCESS_BACKEND=wordpress` (recommended for production with WP/LearnPress)
- default local backend (Cloudflare KV / local file fallback)

## 1) Install the WPGraphQL access plugin

Copy:

- `docs/wordpress/mu-plugins/Articulate-LearnPress-Stripe.php`

to your WordPress:

- `wp-content/mu-plugins/Articulate-LearnPress-Stripe.php`

Requirements:

- WPGraphQL plugin installed/enabled.
- LearnPress optional (the plugin also checks LearnPress enrollment when available).

## 2) Configure this Next.js app

Set environment variables:

```bash
COURSE_ACCESS_BACKEND=wordpress
NEXT_PUBLIC_WORDPRESS_URL=https://your-wordpress-site.com
WORDPRESS_GRAPHQL_AUTH_TOKEN=<admin-capable-jwt-or-app-token>
AUTH_SECRET=<strong-random-string>
ADMIN_USERNAME=<admin-ui-user>
ADMIN_PASSWORD=<admin-ui-password>
```

Notes:

- The admin UI calls GraphQL mutations `setCourseAccessRule` / `grantCourseAccess` and needs privileged auth.
- `WORDPRESS_GRAPHQL_AUTH_TOKEN` should map to a user with `manage_options`.

## 3) Stripe (optional but recommended)

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
DEFAULT_COURSE_FEE_CENTS=4999
DEFAULT_COURSE_FEE_CURRENCY=usd
```

Configure Stripe webhook:

- Endpoint: `https://your-next-app.com/api/stripe/webhook`
- Event: `checkout.session.completed`

This webhook grants access automatically after successful payment.

## 4) OAuth (optional)

Enable any provider by setting its env vars:

- Google: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- Apple: `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET`
- Microsoft: `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_TENANT`
- Facebook: `AUTH_FACEBOOK_ID`, `AUTH_FACEBOOK_SECRET`

## 5) Admin usage

1. Go to `/admin/login`.
2. Sign in with `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
3. Choose course URI, fee, and allowed users.
4. Save rules.
5. Run **Integration Health Check** in `/admin` to verify WordPress GraphQL + Stripe + auth env.

Course pages (`.../Course` typenames) require login and access entitlement.
