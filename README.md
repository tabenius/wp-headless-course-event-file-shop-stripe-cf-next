# Headless WordPress Course & Shop Platform

A complete, production-ready web application that turns a WordPress website into a modern course platform with online payments, digital product sales, event registration, and access control — without changing how you use WordPress.

**In plain language:** You write your content in WordPress as usual. This app reads that content, wraps it in a fast modern website, and adds features WordPress doesn't have out of the box: user accounts, payment processing, course paywalls, a digital shop, and an admin dashboard — all deployed on Cloudflare's global network for speed and reliability.

## What This Project Does

### For content creators and course sellers

- **Sell courses and events** — Visitors must log in and pay before accessing protected content. Payment is handled securely through Stripe (the same payment processor used by Shopify, Amazon, and thousands of online businesses).
- **Sell digital products** — PDFs, videos, templates, or any downloadable file. Buyers get instant access after payment.
- **Control who sees what** — Set prices per course/event, grant free access to specific users, or make content available to everyone.
- **Admin dashboard** — A simple web interface at `/admin` where you manage products, set prices, check system health, and control user access. No coding required.
- **Dark mode** — Visitors can toggle between light and dark viewing modes.

### For developers

- **Headless WordPress architecture** — WordPress serves as a content API via WPGraphQL. The frontend is a server-rendered Next.js 15 app with React 19.
- **Auto-detection** — LearnPress courses and Event CPTs are detected at runtime via GraphQL schema introspection. No manual configuration flags needed.
- **Pluggable storage** — Course access rules, user data, and digital product entitlements can be stored locally (filesystem) or in Cloudflare KV. File uploads go to WordPress Media Library, Cloudflare R2, or any S3-compatible storage.
- **Edge deployment** — Runs on Cloudflare Workers via OpenNext for sub-50ms response times worldwide. Also works on Node.js (Vercel, Docker, bare metal).
- **Stripe integration** — Checkout sessions, webhook-based access granting, and payment confirmation flows are fully implemented.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Content | WordPress + WPGraphQL (GraphQL API) |
| Payments | Stripe Checkout + Webhooks |
| Auth | NextAuth.js (email/password + OAuth providers) |
| Deployment | Cloudflare Workers + KV (or any Node.js host) |
| File storage | WordPress Media Library, Cloudflare R2, or any S3-compatible service |

## Quick Start

### Prerequisites

