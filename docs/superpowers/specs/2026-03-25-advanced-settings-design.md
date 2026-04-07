# Advanced Settings (Three-Tier Admin Menu) — Design Spec

## Goal

Reorganise the admin settings into three progressive-disclosure tiers — **Basic**, **Advanced**, and **Developer** — so that users aged 40-60 see only everyday controls by default and can drill into technical panels when needed. Add three new capabilities: WooCommerce legacy webhook proxy, WooCommerce REST API integration for receipts/tax, and Stripe key overrides via Cloudflare KV.

## Current Architecture

### Tab Structure (AdminDashboard.js)

The admin uses a flat tab bar with seven base tabs rendered from `ADMIN_TABS_BASE`:

| Tab        | Component              | Contains                                                                      |
| ---------- | ---------------------- | ----------------------------------------------------------------------------- |
| `welcome`  | `AdminWelcomeTab`      | Onboarding story, revision badge                                              |
| `sales`    | `AdminSalesTab`        | Payment list, receipt download, Stripe status                                 |
| `media`    | `AdminMediaLibraryTab` | Upload, media library, derivation editor                                      |
| `products` | `AdminProductsTab`     | Shop products, course management, user access                                 |
| `support`  | `AdminSupportTab`      | Support tickets                                                               |
| `style`    | `AdminStyleTab`        | Site colours, fonts, CTA button style                                         |
| `info`     | `AdminInfoHubTab`      | Sub-sections: Overview, Stats, Health check, Storage, Docs, Beta & monitoring |
| `chat`     | `ChatPanel`            | Beta AI assistant                                                             |

The `AdminInfoHubTab` has its own internal section nav (`overview`, `stats`, `health`, `storage`, `docs`, `beta`). Inside those sub-sections live the panels that will move into the Advanced / Developer tiers:

- **Storage sub-section** → `StorageConfigPanel` (backend selector, upload destination, env-status table)
- **Health sub-section** → `AdminConnectorsTab` (health check results, Stripe webhook URL, RAGBAZ plugin download)
- **Beta sub-section** → Chat beta toggle, GraphQL availability monitoring, dead-links monitor

### Cloudflare KV Pattern (`src/lib/cloudflareKv.js`)

Settings are stored as JSON blobs keyed by a string. The module exposes:

```
readCloudflareKvJson(key)   → JSON | null
writeCloudflareKvJson(key, value, { expirationTtl? })
deleteCloudflareKv(key)
```

Config is driven by `CLOUDFLARE_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_KV_NAMESPACE_ID` env vars. Existing usage examples: `chat_history:*`, course-access state, shop settings, style presets.

### Stripe Webhook (`src/app/api/stripe/webhook/route.js`)

Handles `checkout.session.completed` events. After signature verification the handler:

1. Grants course / digital-product access
2. Sends a purchase-confirmation email

The proxy forwarding hook will be inserted after step 2.

---

## Tier Design

### Tier Definitions

| Tier          | Visibility                                                  | Target user                       | Icon hint        |
| ------------- | ----------------------------------------------------------- | --------------------------------- | ---------------- |
| **Basic**     | Always visible — the default tab bar                        | Shop owner doing daily work       | Normal tab icons |
| **Advanced**  | Behind a `...` (ellipsis) overflow button in the tab bar    | Admin who configures integrations | Gear icon        |
| **Developer** | Nested inside Advanced, behind a `< > Utvecklarläge` toggle | Developer / site builder          | Code brackets    |

### Classification of Settings

#### Basic (always visible)

These tabs remain in the main `ADMIN_TABS_BASE` array, unchanged:

- **Media** — upload, media library, derivation editor
- **Products** — shop products, course management, user access
- **Sales** — payment history, receipt download
- **Support** — support tickets
- **Style** — site design tokens
- **Welcome** — onboarding

The existing **Info** tab keeps its Overview, Stats, and Docs sub-sections as Basic content.

#### Advanced (ellipsis submenu)

