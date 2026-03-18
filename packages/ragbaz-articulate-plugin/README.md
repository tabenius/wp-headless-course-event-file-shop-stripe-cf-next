# RAGBAZ-Articulate (WordPress GraphQL helper)

WPGraphQL glue for LearnPress courses and common event plugins (Event Organiser, The Events Calendar, Events Manager). Provides normalized fields (price, duration, curriculum, event dates/venue/cost) and a `ragbazInfo` probe so headless storefronts can auto-detect capabilities. No third-party code is bundled; it only registers fields for plugins you already run.

- Contact: ragbaz@proton.me  
- Site: https://ragbaz.xyz/products

## Usage
1) Copy `Ragbaz-Articulate.php` to `wp-content/plugins/` (or `wp-content/mu-plugins/` to keep it always-on).  
2) Activate in WordPress admin (skip if mu-plugin).  
3) Ensure WPGraphQL is active; optionally install LearnPress and your preferred event plugin.

## Build

```bash
npm install
npm run build --workspace ragbaz-articulate-plugin
```

Output: `dist/Ragbaz-Articulate.zip`
