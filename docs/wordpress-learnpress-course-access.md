# WordPress + LearnPress Course Access Setup

This guide explains how to connect your WordPress/LearnPress installation to this Next.js app for course access control and payments.

## What This Does

Normally, LearnPress courses live entirely inside WordPress. This integration lets the Next.js app:

- **List courses** at `/courses` with prices, durations, and featured images
- **Protect course content** behind login and payment
- **Process payments via Stripe** and automatically grant access after purchase
- **Manage access** through the admin dashboard — set prices, grant free access, etc.

## Prerequisites

- WordPress with [WPGraphQL](https://www.wpgraphql.com/) installed and activated
- [LearnPress](https://wordpress.org/plugins/learnpress/) installed and activated (optional but recommended — the system works without it for manual course management)
- Admin access to your WordPress installation (to upload the mu-plugin)

## Step 1: Install the WPGraphQL Course Access Plugin

Copy the mu-plugin file to your WordPress installation:

**Source:** `docs/wordpress/mu-plugins/Articulate-LearnPress-Stripe.php`
**Destination:** `wp-content/mu-plugins/Articulate-LearnPress-Stripe.php`

**What is a mu-plugin?** "mu" stands for "must use". Files in `wp-content/mu-plugins/` are loaded automatically by WordPress — you don't need to activate them in the plugin admin. They can't be accidentally deactivated.

**What this plugin does:**

- Registers `lp_course` and `lp_lesson` as WPGraphQL types (`LpCourse` and `LpLesson`)
- Exposes custom fields: `price`, `priceRendered` (formatted with currency), `duration`, and `curriculum` (list of lessons)
- Adds GraphQL mutations for granting/revoking course access
- Checks LearnPress enrollment when available for access control

## Step 2: Configure the Next.js App

Set these environment variables in your `.env` file:

```bash
# Tell the app to use WordPress for course access management
COURSE_ACCESS_BACKEND=wordpress

# Your WordPress site URL
NEXT_PUBLIC_WORDPRESS_URL=https://your-wordpress-site.com

# WordPress authentication (choose one method)
# Option A: Application Password (recommended)
WORDPRESS_GRAPHQL_USERNAME=admin@your-site.com
WORDPRESS_GRAPHQL_APPLICATION_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# Option B: Bearer token (JWT plugin)
# WORDPRESS_GRAPHQL_AUTH_TOKEN=eyJhbGci...

# Session encryption key
AUTH_SECRET=generate-a-random-string-here

# Admin credentials for the /admin dashboard
ADMIN_EMAILS=your-email@example.com
ADMIN_PASSWORDS=your-admin-password
```

**Important:** The WordPress auth credentials must belong to a user with `manage_options` capability (typically an Administrator role). The app uses these credentials for GraphQL mutations like `setCourseAccessRule` and `grantCourseAccess`.

### How to create a WordPress Application Password

1. Log into your WordPress admin
2. Go to **Users → Your Profile**
3. Scroll down to **Application Passwords**
4. Enter a name (e.g., "Next.js App") and click "Add New Application Password"
5. Copy the generated password (shown once, with spaces — the spaces are part of the password)

## Step 3: Set Up Stripe (Optional but Recommended)

Without Stripe, you can still manage access manually (grant/revoke via admin UI). With Stripe, payment and access granting happen automatically.

```bash
# Stripe API keys (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...        # Use sk_test_ for development, sk_live_ for production
STRIPE_WEBHOOK_SECRET=whsec_...      # From Stripe webhook setup (see below)

# Default currency for course prices (ISO 4217 code)
DEFAULT_COURSE_FEE_CURRENCY=SEK
```

### Create the Stripe Webhook

The webhook is how Stripe tells your app that a payment succeeded:

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. **Endpoint URL:** `https://your-nextjs-domain.com/api/stripe/webhook`
4. **Events to send:** Select `checkout.session.completed`
5. Click "Add endpoint"
6. On the endpoint detail page, reveal the **Signing secret** (starts with `whsec_`)
7. Copy it and set as `STRIPE_WEBHOOK_SECRET` in your `.env`

**For local development**, use the Stripe CLI instead:

```bash
# Install: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:3000/api/stripe/webhook
# The CLI will show a temporary webhook secret — use that as STRIPE_WEBHOOK_SECRET
```

## Step 4: Set Up OAuth Providers (Optional)

Let users sign in with Google, Facebook, Microsoft, or Apple accounts instead of email/password. You only need to set up the ones you want to offer.

| Provider | Variables | Where to get credentials |
|----------|----------|-------------------------|
| Google | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth client ID |
| Facebook | `AUTH_FACEBOOK_ID`, `AUTH_FACEBOOK_SECRET` | [Facebook Developers](https://developers.facebook.com/) → My Apps → Create App → Set up Facebook Login |
| Microsoft | `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_TENANT` | [Azure Portal](https://portal.azure.com/) → App registrations → New registration. Use `common` as tenant for any Microsoft account. |
| Apple | `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET` | [Apple Developer](https://developer.apple.com/) → Certificates, Identifiers & Profiles → Services IDs |

For each provider, set the OAuth redirect URL to: `https://your-domain.com/api/auth/callback/{provider}`

## Step 5: Using the Admin Dashboard

1. Go to `https://your-domain.com/admin/login`
2. Sign in with the email/password from `ADMIN_EMAILS`/`ADMIN_PASSWORDS`
3. The dashboard gives you:

### Integration Health Check

Click **"Kör kontroll"** (Run check) to verify all connections are working:
- WordPress GraphQL endpoint reachable
- Authentication working
- Stripe API key valid
- KV/storage accessible

### Course Access Management

1. **Select a course** from the dropdown (populated from WordPress/LearnPress)
2. **Set the price** — mandatory, but can be 0 for free courses
3. **Set the currency** — defaults to SEK, uppercase ISO 4217 code
4. **Manage allowed users** — check/uncheck registered users, or add email addresses manually
5. Click **"Spara åtkomstinställningar"** (Save access settings)

### Shop Products

See the [main README](../README.md#admin-dashboard) for shop product management.

## How Access Control Works

The access check follows this priority:

1. **WordPress/LearnPress enrollment** — if the user is enrolled in the course via LearnPress, they have access
2. **Explicit access grant** — if the admin has granted access to the user's email for this course URI
3. **Stripe payment** — if the user just completed a Stripe checkout for this course (verified via session metadata), access is granted automatically

When a user pays via Stripe:
- The checkout session includes metadata: `course_uri`, `user_email`
- On success, Stripe sends a `checkout.session.completed` webhook
- The app verifies: payment status is "paid", email matches, course URI matches
- Access is granted via the configured backend (WordPress mutation or KV storage)
- The user is redirected back to the course page with access

## Troubleshooting

| Problem | Likely cause | Solution |
|---------|-------------|---------|
| Courses don't appear at `/courses` | LearnPress or mu-plugin not installed | Verify the mu-plugin is in `wp-content/mu-plugins/` and LearnPress is active |
| "Schema error" in GraphQL | Outdated mu-plugin | Re-copy the latest mu-plugin from `docs/wordpress/mu-plugins/` |
| Payment succeeds but no access | Webhook not configured | Check Stripe Dashboard → Webhooks for delivery failures |
| Admin can't save course settings | Insufficient WordPress permissions | Ensure the WordPress user has `manage_options` capability |
| Health check shows errors | Missing or incorrect env vars | Verify each variable in `.env` matches the expected format |

## Related Documentation

- [Main README](../README.md) — full configuration guide
- [Cloudflare deployment](cloudflare-workers-deploy.md) — deploying to Workers
- [English technical reference](README.en.md) — architecture and internals