- **Node.js 18+** (check with `node --version`)
- **A WordPress site** with the [WPGraphQL](https://www.wpgraphql.com/) plugin installed and activated
- **A Stripe account** (free to create at [stripe.com](https://stripe.com)) — only needed if you want to accept payments

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the example environment file and fill in your values
cp .env.example .env

# 3. Start the development server
npm run dev
```

Open `http://localhost:3000` to see your site.

### Interactive configuration

```bash
npm run config
```

This opens a guided setup tool that helps you configure your `.env` file, validate connections, set up your shop catalog, and more.

## How It Works

### The big picture

```
WordPress (CMS)          This App (Frontend)           Stripe (Payments)
┌─────────────┐         ┌──────────────────┐          ┌──────────────┐
│ Write posts  │◀─GraphQL─│  Renders pages   │──checkout─▶│ Processes    │
│ Upload media │         │  Handles auth    │◀─webhook──│ payment      │
│ Manage courses│        │  Controls access │          │              │
└─────────────┘         │  Serves shop     │          └──────────────┘
                        └──────────────────┘
                               │
                        Cloudflare Workers
                        (or any Node.js host)
```

1. You create and edit content in WordPress — pages, posts, courses, events.
2. This app fetches that content through WordPress's GraphQL API and renders it as a modern, fast website.
3. When someone tries to access a paid course or event, the app checks if they're logged in and have paid.
4. If they haven't paid, they see a paywall with a "Pay now" button that starts a Stripe checkout.
5. After successful payment, Stripe sends a webhook notification, and the app automatically grants access.
6. For digital products (in `/shop`), the same flow applies — pay, get access, download.

### Content types supported

| WordPress type | URL pattern | Features |
|---------------|-------------|----------|
| Pages | `/<slug>` | Static content, no paywall |
| Posts | `/<slug>` | Blog posts with author/date |
| LearnPress Courses | `/courses/<slug>` | Login + payment required |
| Events | `/events/<slug>` | Login + payment required |
| Shop products | `/shop` and `/shop/<slug>` | Digital file or course bundle sales |

### User flow

```
Visit page → Not logged in? → Sign in / Register
                                    ↓
                              Logged in but no access? → Pay via Stripe
                                    ↓
                              Access granted → View content / Download file
```

## Configuration Guide

All configuration is done through environment variables in your `.env` file. Below is every variable explained in detail.

### WordPress Connection (Required)

| Variable | Example | What it does |
|----------|---------|-------------|
| `NEXT_PUBLIC_WORDPRESS_URL` | `https://mysite.com` | The URL of your WordPress site. The app fetches all content from `{this URL}/graphql`. This is the only variable you absolutely must set. |

### WordPress Authentication

The app needs to authenticate with WordPress to access private content and perform admin operations. Choose **one** method:

**Option A: Application Password** (recommended)

| Variable | Example | What it does |
|----------|---------|-------------|
| `WORDPRESS_GRAPHQL_USERNAME` | `admin@mysite.com` | Your WordPress admin username or email |
| `WORDPRESS_GRAPHQL_APPLICATION_PASSWORD` | `abcd efgh ijkl mnop` | A WordPress Application Password (generated in WordPress → Users → Your Profile → Application Passwords). The spaces are part of the password. |

**Option B: Bearer Token**

| Variable | Example | What it does |
|----------|---------|-------------|
| `WORDPRESS_GRAPHQL_AUTH_TOKEN` | `eyJhbGci...` | A JWT or plugin-generated token. Used when you have a JWT auth plugin installed in WordPress. |

If both methods are configured, Application Password takes priority. The auth logic lives in `src/lib/wordpressGraphqlAuth.js`.

### Authentication & User Accounts

| Variable | Example | What it does |
|----------|---------|-------------|
| `AUTH_SECRET` | `a-long-random-string-here` | A secret key used to encrypt user sessions. Generate one with `openssl rand -base64 32`. Keep this secret — if it leaks, anyone can forge login sessions. |
| `ADMIN_EMAILS` | `alice@example.com,bob@example.com` | Comma-separated list of email addresses that can log into the admin dashboard at `/admin`. |
| `ADMIN_PASSWORDS` | `password-for-alice,password-for-bob` | Matching passwords for each admin email (same order). These are only for the admin UI — regular users log in through the normal auth flow. |

### OAuth Providers (Optional)

Let users sign in with their existing accounts. Only configure the ones you want to offer. Each provider requires you to create an app in their developer console and paste the credentials here.

| Provider | Variables needed |
|----------|----------------|
| Google | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Facebook | `AUTH_FACEBOOK_ID`, `AUTH_FACEBOOK_SECRET` |
| Microsoft | `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_TENANT` (use `common` for any Microsoft account) |
| Apple | `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET` |

### Stripe Payments

| Variable | Example | What it does |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` | Your Stripe API key. Found in the [Stripe Dashboard](https://dashboard.stripe.com/apikeys) under Developers → API keys. Use `sk_test_` keys during development. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Verifies that webhook notifications genuinely come from Stripe. Create a webhook endpoint in Stripe Dashboard → Developers → Webhooks, point it to `https://your-domain/api/stripe/webhook`, listen for `checkout.session.completed`. |

**Important:** Without the webhook, payments will succeed in Stripe but the app won't know to grant access. The webhook is what closes the loop.

### Course & Access Configuration

| Variable | Example | What it does |
|----------|---------|-------------|
| `COURSE_ACCESS_BACKEND` | `wordpress` | Where course access rules are stored. `wordpress` uses the WPGraphQL mu-plugin (recommended for production). Leave unset to use local/KV storage. |
| `COURSE_ACCESS_STORE` | `cloudflare` or `local` | Where to persist access data. `cloudflare` uses Cloudflare KV (recommended for production). `local` uses the filesystem (fine for development). |
| `USER_STORE_BACKEND` | `cloudflare` or `local` | Same choice for user registration data. |
| `DIGITAL_ACCESS_STORE` | `cloudflare` or `local` | Same choice for tracking which users have purchased which digital products. |
| `DEFAULT_COURSE_FEE_CURRENCY` | `SEK` | Default currency for course prices. Uses [ISO 4217](https://en.wikipedia.org/wiki/ISO_4217) codes (SEK, USD, EUR, GBP, etc.). Individual courses can override this in the admin UI. |

### Cloudflare KV (Required for Cloudflare deployment)

Cloudflare KV is a key-value store that holds your access rules, user data, and product entitlements when deployed to Cloudflare Workers.

| Variable | Example | What it does |
|----------|---------|-------------|
| `CF_ACCOUNT_ID` | `abc123def456` | Your Cloudflare account ID. Found in the Cloudflare dashboard URL or under Account Home → right sidebar. |
| `CF_API_TOKEN` | `bearer-token-here` | An API token with KV read/write permissions. Create one at Cloudflare Dashboard → My Profile → API Tokens. |
| `CF_KV_NAMESPACE_ID` | `0ac8a81b4e40...` | The ID of your KV namespace. Create one with `npx wrangler kv namespace create COURSE_ACCESS`. |
| `CF_KV_KEY` | `course-access` | The KV key prefix for course access data. Default: `course-access`. |
| `CF_USERS_KV_KEY` | `users` | The KV key prefix for user data. Default: `users`. |
| `CF_DIGITAL_ACCESS_KV_KEY` | `digital-access` | The KV key prefix for digital product purchases. Default: `digital-access`. |

### File Upload Backend

Controls where uploaded images and files are stored when you use the upload buttons in the admin UI.

| Variable | Value | What it does |
|----------|-------|-------------|
| `UPLOAD_BACKEND` | `wordpress` | **(Default)** Uploads to your WordPress Media Library. No extra setup needed. File size limit depends on your WordPress/PHP configuration (typically 2–64 MB). |
| `UPLOAD_BACKEND` | `r2` | Uploads to **Cloudflare R2** — S3-compatible object storage with a generous free tier (10 GB storage, 10 million reads/month, no egress fees). Good for larger files. |
| `UPLOAD_BACKEND` | `s3` | Uploads to **any S3-compatible storage** — AWS S3, DigitalOcean Spaces, Backblaze B2, MinIO, Wasabi, etc. |

**Additional variables for R2 or S3:**

| Variable | Example | What it does |
|----------|---------|-------------|
| `S3_ACCESS_KEY_ID` | `access-key-here` | Your S3/R2 access key. For R2, create one in Cloudflare Dashboard → R2 → Manage R2 API Tokens. |
| `S3_SECRET_ACCESS_KEY` | `secret-key-here` | The matching secret key. |
| `S3_BUCKET_NAME` | `my-uploads` | The name of your storage bucket. |
| `S3_PUBLIC_URL` | `https://pub-xxx.r2.dev` | The public URL where uploaded files can be accessed. For R2, enable "Public access" on your bucket to get this URL. |
| `S3_REGION` | `auto` | The AWS region. Use `auto` for R2 (it's always automatic). For AWS S3, use your bucket's region (e.g., `eu-north-1`). |
| `S3_ENDPOINT` | `https://s3.amazonaws.com` | The S3 API endpoint. **Only needed for `UPLOAD_BACKEND=s3`** — R2 derives this automatically from `CF_ACCOUNT_ID`. |
| `S3_FORCE_PATH_STYLE` | `0` or `1` | Set to `1` for services that require path-style URLs (e.g., MinIO). Default: `0`. |

For backwards compatibility, the R2-specific names `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_BUCKET_NAME`, and `CF_R2_PUBLIC_URL` also work.

### Image Optimization (Optional)

| Variable | Example | What it does |
|----------|---------|-------------|
| `CLOUDFLARE_IMAGE_RESIZING` | `1` | Enables Cloudflare Image Resizing, which automatically optimizes and resizes images on the fly. Requires a Cloudflare Pro plan with a custom domain. |
| `CLOUDFLARE_IMAGE_RESIZING_DOMAIN` | `www.mysite.com` | The domain with Image Resizing enabled. Required when your app runs on a `workers.dev` subdomain (which doesn't support Image Resizing) but you have a custom domain that does. |

### Debugging

| Variable | Value | What it does |
|----------|-------|-------------|
| `NEXT_PUBLIC_WORDPRESS_GRAPHQL_DEBUG` | `1` | Logs every GraphQL request and response to the server console — useful for troubleshooting WordPress connection issues. Shows auth mode, endpoint, HTTP status, and payload. |

## WordPress Setup

### Required Plugin

| Plugin | Why you need it |
|--------|----------------|
| [WPGraphQL](https://www.wpgraphql.com/) | This is the bridge between WordPress and this app. It turns your WordPress content into a GraphQL API that the app reads. **Without this, nothing works.** Install it from Plugins → Add New in WordPress. |

### Recommended Plugins

These add extra features. All are optional and the app detects their presence automatically.

| Plugin | What it adds | How to tell it's working |
|--------|-------------|-------------------------|
| [LearnPress](https://wordpress.org/plugins/learnpress/) | Course management (lessons, quizzes, curriculum) | The `/courses` page shows your LearnPress courses |
| Articulate-LearnPress-Stripe mu-plugin | Exposes LearnPress data to GraphQL (prices, durations, curricula) | Course pages show pricing and lesson lists. Copy from `docs/wordpress/mu-plugins/` to `wp-content/mu-plugins/`. |
| [WPGraphQL Content Blocks](https://github.com/wpengine/wp-graphql-content-blocks) | Renders WordPress block editor content with proper structure instead of raw HTML | Pages look pixel-perfect instead of unstyled HTML. Enable with `NEXT_PUBLIC_WORDPRESS_EDITOR_BLOCKS=1`. |
| An Event CPT plugin | Event pages with date/location fields | Event pages appear with structured data. Works with The Events Calendar + WPGraphQL extension or similar. |
| [WebP Express](https://wordpress.org/plugins/webp-express/) or [ShortPixel](https://wordpress.org/plugins/shortpixel-image-optimiser/) | Smaller image files | Faster page loads — images are converted to modern formats before serving. |

### Auto-Detection

The app checks your WordPress GraphQL schema at startup for the `Event` and `LpCourse` types. If they exist, the app includes the relevant queries automatically. If they don't exist, the app skips them — no errors, no broken pages. This means you never need to toggle feature flags when adding or removing plugins.

## Admin Dashboard

Access the admin UI at `/admin/login`. Sign in with the credentials from `ADMIN_EMAILS` / `ADMIN_PASSWORDS`.

### What you can do

- **Shop products** — Add, edit, and remove products. Upload images and files directly (stored in WordPress Media Library, R2, or S3 depending on your `UPLOAD_BACKEND`). Set prices, descriptions, and link products to courses or downloadable files.
- **Course access** — Select a course, set its price, and manage which users have access. You can grant free access to specific email addresses.
- **Health check** — Run a diagnostic that verifies your WordPress connection, Stripe keys, and storage backends are all working.

## Deployment

### Cloudflare Workers (Recommended)

The app is optimized for Cloudflare Workers, which gives you global edge deployment with sub-50ms response times.

```bash
# Build and deploy
npm run cf:deploy
```

**Requirements:**
- A Cloudflare account (free plan works for Workers)
- Wrangler CLI (`npx wrangler` — included in dev dependencies)
- KV namespace created (see Cloudflare KV section above)
- Environment secrets set via `npx wrangler secret put VARIABLE_NAME`

**Configuration:** See `wrangler.jsonc` for the Workers configuration. Public (non-secret) variables go in the `vars` section. Secrets (API keys, passwords) must be set via `wrangler secret put`.

**Preview locally before deploying:**

```bash
npm run cf:preview
```

### Other Hosting (Vercel, Docker, Node.js)

The app is a standard Next.js 15 application and works anywhere Next.js runs:

```bash
npm run build
npm run start
```

When not on Cloudflare, set `COURSE_ACCESS_STORE=local`, `USER_STORE_BACKEND=local`, and `DIGITAL_ACCESS_STORE=local` to use filesystem storage instead of KV.

## Scripts Reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start local development server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Run the production build locally |
| `npm run lint` | Check code for errors and style issues |
| `npm run prettier` | Auto-format all source code |
| `npm run config` | Interactive configuration wizard |
| `npm run theme:css` | Regenerate CSS variables from `theme.json` (runs automatically before dev/build) |
| `npm run cf:build` | Build for Cloudflare Workers |
| `npm run cf:preview` | Build and preview locally with Wrangler |
| `npm run cf:deploy` | Build and deploy to Cloudflare Workers |

## Project Structure

```
src/
├── app/                    # Next.js routes and pages
│   ├── [...uri]/page.js    # Catch-all route — renders any WordPress page/post/course/event
│   ├── admin/              # Admin login and dashboard
│   ├── api/                # API routes (Stripe, auth, uploads, downloads)
│   ├── auth/               # Sign in and registration pages
│   ├── blog/               # Blog listing
│   ├── courses/            # Course listing
│   ├── shop/               # Digital product shop
│   └── layout.js           # Root layout (header, footer, fonts, metadata)
├── components/             # React components
│   ├── admin/              # Admin dashboard UI
│   ├── blocks/             # WordPress Gutenberg block renderers
│   ├── layout/             # Header, footer, navigation, dark mode toggle
│   ├── shop/               # Shop product cards and detail views
│   └── single/             # Single post/page/course/event templates
├── lib/                    # Shared logic
│   ├── client.js           # GraphQL client with caching and introspection
│   ├── courseAccess.js      # Course access check and granting
│   ├── digitalProducts.js  # Product catalog management
│   ├── s3upload.js          # S3/R2 file upload client
│   ├── stripe.js            # Stripe checkout and session handling
│   └── site.js              # Site configuration (from site.json)
├── config/                 # Data files
│   └── digital-products.json  # Product catalog
├── site.json               # Site branding, navigation, and metadata
├── theme.json              # Color palette and typography
└── wrangler.jsonc          # Cloudflare Workers configuration
```

## Documentation

| Document | Language | Contents |
|----------|----------|----------|
| [English guide](docs/README.en.md) | English | Detailed technical reference |
| [Svensk guide](docs/README.sv.md) | Svenska | Detaljerad teknisk referens |
| [Cloudflare deploy](docs/cloudflare-workers-deploy.md) | Svenska | Step-by-step Cloudflare Workers deployment |
| [WordPress LearnPress setup](docs/wordpress-learnpress-course-access.md) | English | WordPress plugin installation and configuration |

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