| Setting                                         | Current location                      | Description (Swedish)                                                                                 |
| ----------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| R2 connection panel                             | Info → Storage                        | "S3/R2-uppkopplingsinformation och klientinställningar."                                              |
| Backend selector (storage + upload destination) | Info → Storage → `StorageConfigPanel` | "Välj lagringsbackend (Cloudflare KV, WordPress, lokal fil) och uppladdningsmål (WordPress, R2, S3)." |
| Health check / connectors                       | Info → Health                         | "Hälsokontroll av WordPress-anslutning, Stripe-webhook och RAGBAZ-plugin."                            |
| WooCommerce webhook proxy                       | **NEW**                               | "Vidarebefordra betalningshändelser till WooCommerce."                                                |
| Beta features (chat toggle, GraphQL monitor)    | Info → Beta                           | "Experimentella funktioner och övervakning."                                                          |

#### Developer (nested inside Advanced)

| Setting                                 | Current location                                   | Description (Swedish)                                                                         |
| --------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Raw credentials / env status table      | Info → Storage → `StorageConfigPanel` (env-status) | "Visa alla konfigurerade miljövariabler och deras status."                                    |
| Stripe key overrides                    | **NEW**                                            | "Skriv över STRIPE_SECRET_KEY och NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY via admin-gränssnittet." |
| WooCommerce REST API integration        | **NEW**                                            | "Skicka kvitton och läs momsinformation från WooCommerce REST API."                           |
| API endpoints reference                 | Info → Docs                                        | "Lista över alla API-endpoints i systemet."                                                   |
| Debug tools (client log panel, sandbox) | Info → Beta → `AdminSandboxTab`                    | "Klientloggar, sandbox-körning och felsökningsverktyg."                                       |

---

## UI Component Design

### `AdminSettingsTieredMenu`

A new component that replaces the "Info" tab's internal sub-nav. The three tiers are presented as a progressive-disclosure accordion / submenu.

#### Tab Bar Change

The main tab bar in `AdminDashboard.js` gets a new overflow button after the last visible tab:

```
[ Welcome ] [ Sales ] [ Media ] [ Products ] [ Support ] [ Style ] [ Info ] [ ··· ]
```

Clicking `···` opens a floating panel (popover, not a new page) listing Advanced settings as clickable rows. Each row navigates to a panel rendered in the main content area.

The popover uses a two-level structure:

```
┌────────────────────────────────────┐
│  Avancerade inställningar          │
│ ─────────────────────────────────  │
│  ▸ R2-anslutning                   │
│  ▸ Backend & lagring               │
│  ▸ Hälsokontroll                   │
│  ▸ WooCommerce webhook-proxy       │
│  ▸ Betafunktioner                  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ < > Utvecklarläge            │  │
│  └──────────────────────────────┘  │
│    ▸ Miljövariabler (env)          │
│    ▸ Stripe-nycklar                │
│    ▸ WooCommerce REST API          │
│    ▸ API-endpoints                 │
│    ▸ Felsökningsverktyg            │
└────────────────────────────────────┘
```

The "Utvecklarläge" row is a toggle button. When collapsed (default), the Developer items below it are hidden. This prevents accidental access to destructive or confusing panels.

#### Accessibility

- The popover is keyboard-navigable (arrow keys, Enter, Escape)
- Focus trap within the popover when open
- `aria-haspopup="menu"` on the `···` button
- Developer items are `aria-hidden` when the toggle is collapsed

#### State Persistence

- Which tier is expanded is stored in `localStorage` key `ragbaz_admin_tier_expanded` (values: `"none"` | `"advanced"` | `"developer"`)
- Active setting panel is reflected in the URL hash: `#/settings/r2`, `#/settings/wc-proxy`, `#/settings/stripe-keys`, etc.

### Component Tree

