=== RAGBAZ-Articulate ===
Contributors: ragbaz
Tags: graphql, wpgraphql, learnpress, events, storefront, headless
Requires at least: 6.3
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 1.0.3
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Plugin URI: https://ragbaz.xyz/products
Author URI: https://ragbaz.xyz
Contact: ragbaz@proton.me

== Description ==

= English =
RAGBAZ-Articulate is a lightweight GraphQL helper for headless storefronts. It turns LearnPress courses and common event plugins (Event Organiser, The Events Calendar, Events Manager) into first-class WPGraphQL types with normalized fields (price, duration, curriculum, event times/venue/cost). It also ships a storefront probe (`ragbazInfo`) so frontends can auto-detect capabilities without guessing which plugins are active, plus a terse runtime probe (`ragbazWpRuntime`) and explicit version field (`ragbazPluginVersion`). No third-party code is bundled; it simply registers GraphQL fields for the plugins you already run.

= Svenska =
RAGBAZ-Articulate är ett lättviktigt GraphQL-tillägg för headless-butiker. Det exponerar LearnPress-kurser och vanliga event-plugins (Event Organiser, The Events Calendar, Events Manager) som WPGraphQL-typer med normaliserade fält (pris, längd, kursplan, eventtid/plats/kostnad). Det innehåller även en “storefront probe” (`ragbazInfo`) så att frontends kan auto-detektera vilka funktioner som finns utan att gissa vilka plugins som är aktiva, plus en kort runtime-probe (`ragbazWpRuntime`) och explicit versionsfält (`ragbazPluginVersion`). Ingen tredjepartskod följer med; pluginet registrerar bara GraphQL-fält för de plugins du redan använder.

= Español =
RAGBAZ-Articulate es un asistente ligero de GraphQL para tiendas headless. Convierte los cursos de LearnPress y los plugins de eventos más comunes (Event Organiser, The Events Calendar, Events Manager) en tipos WPGraphQL de primera clase con campos normalizados (precio, duración, plan de estudios, horario/lugar/coste del evento). Incluye además una sonda para el storefront (`ragbazInfo`) que permite a los frontends detectar automáticamente las capacidades sin adivinar qué plugins están activos, además de una sonda runtime breve (`ragbazWpRuntime`) y un campo explícito de versión (`ragbazPluginVersion`). No incluye código de terceros; solo registra campos GraphQL para los plugins que ya usas.

Other helpful GraphQL glue this plugin is ready to host:
- WooCommerce price/stock normalization via WPGraphQL for WooCommerce
- ACF passthrough fields for product and event meta
- WPGraphQL Content Blocks bridging for block-based event/course pages
- Ticket URL and cost fallbacks for custom event meta keys

== Installation ==
1. Upload `Ragbaz-Articulate.php` to `wp-content/plugins/` (or `mu-plugins/` if you want it always-on).
2. Activate the plugin in **Plugins → Installed Plugins** (skip if placed in mu-plugins).
3. Ensure WPGraphQL is active. Optional: LearnPress, Event Organiser / The Events Calendar / Events Manager, WPGraphQL for WooCommerce.

== Frequently Asked Questions ==

= Do I need Event Organiser specifically? =
No. Any plugin that registers an `Event`-like post type (e.g., `tribe_events`, `event`, `event_listing`, `eo_event`) will be exposed if present.

= How does the storefront detect plugin capabilities and runtime settings? =
Call `ragbazInfo { version hasLearnPress hasEventsPlugin }`, `ragbazPluginVersion`, and `ragbazWpRuntime { pluginVersion okForProduction wpDebug wpDebugLog scriptDebug saveQueries graphqlDebug queryMonitorActive xdebugActive objectCacheEnabled opcacheEnabled checkedAt }` in WPGraphQL. You can also open **Tools → RAGBAZ Articulate** in wp-admin for the same checks.

= Where can I get help? =
Email ragbaz@proton.me or visit https://ragbaz.xyz/products.

== Changelog ==
= 1.0.3 =
* Added a minimal wp-admin information screen (**Tools → RAGBAZ Articulate**) with production runtime checks.
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
