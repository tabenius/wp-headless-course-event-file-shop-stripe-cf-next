# RAGBAZ-Articulate (WordPress GraphQL helper)

WPGraphQL glue for LearnPress courses and common event plugins (Event Organiser, The Events Calendar, Events Manager). Provides normalized fields (price, duration, curriculum, event dates/venue/cost), a `ragbazInfo` probe so headless storefronts can auto-detect capabilities, and a terse runtime probe (`ragbazWpRuntime`) for production debug/performance flags. Includes a minimal wp-admin info screen under **Tools → RAGBAZ Articulate** for the same checks.

- Contact: ragbaz@proton.me
- Site: https://ragbaz.xyz/products

## Usage

1. Copy `Ragbaz-Articulate.php` to `wp-content/plugins/` (or `wp-content/mu-plugins/` to keep it always-on).
2. Activate in WordPress admin (skip if mu-plugin).
3. Ensure WPGraphQL is active; optionally install LearnPress and your preferred event plugin.

## Build

```bash
npm install
npm run build --workspace ragbaz-articulate-plugin
```

Output: `dist/Ragbaz-Articulate.zip`