```
AdminDashboard.js
  └── AdminHeader.js
  │     └── TieredMenuButton (the ··· button + popover)
  │           ├── AdvancedMenuSection
  │           └── DeveloperMenuSection (collapsible)
  └── AdminSettingsPanel.js (new — renders whichever settings panel is active)
        ├── R2ConnectionPanel (existing, moved)
        ├── StorageConfigPanel (existing, extracted)
        ├── AdminConnectorsTab (existing, moved)
        ├── WcProxySettingsPanel (new)
        ├── BetaFeaturesPanel (extracted from AdminInfoHubTab)
        ├── EnvStatusPanel (new — extracted from StorageConfigPanel)
        ├── StripeKeyOverridePanel (new)
        ├── WcRestApiPanel (new)
        ├── ApiEndpointsPanel (extracted from DocsPanel)
        └── DebugToolsPanel (extracted — AdminSandboxTab + client logs)
```

---

## New Feature: WooCommerce Legacy Webhook Proxy

### Admin UI (Advanced tier)

Component: `WcProxySettingsPanel`

```
┌───────────────────────────────────────────────────────────────┐
│  WooCommerce Webhook-proxy                                    │
│                                                               │
│  [Toggle] Vidarebefordra betalningshändelser till WooCommerce │
│                                                               │
│  Webhook-URL:                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ https://www.xtas.nu/?wc-api=wc_stripe                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Om du har automatiseringar i WooCommerce (t.ex. orderstatus, │
│  lagerhantering, e-postsekvenser) kan du aktivera detta för   │
│  att skicka betalningsbekräftelser vidare till din gamla       │
│  WooCommerce-webhook också.                                   │
│                                                               │
│  [ Spara ]                                                    │
└───────────────────────────────────────────────────────────────┘
```

### KV Storage

Key: `settings:wc_proxy`

```json
{
  "enabled": true,
  "url": "https://www.xtas.nu/?wc-api=wc_stripe",
  "updatedAt": "2026-03-25T12:00:00Z"
}
```

Read via `readCloudflareKvJson("settings:wc_proxy")`. Write via `writeCloudflareKvJson("settings:wc_proxy", value)`.

### API Endpoint

`POST /api/admin/settings/wc-proxy` — saves the toggle + URL to KV. Requires admin auth.

`GET /api/admin/settings/wc-proxy` — reads the current value for the UI.

### Webhook Forwarding Logic

In `src/app/api/stripe/webhook/route.js`, after the email-sending block (line ~125), add:

```
// ── WooCommerce proxy forwarding ──
try {
  const wcProxy = await readCloudflareKvJson("settings:wc_proxy");
  if (wcProxy?.enabled && wcProxy?.url) {
    const proxyRes = await fetch(wcProxy.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Source": "ragbaz-stripe-webhook",
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    console.info(
      `WC proxy forwarded to ${wcProxy.url} — status ${proxyRes.status}`
    );
  }
} catch (proxyErr) {
  // Non-fatal — log but don't fail the webhook
  console.error("WC proxy forwarding failed:", proxyErr);
}
```

Key design decisions:

- **Non-blocking**: The proxy is fire-and-forget with a 10 s timeout. A failure does not affect the main webhook response.
- **Forwards raw body**: The original Stripe event JSON is forwarded as-is so WooCommerce can process it natively.
- **Header annotation**: `X-Forwarded-Source` lets the receiving end distinguish proxied events from direct Stripe calls.

---

## New Feature: WooCommerce REST API Integration

### Admin UI (Developer tier)

Component: `WcRestApiPanel`

```
┌───────────────────────────────────────────────────────────────┐
│  WooCommerce REST API                                         │
│                                                               │
│  Anslut till WooCommerce REST API för att skicka ordrar och   │
│  läsa momsinformation.                                        │
│                                                               │
│  WooCommerce-URL:                                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ https://www.xtas.nu                                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Consumer Key (WC_CONSUMER_KEY):                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ck_••••••••••••••••                          [Visa/Dölj] │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Consumer Secret (WC_CONSUMER_SECRET):                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ cs_••••••••••••••••                          [Visa/Dölj] │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  [Toggle] Skicka ordrar till WooCommerce vid köp              │
│  [Toggle] Läs momsinformation från WooCommerce                │
│                                                               │
│  [ Testa anslutning ]  [ Spara ]                              │
└───────────────────────────────────────────────────────────────┘
```

