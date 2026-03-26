=== RAGBAZ Bridge ===
Contributors: ragbaz
Tags: graphql, wpgraphql, learnpress, events, storefront, headless
Requires at least: 6.3
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 1.2.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Plugin URI: https://ragbaz.xyz/products
Author URI: https://ragbaz.xyz
Contact: ragbaz@proton.me

== Description ==

= English =
RAGBAZ Bridge is a GraphQL bridge for headless storefronts. It exposes LearnPress courses, events (Event Organiser, The Events Calendar, Events Manager), WooCommerce products, and digital downloads via WPGraphQL. Includes built-in headless authentication via site-secret headers, a rich tabbed settings panel in wp-admin, and a storefront probe (`ragbazInfo`) so frontends can auto-detect capabilities. No third-party code is bundled; it simply registers GraphQL fields for the plugins you already run.

= Svenska =
RAGBAZ Bridge är ett lättviktigt GraphQL-tillägg för headless-butiker. Det exponerar LearnPress-kurser och vanliga event-plugins (Event Organiser, The Events Calendar, Events Manager) som WPGraphQL-typer med normaliserade fält (pris, längd, kursplan, eventtid/plats/kostnad). Det innehåller även en “storefront probe” (`ragbazInfo`) så att frontends kan auto-detektera vilka funktioner som finns utan att gissa vilka plugins som är aktiva, plus en kort runtime-probe (`ragbazWpRuntime`) och explicit versionsfält (`ragbazPluginVersion`). Ingen tredjepartskod följer med; pluginet registrerar bara GraphQL-fält för de plugins du redan använder.

= Español =
RAGBAZ Bridge es un asistente ligero de GraphQL para tiendas headless. Convierte los cursos de LearnPress y los plugins de eventos más comunes (Event Organiser, The Events Calendar, Events Manager) en tipos WPGraphQL de primera clase con campos normalizados (precio, duración, plan de estudios, horario/lugar/coste del evento). Incluye además una sonda para el storefront (`ragbazInfo`) que permite a los frontends detectar automáticamente las capacidades sin adivinar qué plugins están activos, además de una sonda runtime breve (`ragbazWpRuntime`) y un campo explícito de versión (`ragbazPluginVersion`). No incluye código de terceros; solo registra campos GraphQL para los plugins que ya usas.

Other helpful GraphQL glue this plugin is ready to host:
- WooCommerce price/stock normalization via WPGraphQL for WooCommerce
- ACF passthrough fields for product and event meta
- WPGraphQL Content Blocks bridging for block-based event/course pages
- Ticket URL and cost fallbacks for custom event meta keys

== Installation ==
1. Upload `ragbaz-bridge.php` to `wp-content/plugins/` (or `mu-plugins/` if you want it always-on).
2. Activate the plugin in **Plugins → Installed Plugins** (skip if placed in mu-plugins).
3. Ensure WPGraphQL is active. Optional: LearnPress, Event Organiser / The Events Calendar / Events Manager, WPGraphQL for WooCommerce.

== Frequently Asked Questions ==

= Do I need Event Organiser specifically? =
No. Any plugin that registers an `Event`-like post type (e.g., `tribe_events`, `event`, `event_listing`, `eo_event`) will be exposed if present.

= How does the storefront detect plugin capabilities and runtime settings? =
Call `ragbazInfo { version hasLearnPress hasEventsPlugin }`, `ragbazPluginVersion`, and `ragbazWpRuntime { pluginVersion okForProduction wpDebug wpDebugLog scriptDebug saveQueries graphqlDebug queryMonitorActive xdebugActive objectCacheEnabled opcacheEnabled checkedAt }` in WPGraphQL. You can also open **Tools → RAGBAZ Bridge** in wp-admin for the same checks.

= Where can I get help? =
Email ragbaz@proton.me or visit https://ragbaz.xyz/products.

== Changelog ==
= 1.2.1 =
* Moved **Connect to RAGBAZ** to the first tab in the admin screen for faster onboarding.
* Kept sepia RAGBAZ branding/logo in the admin header and aligned release metadata to `1.2.1`.

= 1.2.0 =
* Renamed plugin to RAGBAZ Bridge. Replaced info page with a tabbed settings panel covering overview, authentication guide, plugin inventory, performance checks, and a Connect to RAGBAZ SaaS section with live debug payload.

= 1.1.0 =
* Added built-in headless authentication via site-secret headers. Requests to /graphql carrying a matching `X-Headless-Secret`, `X-Faust-Secret`, `X-FaustWP-Secret`, or `X-Ragbaz-Secret` header are transparently authenticated as a service-account administrator. The secret is read from FaustWP settings (`faustwp_settings['secret_key']`) or the `ragbaz_site_secret` option. The authenticated user ID can be overridden via the `ragbaz_headless_user_id` filter.

= 1.0.3 =
* Added a minimal wp-admin information screen (**Tools → RAGBAZ Bridge**) with production runtime checks.
* Added GraphQL runtime probe `ragbazWpRuntime` and explicit version field `ragbazPluginVersion`.
* Extended `ragbazInfo` with `wpRuntime` for one-query capability + runtime detection.
* Added checks for `WP_DEBUG`, `WP_DEBUG_LOG`, `SCRIPT_DEBUG`, `SAVEQUERIES`, `GRAPHQL_DEBUG`, Query Monitor, Xdebug, persistent object cache, and OPcache.

= 1.0.2 =
* Added `active` support in course access GraphQL schema and mutation handling.
* Normalized course URI handling to avoid trailing-slash mismatch issues.
* Preserved legacy behavior when `active` is omitted by older clients.

= 1.0.0 =
* Initial release: LearnPress fields, event normalization, course access schema, RAGBAZ storefront probe, admin linkouts.

== License ==
This plugin is licensed under the GPL v2 or later.