### KV Storage

Key: `settings:wc_rest_api`

```json
{
  "wcUrl": "https://www.xtas.nu",
  "consumerKey": "ck_...",
  "consumerSecret": "cs_...",
  "sendOrders": true,
  "readTax": true,
  "updatedAt": "2026-03-25T12:00:00Z"
}
```

### API Endpoints

`GET /POST /api/admin/settings/wc-rest-api` — CRUD for the config above.

`POST /api/admin/settings/wc-rest-api/test` — Tests the connection by calling `GET <wcUrl>/wp-json/wc/v3/system_status` with Basic auth.

### Server-Side Library: `src/lib/wooCommerceApi.js`

```
createWcOrder(sessionData)   → POST /wp-json/wc/v3/orders
getWcTaxRates()              → GET /wp-json/wc/v3/taxes
testWcConnection()           → GET /wp-json/wc/v3/system_status
```

All calls use HTTP Basic auth (`consumerKey:consumerSecret`).

### Integration Point

In the webhook handler (`checkout.session.completed`), after the proxy forwarding block:

```
// ── WooCommerce order sync ──
try {
  const wcConfig = await readCloudflareKvJson("settings:wc_rest_api");
  if (wcConfig?.sendOrders && wcConfig?.wcUrl && wcConfig?.consumerKey) {
    await createWcOrder({
      email,
      productName,
      amountTotal: session.amount_total,
      currency: session.currency,
      sessionId: session.id,
      metadata: session.metadata,
    });
  }
} catch (wcOrderErr) {
  console.error("WC order sync failed:", wcOrderErr);
}
```

### Tax Lookup

When creating a checkout session (in the shop/checkout flow), if `readTax` is enabled:

1. Fetch `GET /wp-json/wc/v3/taxes`
2. Cache result in KV key `cache:wc_tax_rates` with 1-hour TTL
3. Use the tax rate to set `tax_behavior` and `tax_code` on Stripe line items

---

## New Feature: Stripe Key Overrides

### Admin UI (Developer tier)

Component: `StripeKeyOverridePanel`

```
┌───────────────────────────────────────────────────────────────┐
│  Stripe-nycklar (överskridning)                               │
│                                                               │
│  ⚠ Dessa värden överskriver miljövariablerna. Lämna fälten    │
│  tomma för att använda standardvärdena från .env / Wrangler.  │
│                                                               │
│  STRIPE_SECRET_KEY:                                           │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ sk_••••••••••••••••                          [Visa/Dölj] │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:                          │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ pk_••••••••••••••••                          [Visa/Dölj] │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Aktuellt läge: [Live] / [Test]                               │
│                                                               │
│  [ Spara ]  [ Rensa överskridning ]                           │
└───────────────────────────────────────────────────────────────┘
```

### KV Storage

Key: `settings:stripe_key_overrides`

```json
{
  "secretKey": "sk_live_...",
  "publishableKey": "pk_live_...",
  "updatedAt": "2026-03-25T12:00:00Z"
}
```

### Resolution Logic

A new helper in `src/lib/stripeConfig.js`:

```js
export async function getStripeSecretKey() {
  try {
    const overrides = await readCloudflareKvJson(
      "settings:stripe_key_overrides",
    );
    if (overrides?.secretKey) return overrides.secretKey;
  } catch {
    /* fall through */
  }
  return process.env.STRIPE_SECRET_KEY || "";
}

export async function getStripePublishableKey() {
  try {
    const overrides = await readCloudflareKvJson(
      "settings:stripe_key_overrides",
    );
    if (overrides?.publishableKey) return overrides.publishableKey;
  } catch {
    /* fall through */
  }
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
}
```

Callers that currently read `process.env.STRIPE_SECRET_KEY` directly (e.g. `AdminSalesTab`, checkout API routes) would be updated to call `getStripeSecretKey()` instead.

### Security Considerations

- The override values are stored in Cloudflare KV, which is encrypted at rest.
- The admin settings API endpoints require admin authentication (same pattern as all `/api/admin/*` routes).
- Secret keys are never returned in full by the GET endpoint — only the first 8 + last 4 characters are exposed, with the rest masked.
- Clearing the override (`[ Rensa överskridning ]`) calls `deleteCloudflareKv("settings:stripe_key_overrides")`.

---

## Migration Plan

### Phase 1 — Tiered Menu Shell

1. Add `TieredMenuButton` to `AdminHeader.js`
2. Add `AdminSettingsPanel.js` that routes to the correct panel based on hash
3. Move existing panels (R2ConnectionPanel, StorageConfigPanel, AdminConnectorsTab, AdminSandboxTab) into the new routing without changing their internals
4. Keep the Info tab's Overview, Stats, and Docs sub-sections in place as Basic content

### Phase 2 — WooCommerce Proxy

1. Add `WcProxySettingsPanel` component
2. Add `GET/POST /api/admin/settings/wc-proxy` API routes
3. Add proxy forwarding block in `src/app/api/stripe/webhook/route.js`

### Phase 3 — Stripe Key Overrides

1. Add `StripeKeyOverridePanel` component
2. Add `GET/POST/DELETE /api/admin/settings/stripe-keys` API routes
3. Add `src/lib/stripeConfig.js` with resolution helpers
4. Update callers of `process.env.STRIPE_SECRET_KEY`

### Phase 4 — WooCommerce REST API

1. Add `WcRestApiPanel` component
2. Add `src/lib/wooCommerceApi.js` library
3. Add `GET/POST /api/admin/settings/wc-rest-api` API routes
4. Add order-sync block in webhook handler
5. Add tax-rate lookup in checkout flow

---

## KV Key Summary

| Key                             | Purpose                           | Written by                    |
| ------------------------------- | --------------------------------- | ----------------------------- |
| `settings:wc_proxy`             | WC webhook proxy toggle + URL     | Admin UI                      |
| `settings:wc_rest_api`          | WC REST API credentials + toggles | Admin UI                      |
| `settings:stripe_key_overrides` | Stripe key overrides              | Admin UI                      |
| `cache:wc_tax_rates`            | Cached WC tax rates (1h TTL)      | Server-side on first checkout |

---

## File Impact Summary

| File                                              | Change                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `src/components/admin/AdminHeader.js`             | Add `TieredMenuButton` (ellipsis menu + popover)                      |
| `src/components/admin/AdminDashboard.js`          | Add `settings` pseudo-tab, route to `AdminSettingsPanel`              |
| `src/components/admin/AdminSettingsPanel.js`      | **New** — routes to setting panels based on hash                      |
| `src/components/admin/TieredMenuButton.js`        | **New** — the `···` button + popover with Advanced/Developer sections |
| `src/components/admin/WcProxySettingsPanel.js`    | **New** — toggle + URL field                                          |
| `src/components/admin/WcRestApiPanel.js`          | **New** — WC REST API credentials + toggles                           |
| `src/components/admin/StripeKeyOverridePanel.js`  | **New** — Stripe key override fields                                  |
| `src/components/admin/AdminInfoHubTab.js`         | Remove Storage, Health, Beta sub-sections (moved to tiered menu)      |
| `src/lib/stripeConfig.js`                         | **New** — `getStripeSecretKey()`, `getStripePublishableKey()`         |
| `src/lib/wooCommerceApi.js`                       | **New** — `createWcOrder()`, `getWcTaxRates()`, `testWcConnection()`  |
| `src/app/api/stripe/webhook/route.js`             | Add WC proxy forwarding + WC order sync blocks                        |
| `src/app/api/admin/settings/wc-proxy/route.js`    | **New** — GET/POST for WC proxy config                                |
| `src/app/api/admin/settings/wc-rest-api/route.js` | **New** — GET/POST for WC REST API config                             |
| `src/app/api/admin/settings/stripe-keys/route.js` | **New** — GET/POST/DELETE for Stripe key overrides                    |
| `src/lib/i18n/sv.json`                            | Add Swedish translations for all new labels                           |
| `src/lib/i18n/en.json`                            | Add English translations                                              |
