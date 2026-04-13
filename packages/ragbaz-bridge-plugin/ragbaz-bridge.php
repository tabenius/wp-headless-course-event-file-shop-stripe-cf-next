<?php
/**
 * Plugin Name: RAGBAZ Bridge - GraphQL Events, Courses, WooCommerce & Downloads StoreFront
 * Plugin URI: https://ragbaz.xyz/products
 * Description: GraphQL bridge for headless storefronts — exposes LearnPress courses, events (Event Organiser, The Events Calendar, Events Manager), WooCommerce products, and digital downloads via WPGraphQL. Includes built-in headless authentication via site-secret headers.
 * Author: RAGBAZ / Articulate
 * Author URI: https://ragbaz.xyz
 * Version: 1.3.1
 * Requires at least: 6.3
 * Tested up to: 6.5
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Requires: WPGraphQL
 * Optional: LearnPress, Event Organiser, The Events Calendar, Events Manager, Timely, WP Event Manager, WooCommerce + WPGraphQL for WooCommerce
 * Text Domain: ragbaz-bridge
 * Contact: ragbaz@proton.me
 */

if (!defined('ABSPATH')) {
  exit;
}

// Keep the legacy option name so existing rules remain intact.
const RAGBAZ_COURSE_RULES_OPTION = 'Articulate_course_access_rules';
const RAGBAZ_VERSION = '1.3.1';

// ---------------------------------------------------------------------------
// Upgrade & activation safety
// ---------------------------------------------------------------------------

/**
 * Activation hook — records install version and timestamp.
 * Runs when the plugin is activated (not on every page load).
 */
register_activation_hook(__FILE__, function () {
  $prev = get_option('ragbaz_bridge_version', '');
  if (!$prev) {
    // Fresh install
    update_option('ragbaz_bridge_installed_at', gmdate('c'), false);
  }
  update_option('ragbaz_bridge_version', RAGBAZ_VERSION, false);
  update_option('ragbaz_bridge_activated_at', gmdate('c'), false);
  // Clear any previous upgrade notice
  delete_transient('ragbaz_bridge_upgraded_from');
});

/**
 * Deactivation hook — record for diagnostics but preserve all options.
 * Data is NEVER deleted on deactivation so reactivating is safe.
 */
register_deactivation_hook(__FILE__, function () {
  update_option('ragbaz_bridge_deactivated_at', gmdate('c'), false);
});

/**
 * On every admin page load, compare stored version to code version.
 * If they differ, run the upgrade routine exactly once.
 */
add_action('admin_init', function () {
  if (!current_user_can('manage_options')) return;

  $stored = get_option('ragbaz_bridge_version', '');
  if ($stored === RAGBAZ_VERSION) return;

  $old_version = $stored ?: '0.0.0';

  // Run pre-flight checks before marking upgrade complete
  $preflight = ragbaz_upgrade_preflight();
  if (!empty($preflight['errors'])) {
    // Store errors for display — do NOT update version so check runs again
    set_transient('ragbaz_bridge_preflight_errors', $preflight['errors'], HOUR_IN_SECONDS);
    return;
  }

  // Record the upgrade
  set_transient('ragbaz_bridge_upgraded_from', $old_version, DAY_IN_SECONDS);
  update_option('ragbaz_bridge_version', RAGBAZ_VERSION, false);
  update_option('ragbaz_bridge_last_upgrade_at', gmdate('c'), false);

  // Run version-specific migrations
  ragbaz_run_migrations($old_version);
});

/**
 * Pre-flight checks before accepting an upgrade.
 * Returns ['errors' => [...], 'warnings' => [...]].
 */
function ragbaz_upgrade_preflight() {
  $result = ['errors' => [], 'warnings' => []];

  // PHP version
  if (version_compare(PHP_VERSION, '7.4', '<')) {
    $result['errors'][] = sprintf(
      'PHP %s detected — RAGBAZ Bridge %s requires PHP 7.4+.',
      PHP_VERSION, RAGBAZ_VERSION
    );
  }

  // WPGraphQL must be present
  if (!function_exists('register_graphql_field') && !class_exists('WPGraphQL')) {
    $result['warnings'][] = 'WPGraphQL is not active. GraphQL fields will not be registered until it is activated.';
  }

  // Verify event tables are accessible if the event plugin is active
  global $wpdb;
  if (isset($wpdb->eo_events)) {
    $test = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->eo_events} LIMIT 1");
    if ($wpdb->last_error) {
      $result['warnings'][] = 'Event Organiser table (eo_events) exists but query failed: ' . $wpdb->last_error;
    }
  }

  return $result;
}

/**
 * Run version-gated migrations. Each migration runs exactly once
 * (guarded by the old version comparison).
 */
function ragbaz_run_migrations($from_version) {
  // Example: if upgrading from before 1.3.0, clear stale caches
  if (version_compare($from_version, '1.3.0', '<')) {
    // Flush object cache for graphql results if available
    if (function_exists('wp_cache_flush_group')) {
      wp_cache_flush_group('graphql');
    }
    // Clear any transient caches this plugin uses
    delete_transient('ragbaz_bridge_notice_shown');
  }
}

/**
 * Show admin notice after successful upgrade.
 */
add_action('admin_notices', function () {
  if (!current_user_can('manage_options')) return;

  // Pre-flight errors: block upgrade notice, show error instead
  $preflight_errors = get_transient('ragbaz_bridge_preflight_errors');
  if ($preflight_errors) {
    echo '<div class="notice notice-error"><p>';
    echo '<strong>RAGBAZ Bridge ' . esc_html(RAGBAZ_VERSION) . ' — upgrade blocked:</strong></p><ul style="margin:.2em 0 .6em 1.4em;list-style:disc">';
    foreach ($preflight_errors as $err) {
      echo '<li>' . esc_html($err) . '</li>';
    }
    echo '</ul><p style="color:#475569;font-size:13px">Fix the issues above, then reload this page. ';
    echo 'To rollback: replace <code>ragbaz-bridge.php</code> with the previous version and deactivate/reactivate.</p></div>';
    return;
  }

  // Success notice
  $upgraded_from = get_transient('ragbaz_bridge_upgraded_from');
  if (!$upgraded_from) return;
  delete_transient('ragbaz_bridge_upgraded_from');

  $url = esc_url(admin_url('tools.php?page=ragbaz-bridge'));
  echo '<div class="notice notice-success is-dismissible"><p>';
  printf(
    '<strong>RAGBAZ Bridge updated:</strong> %s → %s. <a href="%s">Review settings</a>.',
    esc_html($upgraded_from),
    esc_html(RAGBAZ_VERSION),
    $url
  );

  // Show event plugin detection result
  $plugin_name = ragbaz_detect_events_plugin_name();
  if ($plugin_name) {
    printf(' Event calendar detected: <strong>%s</strong>.', esc_html($plugin_name));
  }

  echo '</p></div>';
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function ragbaz_normalize_email($email) {
  return sanitize_email(strtolower(trim((string) $email)));
}

function ragbaz_normalize_uri($uri) {
  $uri = trim((string) $uri);
  if ($uri === '') return '';
  $with_leading = strpos($uri, '/') === 0 ? $uri : '/' . $uri;
  $without_trailing = rtrim($with_leading, '/');
  return $without_trailing === '' ? '/' : $without_trailing;
}

function ragbaz_normalize_iso_datetime($value) {
  if (!$value) return null;
  $ts = is_numeric($value) ? intval($value) : strtotime((string) $value);
  if (!$ts) return null;
  return gmdate('c', $ts);
}

function ragbaz_normalize_vat_percent($value) {
  if ($value === '' || is_null($value)) return null;
  if (!is_numeric($value)) return null;
  $numeric = floatval($value);
  if ($numeric < 0 || $numeric > 100) return null;
  return round($numeric, 2);
}

function ragbaz_sanitize_text($value, $max = 600) {
  $safe = trim(preg_replace('/\s+/', ' ', (string) $value));
  if (!is_int($max) || $max <= 0) return $safe;
  if (function_exists('mb_substr')) {
    return mb_substr($safe, 0, $max);
  }
  return substr($safe, 0, $max);
}

function ragbaz_sanitize_asset_id($value, $max = 96) {
  $safe = strtolower(ragbaz_sanitize_text($value, $max));
  if ($safe === '') return '';
  return preg_replace('/[^a-z0-9._:-]/', '', $safe);
}

function ragbaz_sanitize_asset_slug($value, $max = 120) {
  $safe = strtolower(ragbaz_sanitize_text($value, $max));
  if ($safe === '') return '';
  $safe = preg_replace('/[^a-z0-9._\/-]+/', '-', $safe);
  $safe = preg_replace('/-+/', '-', $safe);
  $safe = trim($safe, '-/');
  return substr($safe, 0, $max);
}

function ragbaz_sanitize_tenant_slug($value, $max = 64) {
  $safe = strtolower(ragbaz_sanitize_text($value, $max));
  if ($safe === '') return '';
  $safe = preg_replace('/[^a-z0-9-]+/', '-', $safe);
  $safe = preg_replace('/-+/', '-', $safe);
  $safe = trim($safe, '-');
  if ($safe === '') return '';
  if (strlen($safe) < 2) return '';
  return substr($safe, 0, $max);
}

function ragbaz_normalize_owner_uri($value, $max = 320) {
  $raw = trim((string) $value);
  if ($raw === '' || $raw === '/') return '/';
  $path = $raw;
  if (preg_match('#^https?://#i', $raw) === 1) {
    $parsed = wp_parse_url($raw);
    if (is_array($parsed) && !empty($parsed['path'])) {
      $path = $parsed['path'];
    }
  }
  $safe = preg_replace('/\s+/', '', $path);
  $safe = preg_replace('#/{2,}#', '/', $safe);
  if ($safe === '') return '/';
  if (strpos($safe, '/') !== 0) $safe = '/' . $safe;
  if (strlen($safe) > 1) {
    $safe = rtrim($safe, '/');
  }
  return substr($safe, 0, $max);
}

function ragbaz_normalize_positive_int($value) {
  if ($value === '' || is_null($value)) return null;
  if (!is_numeric($value)) return null;
  $int = intval(round(floatval($value)));
  return $int >= 0 ? $int : null;
}

function ragbaz_build_asset_uri($asset_id) {
  $safe = ragbaz_sanitize_asset_id($asset_id);
  if ($safe === '') return '';
  return '/asset/' . rawurlencode($safe);
}

function ragbaz_is_plugin_active_anywhere($plugin_basename) {
  $active = get_option('active_plugins', []);
  if (is_array($active) && in_array($plugin_basename, $active, true)) {
    return true;
  }
  if (is_multisite()) {
    $network_active = get_site_option('active_sitewide_plugins', []);
    if (is_array($network_active) && isset($network_active[$plugin_basename])) {
      return true;
    }
  }
  return false;
}

function ragbaz_get_wp_runtime_status() {
  $wp_debug = defined('WP_DEBUG') ? (bool) WP_DEBUG : false;
  $wp_debug_log = defined('WP_DEBUG_LOG') ? (bool) WP_DEBUG_LOG : false;
  $script_debug = defined('SCRIPT_DEBUG') ? (bool) SCRIPT_DEBUG : false;
  $savequeries = defined('SAVEQUERIES') ? (bool) SAVEQUERIES : false;
  $graphql_debug = defined('GRAPHQL_DEBUG') ? (bool) GRAPHQL_DEBUG : false;
  $query_monitor_active = ragbaz_is_plugin_active_anywhere('query-monitor/query-monitor.php');
  $xdebug_active = extension_loaded('xdebug');
  $opcache_enabled = extension_loaded('Zend OPcache') || extension_loaded('opcache');
  $object_cache_dropin_present = defined('WP_CONTENT_DIR')
    ? file_exists(WP_CONTENT_DIR . '/object-cache.php')
    : false;
  $object_cache_enabled = function_exists('wp_using_ext_object_cache')
    ? (bool) wp_using_ext_object_cache()
    : false;
  $redis_plugin_active = ragbaz_is_plugin_active_anywhere('redis-cache/redis-cache.php');
  $memcached_plugin_active =
    ragbaz_is_plugin_active_anywhere('memcached/memcached.php') ||
    ragbaz_is_plugin_active_anywhere('wp-memcached/object-cache.php');

  $debug_flags_ok = !$wp_debug && !$wp_debug_log && !$script_debug && !$savequeries && !$graphql_debug;
  $debug_tools_ok = !$query_monitor_active && !$xdebug_active;
  $cache_readiness_ok =
    $opcache_enabled &&
    ($object_cache_enabled || $object_cache_dropin_present || $redis_plugin_active || $memcached_plugin_active);

  return [
    'pluginVersion' => RAGBAZ_VERSION,
    'checkedAt' => gmdate('c'),
    'wpDebug' => $wp_debug,
    'wpDebugLog' => $wp_debug_log,
    'scriptDebug' => $script_debug,
    'saveQueries' => $savequeries,
    'graphqlDebug' => $graphql_debug,
    'queryMonitorActive' => $query_monitor_active,
    'xdebugActive' => $xdebug_active,
    'objectCacheDropInPresent' => $object_cache_dropin_present,
    'redisPluginActive' => $redis_plugin_active,
    'memcachedPluginActive' => $memcached_plugin_active,
    'opcacheEnabled' => $opcache_enabled,
    'objectCacheEnabled' => $object_cache_enabled,
    'debugFlagsOk' => $debug_flags_ok,
    'debugToolsOk' => $debug_tools_ok,
    'cacheReadinessOk' => $cache_readiness_ok,
    'okForProduction' => $debug_flags_ok && $debug_tools_ok,
  ];
}

function ragbaz_get_wp_runtime_checks() {
  $status = ragbaz_get_wp_runtime_status();
  return [
    [
      'label' => 'WP_DEBUG',
      'value' => $status['wpDebug'],
      'recommended' => false,
      'ok' => !$status['wpDebug'],
      'required' => true,
    ],
    [
      'label' => 'WP_DEBUG_LOG',
      'value' => $status['wpDebugLog'],
      'recommended' => false,
      'ok' => !$status['wpDebugLog'],
      'required' => true,
    ],
    [
      'label' => 'SCRIPT_DEBUG',
      'value' => $status['scriptDebug'],
      'recommended' => false,
      'ok' => !$status['scriptDebug'],
      'required' => true,
    ],
    [
      'label' => 'SAVEQUERIES',
      'value' => $status['saveQueries'],
      'recommended' => false,
      'ok' => !$status['saveQueries'],
      'required' => true,
    ],
    [
      'label' => 'GRAPHQL_DEBUG',
      'value' => $status['graphqlDebug'],
      'recommended' => false,
      'ok' => !$status['graphqlDebug'],
      'required' => true,
    ],
    [
      'label' => 'Query Monitor active',
      'value' => $status['queryMonitorActive'],
      'recommended' => false,
      'ok' => !$status['queryMonitorActive'],
      'required' => true,
    ],
    [
      'label' => 'Xdebug loaded',
      'value' => $status['xdebugActive'],
      'recommended' => false,
      'ok' => !$status['xdebugActive'],
      'required' => true,
    ],
    [
      'label' => 'Persistent object cache',
      'value' => $status['objectCacheEnabled'],
      'recommended' => true,
      'ok' => $status['objectCacheEnabled'],
      'required' => false,
    ],
    [
      'label' => 'Object cache drop-in present',
      'value' => $status['objectCacheDropInPresent'],
      'recommended' => true,
      'ok' => $status['objectCacheDropInPresent'],
      'required' => false,
    ],
    [
      'label' => 'Redis plugin active',
      'value' => $status['redisPluginActive'],
      'recommended' => false,
      'ok' => true,
      'required' => false,
    ],
    [
      'label' => 'Memcached plugin active',
      'value' => $status['memcachedPluginActive'],
      'recommended' => false,
      'ok' => true,
      'required' => false,
    ],
    [
      'label' => 'OPcache loaded',
      'value' => $status['opcacheEnabled'],
      'recommended' => true,
      'ok' => $status['opcacheEnabled'],
      'required' => false,
    ],
  ];
}

// ---------------------------------------------------------------------------
// Course access rules (same behaviour as legacy Articulate-LearnPress-Stripe)
// ---------------------------------------------------------------------------
function ragbaz_get_rules() {
  $rules = get_option(RAGBAZ_COURSE_RULES_OPTION, []);
  if (!is_array($rules)) return [];
  $normalized = [];
  foreach ($rules as $key => $rule) {
    if (!is_array($rule)) continue;
    $course_uri = ragbaz_normalize_uri(isset($rule['courseUri']) ? $rule['courseUri'] : $key);
    if ($course_uri === '') continue;
    $allowed = isset($rule['allowedUsers']) && is_array($rule['allowedUsers']) ? $rule['allowedUsers'] : [];
    $emails = array_values(array_unique(array_filter(array_map('ragbaz_normalize_email', $allowed))));
    $currency = sanitize_text_field(strtolower((string) (isset($rule['currency']) ? $rule['currency'] : 'usd')));
    if ($currency === '') $currency = 'usd';
    $normalized[$course_uri] = [
      'courseUri' => $course_uri,
      'allowedUsers' => $emails,
      'priceCents' => max(0, intval(isset($rule['priceCents']) ? $rule['priceCents'] : 0)),
      'currency' => $currency,
      'vatPercent' => ragbaz_normalize_vat_percent(isset($rule['vatPercent']) ? $rule['vatPercent'] : null),
      'active' => !array_key_exists('active', $rule) || (bool) $rule['active'],
      'updatedAt' => isset($rule['updatedAt']) ? (string) $rule['updatedAt'] : gmdate('c'),
    ];
  }
  return $normalized;
}

function ragbaz_set_rules($rules) {
  update_option(RAGBAZ_COURSE_RULES_OPTION, $rules, false);
}

function ragbaz_get_rule($course_uri) {
  $course_uri = ragbaz_normalize_uri($course_uri);
  if ($course_uri === '') return null;
  $rules = ragbaz_get_rules();
  return isset($rules[$course_uri]) && is_array($rules[$course_uri]) ? $rules[$course_uri] : null;
}

function ragbaz_set_rule($course_uri, $allowed_users, $price_cents, $currency, $active = null, $vat_percent = null) {
  $course_uri = ragbaz_normalize_uri($course_uri);
  if ($course_uri === '') return null;

  $emails = array_values(array_unique(array_filter(array_map('ragbaz_normalize_email', (array) $allowed_users))));
  $price_cents = max(0, intval($price_cents));
  $currency = sanitize_text_field(strtolower((string) $currency));
  if ($currency === '') $currency = 'usd';

  $rules = ragbaz_get_rules();
  $existing = isset($rules[$course_uri]) && is_array($rules[$course_uri]) ? $rules[$course_uri] : null;
  $resolved_active = is_null($active)
    ? (!isset($existing['active']) || (bool) $existing['active'])
    : ($active !== false);
  $resolved_vat = is_null($vat_percent)
    ? (isset($existing['vatPercent']) ? ragbaz_normalize_vat_percent($existing['vatPercent']) : null)
    : ragbaz_normalize_vat_percent($vat_percent);

  $rules[$course_uri] = [
    'courseUri' => $course_uri,
    'allowedUsers' => $emails,
    'priceCents' => $price_cents,
    'currency' => $currency,
    'vatPercent' => $resolved_vat,
    'active' => $resolved_active,
    'updatedAt' => gmdate('c'),
  ];
  ragbaz_set_rules($rules);
  return $rules[$course_uri];
}

function ragbaz_grant_user_access($course_uri, $email) {
  $course_uri = ragbaz_normalize_uri($course_uri);
  $email = ragbaz_normalize_email($email);
  if ($course_uri === '' || $email === '') return false;

  $rule = ragbaz_get_rule($course_uri);
  if (!$rule) {
    $rule = [
      'courseUri' => $course_uri,
      'allowedUsers' => [],
      'priceCents' => 0,
      'currency' => 'usd',
      'vatPercent' => null,
      'active' => true,
      'updatedAt' => gmdate('c'),
    ];
  }

  if (!in_array($email, $rule['allowedUsers'], true)) {
    $rule['allowedUsers'][] = $email;
  }

  ragbaz_set_rule(
    $course_uri,
    $rule['allowedUsers'],
    isset($rule['priceCents']) ? intval($rule['priceCents']) : 0,
    isset($rule['currency']) ? $rule['currency'] : 'usd',
    !isset($rule['active']) || (bool) $rule['active'],
    isset($rule['vatPercent']) ? $rule['vatPercent'] : null
  );

  $user = get_user_by('email', $email);
  if ($user) {
    $meta_key = 'hwptoolkit_course_access';
    $current = get_user_meta($user->ID, $meta_key, true);
    if (!is_array($current)) $current = [];
    if (!in_array($course_uri, $current, true)) {
      $current[] = $course_uri;
      update_user_meta($user->ID, $meta_key, $current);
    }
  }

  return true;
}

function ragbaz_has_access($course_uri, $email) {
  $course_uri = ragbaz_normalize_uri($course_uri);
  $email = ragbaz_normalize_email($email);
  if ($course_uri === '' || $email === '') return false;

  $rule = ragbaz_get_rule($course_uri);
  if (!$rule) return false;

  $allowed = isset($rule['allowedUsers']) && is_array($rule['allowedUsers']) ? $rule['allowedUsers'] : [];
  if (in_array($email, $allowed, true)) {
    return true;
  }

  $user = get_user_by('email', $email);
  if (!$user) return false;
  $meta_access = get_user_meta($user->ID, 'hwptoolkit_course_access', true);
  if (is_array($meta_access) && in_array($course_uri, $meta_access, true)) {
    return true;
  }

  // Optional LearnPress check (if plugin API is available).
  if (function_exists('learn_press_get_user') && function_exists('url_to_postid')) {
    $post_id = url_to_postid(home_url($course_uri));
    if ($post_id) {
      $lp_user = learn_press_get_user($user->ID);
      if ($lp_user && method_exists($lp_user, 'has_enrolled_course') && $lp_user->has_enrolled_course($post_id)) {
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// GraphQL: expose CPTs/taxonomies from partner plugins
// ---------------------------------------------------------------------------
add_filter('register_post_type_args', function ($args, $post_type) {
  // LearnPress
  $lp_types = [
    'lp_course' => ['graphql_single' => 'LpCourse',  'graphql_plural' => 'LpCourses'],
    'lp_lesson' => ['graphql_single' => 'LpLesson',  'graphql_plural' => 'LpLessons'],
  ];

  if (isset($lp_types[$post_type])) {
    $args['show_in_graphql']     = true;
    $args['graphql_single_name'] = $lp_types[$post_type]['graphql_single'];
    $args['graphql_plural_name'] = $lp_types[$post_type]['graphql_plural'];
  }

  // Events (multiple common plugins)
  $event_types = ['event', 'events', 'tribe_events', 'event_listing', 'eo_event', 'ai1ec_event'];
  if (in_array($post_type, $event_types, true)) {
    $args['show_in_graphql']     = true;
    $args['graphql_single_name'] = 'Event';
    $args['graphql_plural_name'] = 'Events';
  }

  return $args;
}, 10, 2);

add_filter('register_taxonomy_args', function ($args, $taxonomy) {
  $event_tax = [
    'event-venue'   => ['EventVenue', 'EventVenues'],
    'event_venue'   => ['EventVenue', 'EventVenues'],
    'tribe_venue'   => ['EventVenue', 'EventVenues'],
    'event-tag'     => ['EventTag', 'EventTags'],
    'event_tag'     => ['EventTag', 'EventTags'],
    'event-category'=> ['EventCategory', 'EventCategories'],
    'event_cat'     => ['EventCategory', 'EventCategories'],
    // Timely (All-in-One Event Calendar)
    'events_categories' => ['EventCategory', 'EventCategories'],
    'events_tags'       => ['EventTag', 'EventTags'],
    // WP Event Manager
    'event_listing_category' => ['EventCategory', 'EventCategories'],
    'event_listing_type'     => ['EventTag', 'EventTags'],
  ];

  if (isset($event_tax[$taxonomy])) {
    $args['show_in_graphql']     = true;
    $args['graphql_single_name'] = $event_tax[$taxonomy][0];
    $args['graphql_plural_name'] = $event_tax[$taxonomy][1];
  }

  return $args;
}, 10, 2);

// ---------------------------------------------------------------------------
// GraphQL fields
// ---------------------------------------------------------------------------
/**
 * Per-request caches of event date boundaries keyed by post_id.
 * Each entry: ['start' => iso|null, 'end' => iso|null].
 * One query per post_id covers both startDate and endDate resolvers.
 */
global $ragbaz_eo_date_cache, $ragbaz_em_date_cache, $ragbaz_timely_date_cache;
$ragbaz_eo_date_cache = [];
$ragbaz_em_date_cache = [];
$ragbaz_timely_date_cache = [];

function ragbaz_get_event_datetime($post_id, $which = 'start') {
  $post_id = intval($post_id);
  if ($post_id <= 0) return null;

  // ── Event Organiser (eo_events table) ──────────────────────────────────
  // EO stores occurrences in its own table with StartDate/EndDate/StartTime/
  // FinishTime columns. One direct query per post_id, cached for both fields.
  global $wpdb, $ragbaz_eo_date_cache, $ragbaz_em_date_cache, $ragbaz_timely_date_cache;
  if (isset($wpdb->eo_events)) {
    if (!isset($ragbaz_eo_date_cache[$post_id])) {
      $ragbaz_eo_date_cache[$post_id] = ragbaz_query_eo_dates($post_id);
    }
    $cached = $ragbaz_eo_date_cache[$post_id];
    if ($cached[$which]) return $cached[$which];
  }

  // ── Events Manager (wp_em_events table) ────────────────────────────────
  // EM stores events in {prefix}em_events with event_start_date/event_end_date
  // columns. For recurring events, child occurrences are separate posts.
  $em_table = $wpdb->prefix . 'em_events';
  if (ragbaz_table_exists($em_table)) {
    if (!isset($ragbaz_em_date_cache[$post_id])) {
      $ragbaz_em_date_cache[$post_id] = ragbaz_query_em_dates($post_id);
    }
    $cached = $ragbaz_em_date_cache[$post_id];
    if ($cached[$which]) return $cached[$which];
  }

  // ── Timely / All-in-One Event Calendar (ai1ec_event_instances table) ────
  // Timely stores unix timestamps in ai1ec_events (master) and pre-expands
  // recurring occurrences into ai1ec_event_instances.
  $timely_inst = $wpdb->prefix . 'ai1ec_event_instances';
  if (ragbaz_table_exists($timely_inst)) {
    if (!isset($ragbaz_timely_date_cache[$post_id])) {
      $ragbaz_timely_date_cache[$post_id] = ragbaz_query_timely_dates($post_id);
    }
    $cached = $ragbaz_timely_date_cache[$post_id];
    if ($cached[$which]) return $cached[$which];
  }

  // ── The Events Calendar / WP Event Manager (post-meta based) ──────────
  // TEC stores dates directly in post meta. TEC Pro recurring events create
  // separate posts per occurrence, so meta is always per-occurrence.
  // WP Event Manager uses _event_start_date / _event_end_date in meta.
  $meta_keys = $which === 'start'
    ? ['_EventStartDate', '_EventStartDateUTC', '_EventStartDateISO', '_event_start_date']
    : ['_EventEndDate', '_EventEndDateUTC', '_EventEndDateISO', '_event_end_date'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if ($val !== '' && $val !== false) {
      $iso = ragbaz_normalize_iso_datetime($val);
      if ($iso) return $iso;
    }
  }

  // WP Event Manager: combine date + time meta if separate
  $date_key = $which === 'start' ? '_event_start_date' : '_event_end_date';
  $time_key = $which === 'start' ? '_event_start_time' : '_event_end_time';
  $date_val = get_post_meta($post_id, $date_key, true);
  $time_val = get_post_meta($post_id, $time_key, true);
  if ($date_val) {
    $combined = $date_val . ($time_val ? 'T' . $time_val : '');
    $iso = ragbaz_normalize_iso_datetime($combined);
    if ($iso) return $iso;
  }

  // No event date found — do NOT fall back to post_date/post_modified.
  return null;
}

/**
 * Check if a database table exists (cached per request).
 */
function ragbaz_table_exists($table_name) {
  static $cache = [];
  if (!isset($cache[$table_name])) {
    global $wpdb;
    $cache[$table_name] = $wpdb->get_var(
      $wpdb->prepare("SHOW TABLES LIKE %s", $table_name)
    ) === $table_name;
  }
  return $cache[$table_name];
}

/**
 * Get the next upcoming occurrence from EO's eo_events table for a given post.
 * Returns ['start' => iso|null, 'end' => iso|null] — both from the same occurrence.
 */
function ragbaz_query_eo_dates($post_id) {
  global $wpdb;
  $result = ['start' => null, 'end' => null];

  // Next occurrence where the start date is today or later
  $row = $wpdb->get_row($wpdb->prepare(
    "SELECT StartDate, StartTime, EndDate, FinishTime
     FROM {$wpdb->eo_events}
     WHERE post_id = %d AND StartDate >= CURDATE()
     ORDER BY StartDate ASC, StartTime ASC
     LIMIT 1",
    $post_id
  ));

  // If no future occurrence, fall back to the last occurrence overall
  /*
  if (!$row) {
    $row = $wpdb->get_row($wpdb->prepare(
      "SELECT StartDate, StartTime, EndDate, FinishTime
       FROM {$wpdb->eo_events}
       WHERE post_id = %d
       ORDER BY StartDate DESC, StartTime DESC
       LIMIT 1",
      $post_id
    ));
  }
   */

  if ($row) {
    if (!empty($row->StartDate)) {
      $result['start'] = ragbaz_normalize_iso_datetime($row->StartDate . 'T' . ($row->StartTime ?: '00:00:00'));
    }
    if (!empty($row->EndDate)) {
      $result['end'] = ragbaz_normalize_iso_datetime($row->EndDate . 'T' . ($row->FinishTime ?: '23:59:59'));
    }
  }

  return $result;
}

/**
 * Get the next upcoming occurrence from Events Manager's em_events table.
 * Returns ['start' => iso|null, 'end' => iso|null] — both from the same row.
 *
 * EM table columns: event_start_date (DATE), event_start_time (TIME),
 *                   event_end_date (DATE), event_end_time (TIME),
 *                   post_id, recurrence (0=normal/child, 1=parent template).
 * For recurring events the parent row (recurrence=1) is a template — we skip it
 * and query actual occurrence rows (recurrence != 1) instead.
 */
function ragbaz_query_em_dates($post_id) {
  global $wpdb;
  $table  = $wpdb->prefix . 'em_events';
  $result = ['start' => null, 'end' => null];

  // Next upcoming occurrence (skip recurrence templates)
  $row = $wpdb->get_row($wpdb->prepare(
    "SELECT event_start_date, event_start_time, event_end_date, event_end_time
     FROM {$table}
     WHERE post_id = %d AND (recurrence IS NULL OR recurrence != 1) AND event_start_date >= CURDATE()
     ORDER BY event_start_date ASC, event_start_time ASC
     LIMIT 1",
    $post_id
  ));

  // If no future occurrence, fall back to the most recent past occurrence
  if (!$row) {
    $row = $wpdb->get_row($wpdb->prepare(
      "SELECT event_start_date, event_start_time, event_end_date, event_end_time
       FROM {$table}
       WHERE post_id = %d AND (recurrence IS NULL OR recurrence != 1)
       ORDER BY event_start_date DESC, event_start_time DESC
       LIMIT 1",
      $post_id
    ));
  }

  // If still nothing (single non-recurring event stored as the only row)
  if (!$row) {
    $row = $wpdb->get_row($wpdb->prepare(
      "SELECT event_start_date, event_start_time, event_end_date, event_end_time
       FROM {$table}
       WHERE post_id = %d
       ORDER BY event_start_date DESC
       LIMIT 1",
      $post_id
    ));
  }

  if ($row) {
    if (!empty($row->event_start_date)) {
      $result['start'] = ragbaz_normalize_iso_datetime(
        $row->event_start_date . 'T' . ($row->event_start_time ?: '00:00:00')
      );
    }
    if (!empty($row->event_end_date)) {
      $result['end'] = ragbaz_normalize_iso_datetime(
        $row->event_end_date . 'T' . ($row->event_end_time ?: '23:59:59')
      );
    }
  }

  return $result;
}

/**
 * Get the next upcoming occurrence from Timely's ai1ec_event_instances table.
 * Returns ['start' => iso|null, 'end' => iso|null].
 *
 * Timely pre-expands recurring events into ai1ec_event_instances with unix
 * timestamps. The master row in ai1ec_events holds the original start/end
 * but for recurring events we prefer the instances table.
 */
function ragbaz_query_timely_dates($post_id) {
  global $wpdb;
  $inst_table  = $wpdb->prefix . 'ai1ec_event_instances';
  $event_table = $wpdb->prefix . 'ai1ec_events';
  $result = ['start' => null, 'end' => null];

  // Try instances table first (covers recurring + single events)
  $row = $wpdb->get_row($wpdb->prepare(
    "SELECT start, end
     FROM {$inst_table}
     WHERE post_id = %d AND start >= UNIX_TIMESTAMP(CURDATE())
     ORDER BY start ASC
     LIMIT 1",
    $post_id
  ));

  // Fall back to most recent past instance
  if (!$row) {
    $row = $wpdb->get_row($wpdb->prepare(
      "SELECT start, end
       FROM {$inst_table}
       WHERE post_id = %d
       ORDER BY start DESC
       LIMIT 1",
      $post_id
    ));
  }

  // Last resort: master row in ai1ec_events
  if (!$row && ragbaz_table_exists($event_table)) {
    $row = $wpdb->get_row($wpdb->prepare(
      "SELECT start, end FROM {$event_table} WHERE post_id = %d LIMIT 1",
      $post_id
    ));
  }

  if ($row) {
    if (!empty($row->start)) {
      $result['start'] = ragbaz_normalize_iso_datetime($row->start);
    }
    if (!empty($row->end)) {
      $result['end'] = ragbaz_normalize_iso_datetime($row->end);
    }
  }

  return $result;
}

/**
 * Get a single column from Timely's ai1ec_events table for a post.
 * Used by allDay, timezone, venue, cost, ticket helpers.
 */
function ragbaz_get_timely_field($post_id, $column) {
  global $wpdb;
  $table = $wpdb->prefix . 'ai1ec_events';
  if (!ragbaz_table_exists($table)) return null;
  // Whitelist allowed columns to prevent SQL injection
  $allowed = ['allday', 'timezone_name', 'venue', 'address', 'city', 'province',
              'country', 'postal_code', 'cost', 'ticket_url', 'contact_url'];
  if (!in_array($column, $allowed, true)) return null;
  return $wpdb->get_var($wpdb->prepare(
    "SELECT `{$column}` FROM {$table} WHERE post_id = %d LIMIT 1",
    $post_id
  ));
}

function ragbaz_get_event_all_day($post_id) {
  $post_id = intval($post_id);
  if ($post_id <= 0) return null;

  // EO API
  if (function_exists('eo_is_all_day')) {
    return (bool) eo_is_all_day($post_id);
  }

  // EM: check em_events table directly
  global $wpdb;
  $em_table = $wpdb->prefix . 'em_events';
  if (ragbaz_table_exists($em_table)) {
    $val = $wpdb->get_var($wpdb->prepare(
      "SELECT event_all_day FROM {$em_table} WHERE post_id = %d LIMIT 1",
      $post_id
    ));
    if ($val !== null) return (bool) intval($val);
  }

  // Timely: allday column in ai1ec_events
  $timely = ragbaz_get_timely_field($post_id, 'allday');
  if ($timely !== null) return (bool) intval($timely);

  // TEC / WP Event Manager / generic meta
  $meta_keys = ['_EventAllDay', '_event_all_day', '_event_online'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if ($val !== '' && $val !== false) {
      return (bool) $val;
    }
  }

  return null;
}

function ragbaz_get_event_timezone($post_id) {
  $post_id = intval($post_id);
  if ($post_id <= 0) return null;

  // TEC meta
  $meta_keys = ['_EventTimezone'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if (is_string($val) && $val !== '') return $val;
  }

  // EM: event_timezone column in em_events table
  global $wpdb;
  $em_table = $wpdb->prefix . 'em_events';
  if (ragbaz_table_exists($em_table)) {
    $val = $wpdb->get_var($wpdb->prepare(
      "SELECT event_timezone FROM {$em_table} WHERE post_id = %d LIMIT 1",
      $post_id
    ));
    if (is_string($val) && $val !== '') return $val;
  }

  // Timely: timezone_name column in ai1ec_events
  $timely_tz = ragbaz_get_timely_field($post_id, 'timezone_name');
  if (is_string($timely_tz) && $timely_tz !== '') return $timely_tz;

  return get_option('timezone_string') ?: null;
}

function ragbaz_get_event_venue_name($post_id) {
  // EO API
  if (function_exists('eo_get_venue_name')) {
    $val = eo_get_venue_name(false, $post_id);
    if ($val) return $val;
  }
  // TEC API
  if (function_exists('tribe_get_venue')) {
    $val = tribe_get_venue($post_id);
    if ($val) return $val;
  }

  // EM: location_id in em_events → location_name in em_locations
  global $wpdb;
  $em_table = $wpdb->prefix . 'em_events';
  $loc_table = $wpdb->prefix . 'em_locations';
  if (ragbaz_table_exists($em_table) && ragbaz_table_exists($loc_table)) {
    $val = $wpdb->get_var($wpdb->prepare(
      "SELECT l.location_name
       FROM {$em_table} e
       JOIN {$loc_table} l ON e.location_id = l.location_id
       WHERE e.post_id = %d AND e.location_id > 0
       LIMIT 1",
      $post_id
    ));
    if ($val) return $val;
  }

  // Timely: venue column in ai1ec_events
  $timely_venue = ragbaz_get_timely_field($post_id, 'venue');
  if ($timely_venue) return $timely_venue;

  // WP Event Manager: _event_venue_name meta
  $wpem_venue = get_post_meta($post_id, '_event_venue_name', true);
  if (is_string($wpem_venue) && trim($wpem_venue) !== '') return $wpem_venue;

  // Taxonomy fallback
  $terms = wp_get_post_terms($post_id, ['event-venue', 'event_venue', 'tribe_venue']);
  if (!is_wp_error($terms) && !empty($terms)) {
    return $terms[0]->name;
  }

  return null;
}

function ragbaz_get_event_venue_address($post_id) {
  // EO API
  if (function_exists('eo_get_venue_address')) {
    $address = eo_get_venue_address(false, $post_id);
    if (is_array($address) && !empty($address)) {
      return implode(', ', array_filter($address));
    }
  }
  // TEC API
  if (function_exists('tribe_get_full_address')) {
    $addr = tribe_get_full_address($post_id, true);
    if ($addr) return $addr;
  }

  // EM: join em_locations to build address from location_address, location_town,
  // location_postcode, location_region, location_country columns
  global $wpdb;
  $em_table = $wpdb->prefix . 'em_events';
  $loc_table = $wpdb->prefix . 'em_locations';
  if (ragbaz_table_exists($em_table) && ragbaz_table_exists($loc_table)) {
    $loc = $wpdb->get_row($wpdb->prepare(
      "SELECT l.location_address, l.location_town, l.location_postcode, l.location_region, l.location_country
       FROM {$em_table} e
       JOIN {$loc_table} l ON e.location_id = l.location_id
       WHERE e.post_id = %d AND e.location_id > 0
       LIMIT 1",
      $post_id
    ));
    if ($loc) {
      $parts = array_filter([
        $loc->location_address ?? '',
        $loc->location_town ?? '',
        $loc->location_postcode ?? '',
        $loc->location_region ?? '',
        $loc->location_country ?? '',
      ], function ($p) { return trim($p) !== ''; });
      if (!empty($parts)) return implode(', ', $parts);
    }
  }

  // Timely: address, city, province, country, postal_code columns in ai1ec_events
  global $wpdb;
  $timely_table = $wpdb->prefix . 'ai1ec_events';
  if (ragbaz_table_exists($timely_table)) {
    $loc = $wpdb->get_row($wpdb->prepare(
      "SELECT address, city, province, country, postal_code FROM {$timely_table} WHERE post_id = %d LIMIT 1",
      $post_id
    ));
    if ($loc) {
      $parts = array_filter([
        $loc->address ?? '', $loc->city ?? '', $loc->province ?? '',
        $loc->postal_code ?? '', $loc->country ?? '',
      ], function ($p) { return trim($p) !== ''; });
      if (!empty($parts)) return implode(', ', $parts);
    }
  }

  // WP Event Manager / TEC / generic meta fallback
  $meta_keys = ['_event_location', '_VenueAddress', '_venue_address'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if (is_string($val) && trim($val) !== '') return $val;
  }

  return null;
}

function ragbaz_get_event_ticket_url($post_id) {
  $meta_keys = ['_EventURL', '_event_url', '_event_ticket_url'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if (is_string($val) && trim($val) !== '') return esc_url_raw($val);
  }
  // Timely: ticket_url column in ai1ec_events
  $timely = ragbaz_get_timely_field($post_id, 'ticket_url');
  if (is_string($timely) && trim($timely) !== '') return esc_url_raw($timely);
  return null;
}

function ragbaz_get_event_cost($post_id) {
  $meta_keys = ['_EventCost', '_event_cost', '_EventPrice', '_event_ticket_price'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if ($val !== '' && $val !== false) return (float) $val;
  }
  // Timely: cost column in ai1ec_events (free-text, e.g. "$25" or "Free")
  $timely = ragbaz_get_timely_field($post_id, 'cost');
  if (is_string($timely) && trim($timely) !== '') {
    $numeric = preg_replace('/[^0-9.]/', '', $timely);
    if ($numeric !== '' && is_numeric($numeric)) return (float) $numeric;
  }
  return null;
}

/**
 * Get all occurrences for an event post. Returns an array of
 * ['startDate' => iso, 'endDate' => iso, 'allDay' => bool] entries,
 * upcoming first (ASC), then past occurrences (DESC).
 *
 * Supports: Event Organiser (eo_events), Events Manager (em_events),
 * Timely (ai1ec_event_instances). For TEC and WP Event Manager (meta-based),
 * returns a single-element array with the post's own dates.
 */
function ragbaz_get_event_occurrences($post_id) {
  $post_id = intval($post_id);
  if ($post_id <= 0) return [];

  global $wpdb;
  $occurrences = [];

  // ── Event Organiser ──
  if (isset($wpdb->eo_events)) {
    // Upcoming occurrences first
    $upcoming = $wpdb->get_results($wpdb->prepare(
      "SELECT StartDate, StartTime, EndDate, FinishTime
       FROM {$wpdb->eo_events}
       WHERE post_id = %d AND StartDate >= CURDATE()
       ORDER BY StartDate ASC, StartTime ASC",
      $post_id
    ));
    // Then past occurrences (most recent first)
    $past = $wpdb->get_results($wpdb->prepare(
      "SELECT StartDate, StartTime, EndDate, FinishTime
       FROM {$wpdb->eo_events}
       WHERE post_id = %d AND StartDate < CURDATE()
       ORDER BY StartDate DESC, StartTime DESC",
      $post_id
    ));
    $rows = array_merge($upcoming ?: [], $past ?: []);
    foreach ($rows as $row) {
      $start = !empty($row->StartDate)
        ? ragbaz_normalize_iso_datetime($row->StartDate . 'T' . ($row->StartTime ?: '00:00:00'))
        : null;
      $end = !empty($row->EndDate)
        ? ragbaz_normalize_iso_datetime($row->EndDate . 'T' . ($row->FinishTime ?: '23:59:59'))
        : null;
      if ($start || $end) {
        $occurrences[] = ['startDate' => $start, 'endDate' => $end, 'allDay' => null];
      }
    }
    if (!empty($occurrences)) {
      // Resolve allDay once for the event
      $allDay = ragbaz_get_event_all_day($post_id);
      foreach ($occurrences as &$occ) { $occ['allDay'] = $allDay; }
      return $occurrences;
    }
  }

  // ── Events Manager ──
  $em_table = $wpdb->prefix . 'em_events';
  if (ragbaz_table_exists($em_table)) {
    $upcoming = $wpdb->get_results($wpdb->prepare(
      "SELECT event_start_date, event_start_time, event_end_date, event_end_time, event_all_day
       FROM {$em_table}
       WHERE post_id = %d AND (recurrence IS NULL OR recurrence != 1) AND event_start_date >= CURDATE()
       ORDER BY event_start_date ASC, event_start_time ASC",
      $post_id
    ));
    $past = $wpdb->get_results($wpdb->prepare(
      "SELECT event_start_date, event_start_time, event_end_date, event_end_time, event_all_day
       FROM {$em_table}
       WHERE post_id = %d AND (recurrence IS NULL OR recurrence != 1) AND event_start_date < CURDATE()
       ORDER BY event_start_date DESC, event_start_time DESC",
      $post_id
    ));
    $rows = array_merge($upcoming ?: [], $past ?: []);
    // Fallback: include recurrence templates if no occurrence rows found
    if (empty($rows)) {
      $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT event_start_date, event_start_time, event_end_date, event_end_time, event_all_day
         FROM {$em_table}
         WHERE post_id = %d
         ORDER BY event_start_date ASC",
        $post_id
      )) ?: [];
    }
    foreach ($rows as $row) {
      $start = !empty($row->event_start_date)
        ? ragbaz_normalize_iso_datetime($row->event_start_date . 'T' . ($row->event_start_time ?: '00:00:00'))
        : null;
      $end = !empty($row->event_end_date)
        ? ragbaz_normalize_iso_datetime($row->event_end_date . 'T' . ($row->event_end_time ?: '23:59:59'))
        : null;
      if ($start || $end) {
        $occurrences[] = [
          'startDate' => $start,
          'endDate' => $end,
          'allDay' => isset($row->event_all_day) ? (bool) intval($row->event_all_day) : null,
        ];
      }
    }
    if (!empty($occurrences)) return $occurrences;
  }

  // ── Timely ──
  $timely_inst = $wpdb->prefix . 'ai1ec_event_instances';
  $timely_evt  = $wpdb->prefix . 'ai1ec_events';
  if (ragbaz_table_exists($timely_inst)) {
    $upcoming = $wpdb->get_results($wpdb->prepare(
      "SELECT start, end FROM {$timely_inst}
       WHERE post_id = %d AND start >= UNIX_TIMESTAMP(CURDATE())
       ORDER BY start ASC",
      $post_id
    ));
    $past = $wpdb->get_results($wpdb->prepare(
      "SELECT start, end FROM {$timely_inst}
       WHERE post_id = %d AND start < UNIX_TIMESTAMP(CURDATE())
       ORDER BY start DESC",
      $post_id
    ));
    $rows = array_merge($upcoming ?: [], $past ?: []);
    $allDay = ragbaz_table_exists($timely_evt)
      ? (bool) intval(ragbaz_get_timely_field($post_id, 'allday'))
      : null;
    foreach ($rows as $row) {
      $start = !empty($row->start) ? ragbaz_normalize_iso_datetime($row->start) : null;
      $end   = !empty($row->end)   ? ragbaz_normalize_iso_datetime($row->end) : null;
      if ($start || $end) {
        $occurrences[] = ['startDate' => $start, 'endDate' => $end, 'allDay' => $allDay];
      }
    }
    if (!empty($occurrences)) return $occurrences;
  }

  // ── TEC / WP Event Manager (meta-based — single occurrence per post) ──
  $start = ragbaz_get_event_datetime($post_id, 'start');
  $end   = ragbaz_get_event_datetime($post_id, 'end');
  if ($start || $end) {
    return [['startDate' => $start, 'endDate' => $end, 'allDay' => ragbaz_get_event_all_day($post_id)]];
  }

  return [];
}

function ragbaz_detect_events_plugin() {
  $event_types = ['event', 'events', 'tribe_events', 'event_listing', 'eo_event', 'ai1ec_event'];
  foreach ($event_types as $type) {
    if (post_type_exists($type)) return true;
  }
  return false;
}

/**
 * Detect and return the name of the active event calendar plugin.
 * Returns null if no known plugin is found.
 */
function ragbaz_detect_events_plugin_name() {
  global $wpdb;
  // Event Organiser: registers 'event' post type, eo_events table exists
  if (isset($wpdb->eo_events) || (post_type_exists('event') && defined('EVENT_ORGANISER_VER'))) {
    return 'Event Organiser';
  }
  // The Events Calendar: registers 'tribe_events' post type
  if (post_type_exists('tribe_events') || class_exists('Tribe__Events__Main')) {
    return 'The Events Calendar';
  }
  // Events Manager: registers 'event' post type, em_events table exists
  $em_table = $wpdb->prefix . 'em_events';
  if (ragbaz_table_exists($em_table) || (post_type_exists('event') && defined('EM_VERSION'))) {
    return 'Events Manager';
  }
  // Timely (All-in-One Event Calendar): registers 'ai1ec_event' post type
  $timely_table = $wpdb->prefix . 'ai1ec_events';
  if (post_type_exists('ai1ec_event') || ragbaz_table_exists($timely_table) || defined('AI1EC_VERSION')) {
    return 'Timely';
  }
  // WP Event Manager: registers 'event_listing' post type
  if (post_type_exists('event_listing') || class_exists('WP_Event_Manager')) {
    return 'WP Event Manager';
  }
  // Generic event post type present but unknown plugin
  $event_types = ['event', 'events', 'eo_event'];
  foreach ($event_types as $type) {
    if (post_type_exists($type)) return 'Unknown (post type: ' . $type . ')';
  }
  return null;
}

function ragbaz_get_attachment_asset_meta_keys() {
  return [
    'ragbaz_asset_id' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetId'],
    'ragbaz_asset_owner_uri' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetOwnerUri'],
    'ragbaz_asset_uri' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetUri'],
    'ragbaz_asset_slug' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetSlug'],
    'ragbaz_asset_role' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetRole'],
    'ragbaz_asset_format' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetFormat'],
    'ragbaz_asset_variant_kind' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetVariantKind'],
    'ragbaz_asset_hash' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetHash'],
    'ragbaz_asset_original_url' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetOriginalUrl'],
    'ragbaz_asset_original_id' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetOriginalId'],
    'ragbaz_asset_mime' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetMime'],
    'ragbaz_asset_author_type' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetAuthorType'],
    'ragbaz_asset_author_id' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetAuthorId'],
    'ragbaz_asset_copyright_holder' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetCopyrightHolder'],
    'ragbaz_asset_license' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetLicense'],
    'ragbaz_asset_tooltip' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetTooltip'],
    'ragbaz_asset_usage_notes' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetUsageNotes'],
    'ragbaz_asset_structured_meta' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetStructuredMeta'],
    'ragbaz_asset_schema_ref' => ['type' => 'string', 'graphql_field_name' => 'ragbazAssetSchemaRef'],
    'ragbaz_asset_size' => ['type' => 'integer', 'graphql_field_name' => 'ragbazAssetSize'],
    'ragbaz_asset_width' => ['type' => 'integer', 'graphql_field_name' => 'ragbazAssetWidth'],
    'ragbaz_asset_height' => ['type' => 'integer', 'graphql_field_name' => 'ragbazAssetHeight'],
  ];
}

function ragbaz_register_attachment_asset_meta() {
  if (!function_exists('register_post_meta')) return;
  $meta_keys = ragbaz_get_attachment_asset_meta_keys();
  foreach ($meta_keys as $meta_key => $config) {
    $is_integer = $config['type'] === 'integer';
    register_post_meta('attachment', $meta_key, [
      'type' => $config['type'],
      'single' => true,
      'show_in_rest' => true,
      'show_in_graphql' => true,
      'graphql_field_name' => $config['graphql_field_name'],
      'sanitize_callback' => $is_integer ? 'absint' : 'sanitize_text_field',
      'auth_callback' => '__return_true',
    ]);
  }
}
add_action('init', 'ragbaz_register_attachment_asset_meta');

function ragbaz_get_attachment_asset_record($attachment_id) {
  $id = intval($attachment_id);
  if ($id <= 0) return null;

  $asset_id = ragbaz_sanitize_asset_id(get_post_meta($id, 'ragbaz_asset_id', true));
  $owner_uri = ragbaz_normalize_owner_uri(get_post_meta($id, 'ragbaz_asset_owner_uri', true));
  $asset_uri = ragbaz_sanitize_text(get_post_meta($id, 'ragbaz_asset_uri', true), 400);
  $asset_slug = ragbaz_sanitize_asset_slug(get_post_meta($id, 'ragbaz_asset_slug', true));
  $role = ragbaz_sanitize_text(get_post_meta($id, 'ragbaz_asset_role', true), 40);
  $format = ragbaz_sanitize_text(get_post_meta($id, 'ragbaz_asset_format', true), 40);
  $variant_kind = ragbaz_sanitize_text(get_post_meta($id, 'ragbaz_asset_variant_kind', true), 80);
  $source_hash = ragbaz_sanitize_text(get_post_meta($id, 'ragbaz_asset_hash', true), 180);
  $original_url = esc_url_raw(get_post_meta($id, 'ragbaz_asset_original_url', true));
  $original_id = ragbaz_sanitize_text(get_post_meta($id, 'ragbaz_asset_original_id', true), 96);
  $mime_type = ragbaz_sanitize_text(get_post_meta($id, 'ragbaz_asset_mime', true), 120);
  if ($mime_type === '') {
    $mime_type = ragbaz_sanitize_text(get_post_mime_type($id), 120);
  }
  $metadata = wp_get_attachment_metadata($id);
  $width = ragbaz_normalize_positive_int(get_post_meta($id, 'ragbaz_asset_width', true));
  if (is_null($width) && is_array($metadata) && isset($metadata['width'])) {
    $width = ragbaz_normalize_positive_int($metadata['width']);
  }
  $height = ragbaz_normalize_positive_int(get_post_meta($id, 'ragbaz_asset_height', true));
  if (is_null($height) && is_array($metadata) && isset($metadata['height'])) {
    $height = ragbaz_normalize_positive_int($metadata['height']);
  }
  $size = ragbaz_normalize_positive_int(get_post_meta($id, 'ragbaz_asset_size', true));
  if (is_null($size) && is_array($metadata) && isset($metadata['filesize'])) {
    $size = ragbaz_normalize_positive_int($metadata['filesize']);
  }
  if (is_null($size)) {
    $file = get_attached_file($id);
    if (is_string($file) && $file !== '' && file_exists($file)) {
      $size = ragbaz_normalize_positive_int(filesize($file));
    }
  }

  if ($asset_uri === '' && $asset_id !== '') {
    $asset_uri = ragbaz_build_asset_uri($asset_id);
  }
  if ($variant_kind === '' && $role === 'original') {
    $variant_kind = 'original';
  }
  if ($original_id === '' && $variant_kind === 'original') {
    $original_id = (string) $id;
  }
  if ($original_url === '' && $variant_kind === 'original') {
    $own_url = wp_get_attachment_url($id);
    if (is_string($own_url) && $own_url !== '') {
      $original_url = esc_url_raw($own_url);
    }
  }

  return [
    'attachmentId' => $id,
    'assetId' => $asset_id,
    'ownerUri' => $owner_uri,
    'uri' => $asset_uri,
    'slug' => $asset_slug,
    'role' => $role,
    'format' => $format,
    'variantKind' => $variant_kind,
    'hash' => $source_hash,
    'originalUrl' => $original_url,
    'originalId' => $original_id,
    'mime' => $mime_type,
    'size' => $size,
    'width' => $width,
    'height' => $height,
    'url' => esc_url_raw(wp_get_attachment_url($id)),
  ];
}

function ragbaz_get_attachment_variants($asset_id) {
  static $variants_cache = [];
  $safe_asset_id = ragbaz_sanitize_asset_id($asset_id);
  if ($safe_asset_id === '') return [];
  if (array_key_exists($safe_asset_id, $variants_cache)) {
    return $variants_cache[$safe_asset_id];
  }

  $attachment_ids = get_posts([
    'post_type' => 'attachment',
    'post_status' => 'inherit',
    'fields' => 'ids',
    'posts_per_page' => 200,
    'orderby' => 'ID',
    'order' => 'ASC',
    'meta_key' => 'ragbaz_asset_id',
    'meta_value' => $safe_asset_id,
    'no_found_rows' => true,
    'suppress_filters' => false,
  ]);

  $rows = [];
  foreach ((array) $attachment_ids as $attachment_id) {
    $record = ragbaz_get_attachment_asset_record($attachment_id);
    if (!$record) continue;
    $rows[] = [
      'sourceId' => intval($record['attachmentId']),
      'url' => $record['url'] !== '' ? $record['url'] : null,
      'mime' => $record['mime'] !== '' ? $record['mime'] : null,
      'size' => is_null($record['size']) ? null : intval($record['size']),
      'width' => is_null($record['width']) ? null : intval($record['width']),
      'height' => is_null($record['height']) ? null : intval($record['height']),
      'format' => $record['format'] !== '' ? $record['format'] : null,
      'role' => $record['role'] !== '' ? $record['role'] : null,
      'variantKind' => $record['variantKind'] !== '' ? $record['variantKind'] : null,
      'hash' => $record['hash'] !== '' ? $record['hash'] : null,
      'originalId' => $record['originalId'] !== '' ? $record['originalId'] : null,
      'originalUrl' => $record['originalUrl'] !== '' ? $record['originalUrl'] : null,
    ];
  }

  usort($rows, function ($a, $b) {
    $left_original = isset($a['variantKind']) && $a['variantKind'] === 'original';
    $right_original = isset($b['variantKind']) && $b['variantKind'] === 'original';
    if ($left_original !== $right_original) {
      return $left_original ? -1 : 1;
    }
    return intval($a['sourceId']) <=> intval($b['sourceId']);
  });

  $variants_cache[$safe_asset_id] = $rows;
  return $rows;
}

function ragbaz_get_attachment_asset_payload($attachment_id) {
  $record = ragbaz_get_attachment_asset_record($attachment_id);
  if (!$record) return null;
  $variants = $record['assetId'] !== '' ? ragbaz_get_attachment_variants($record['assetId']) : [];
  $original = [
    'id' => $record['originalId'] !== '' ? $record['originalId'] : null,
    'url' => $record['originalUrl'] !== '' ? $record['originalUrl'] : null,
  ];
  return [
    'assetId' => $record['assetId'] !== '' ? $record['assetId'] : null,
    'ownerUri' => $record['ownerUri'] !== '' ? $record['ownerUri'] : '/',
    'uri' => $record['uri'] !== '' ? $record['uri'] : null,
    'slug' => $record['slug'] !== '' ? $record['slug'] : null,
    'role' => $record['role'] !== '' ? $record['role'] : null,
    'format' => $record['format'] !== '' ? $record['format'] : null,
    'variantKind' => $record['variantKind'] !== '' ? $record['variantKind'] : null,
    'hash' => $record['hash'] !== '' ? $record['hash'] : null,
    'mime' => $record['mime'] !== '' ? $record['mime'] : null,
    'size' => is_null($record['size']) ? null : intval($record['size']),
    'dimensions' => [
      'width' => is_null($record['width']) ? null : intval($record['width']),
      'height' => is_null($record['height']) ? null : intval($record['height']),
    ],
    'original' => $original,
    'variants' => $variants,
  ];
}

function ragbaz_register_attachment_asset_rest_field() {
  if (!function_exists('register_rest_field')) return;
  register_rest_field('attachment', 'ragbaz_asset', [
    'get_callback' => function ($object) {
      $id = 0;
      if (is_array($object) && isset($object['id'])) {
        $id = intval($object['id']);
      } elseif (is_object($object) && isset($object->ID)) {
        $id = intval($object->ID);
      }
      if ($id <= 0) return null;
      return ragbaz_get_attachment_asset_payload($id);
    },
    'schema' => [
      'description' => 'Normalized RAGBAZ asset metadata for this attachment.',
      'type' => ['object', 'null'],
      'context' => ['view', 'edit'],
    ],
  ]);
}
add_action('rest_api_init', 'ragbaz_register_attachment_asset_rest_field');

function ragbaz_event_occurrences_enabled() {
  return get_option('ragbaz_event_expand_occurrences', '0') === '1';
}

function ragbaz_get_capabilities() {
  $version = RAGBAZ_VERSION;
  $is_semver = preg_match('/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/', $version) === 1;
  return [
    'pluginPresent' => true,
    'pluginVersion' => $version,
    'pluginSemver' => $is_semver ? $version : null,
    'assetMetaSchemaVersion' => '1.0.0',
    'assetMetaRestField' => true,
    'assetMetaGraphqlField' => true,
    'eventOccurrences' => ragbaz_event_occurrences_enabled(),
  ];
}

// ---------------------------------------------------------------------------
// Admin UI: surface storefront link in plugin row + lightweight notice
// ---------------------------------------------------------------------------
function ragbaz_plugin_row_links($links) {
  $links[] = sprintf(
    '<a href="%s">%s</a>',
    esc_url(admin_url('tools.php?page=ragbaz-bridge')),
    esc_html__('Settings', 'ragbaz')
  );
  $links[] = sprintf(
    '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
    'https://ragbaz.xyz',
    'RAGBAZ.xyz'
  );
  return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'ragbaz_plugin_row_links');
add_filter('plugin_row_meta', function ($links, $file) {
  if ($file === plugin_basename(__FILE__)) {
    $links[] = '<a href="https://ragbaz.xyz/products" target="_blank" rel="noopener noreferrer">RAGBAZ.xyz/products</a>';
  }
  return $links;
}, 10, 2);

function ragbaz_admin_notice() {
  if (!current_user_can('manage_options')) return;
  if (defined('DOING_AJAX') && DOING_AJAX) return;
  if (get_transient('ragbaz_bridge_notice_shown')) return;
  set_transient('ragbaz_bridge_notice_shown', '1', DAY_IN_SECONDS);
  $url = esc_url(admin_url('tools.php?page=ragbaz-bridge'));
  echo '<div class="notice notice-info is-dismissible"><p>';
  printf(
    __('RAGBAZ Bridge is active. <a href="%s">View settings &amp; debug info</a>.', 'ragbaz'),
    $url
  );
  echo '</p></div>';
}
add_action('admin_notices', 'ragbaz_admin_notice');
add_action('network_admin_notices', 'ragbaz_admin_notice');

// ── Stale directory detection ────────────────────────────────────────────────

/**
 * Returns a list of known legacy plugin directories that are still present on disk
 * (but are NOT this file's own directory, to avoid false positives after rename).
 */
function ragbaz_find_stale_dirs() {
  if (!defined('WP_PLUGIN_DIR')) return [];
  $legacy = [
    'ragbaz-bridge',
    'ragbaz-bridge-plugin',
    'articulate-learnpress-stripe',
  ];
  $own_dir = basename(dirname(__FILE__));
  $found = [];
  foreach ($legacy as $dir) {
    if ($dir === $own_dir) continue;
    $path = WP_PLUGIN_DIR . '/' . $dir;
    if (is_dir($path)) {
      $found[] = $path;
    }
  }
  return $found;
}

/**
 * Recursively deletes a directory and all its contents using WP_Filesystem.
 * Returns true on full success, false if anything could not be removed.
 */
function ragbaz_rmdir_recursive($path) {
  global $wp_filesystem;
  if (!isset($wp_filesystem)) {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    WP_Filesystem();
  }
  if (!$wp_filesystem->is_dir($path)) return false;
  // WP_Filesystem::delete() with $recursive = true removes directory trees.
  return $wp_filesystem->delete($path, true);
}

/**
 * Handle the "delete stale dirs" admin-POST action.
 * Hooked early (admin_init) so it can redirect before any output.
 */
function ragbaz_handle_delete_stale_dirs() {
  if (!isset($_POST['ragbaz_delete_stale_dirs'])) return;
  check_admin_referer('ragbaz_delete_stale_dirs');
  if (!current_user_can('manage_options')) wp_die(esc_html__('Unauthorized', 'ragbaz'));

  $stale   = ragbaz_find_stale_dirs();
  $deleted = [];
  $failed  = [];
  foreach ($stale as $path) {
    if (ragbaz_rmdir_recursive($path)) {
      $deleted[] = basename($path);
    } else {
      $failed[] = $path;
    }
  }

  $msg = '';
  if (!empty($deleted)) {
    $msg .= 'ragbaz_deleted=' . rawurlencode(implode(',', $deleted));
  }
  if (!empty($failed)) {
    $msg .= ($msg ? '&' : '') . 'ragbaz_failed=' . rawurlencode(implode(',', $failed));
  }

  $redirect = add_query_arg(
    array_filter([
      'page'            => isset($_POST['ragbaz_return_page']) ? sanitize_key($_POST['ragbaz_return_page']) : null,
      'ragbaz_deleted'  => !empty($deleted) ? implode(',', $deleted) : null,
      'ragbaz_failed'   => !empty($failed)  ? implode(',', $failed)  : null,
    ]),
    admin_url('tools.php')
  );
  wp_redirect($redirect);
  exit;
}
add_action('admin_init', 'ragbaz_handle_delete_stale_dirs');

function ragbaz_stale_dirs_notice() {
  if (!current_user_can('manage_options')) return;

  // Show result feedback from a just-completed deletion.
  if (!empty($_GET['ragbaz_deleted'])) {
    $dirs = esc_html(sanitize_text_field(wp_unslash($_GET['ragbaz_deleted'])));
    echo '<div class="notice notice-success is-dismissible"><p>';
    echo '<strong>RAGBAZ Bridge:</strong> Deleted legacy director' . (strpos($dirs, ',') !== false ? 'ies' : 'y') . ': <code>' . $dirs . '</code></p></div>';
  }
  if (!empty($_GET['ragbaz_failed'])) {
    $dirs = esc_html(sanitize_text_field(wp_unslash($_GET['ragbaz_failed'])));
    echo '<div class="notice notice-error"><p>';
    echo '<strong>RAGBAZ Bridge:</strong> Could not delete (check filesystem permissions): <code>' . $dirs . '</code></p></div>';
  }

  $stale = ragbaz_find_stale_dirs();
  if (empty($stale)) return;

  $return_page = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
  echo '<div class="notice notice-warning"><p>';
  echo '<strong>RAGBAZ Bridge:</strong> Legacy plugin director' . (count($stale) > 1 ? 'ies' : 'y') . ' found — no longer needed and may cause conflicts:</p>';
  echo '<ul style="margin:.4em 0 .8em 1.4em;list-style:disc">';
  foreach ($stale as $path) {
    echo '<li><code>' . esc_html($path) . '</code></li>';
  }
  echo '</ul>';
  echo '<form method="post" style="display:inline">';
  wp_nonce_field('ragbaz_delete_stale_dirs');
  echo '<input type="hidden" name="ragbaz_return_page" value="' . esc_attr($return_page) . '">';
  echo '<input type="hidden" name="ragbaz_delete_stale_dirs" value="1">';
  submit_button('Delete old directories', 'small', '', false, ['style' => 'margin-right:12px']);
  echo '</form>';
  echo '<span style="color:#92400e;font-size:13px">or via WP-CLI: <code>wp plugin delete ';
  echo esc_html(implode(' ', array_map('basename', $stale)));
  echo '</code></span>';
  echo '</div>';
}
add_action('admin_notices', 'ragbaz_stale_dirs_notice');
add_action('network_admin_notices', 'ragbaz_stale_dirs_notice');

function ragbaz_register_info_page() {
  add_management_page(
    'RAGBAZ Bridge',
    'RAGBAZ Bridge',
    'manage_options',
    'ragbaz-bridge',
    'ragbaz_render_info_page'
  );
}
add_action('admin_menu', 'ragbaz_register_info_page');

function ragbaz_bool_label($value) {
  return $value ? 'on' : 'off';
}

// ── Plugin detection helpers ────────────────────────────────────────────────

function ragbaz_plugin_active($basename) {
  return ragbaz_is_plugin_active_anywhere($basename);
}

function ragbaz_get_plugin_inventory() {
  return [
    'required' => [
      [
        'name'    => 'WPGraphQL',
        'slug'    => 'wp-graphql/wp-graphql.php',
        'url'     => 'https://wordpress.org/plugins/wp-graphql/',
        'purpose' => 'Core GraphQL API for WordPress. All RAGBAZ Bridge features depend on this.',
      ],
    ],
    'authentication' => [
      [
        'name'    => 'FaustWP',
        'slug'    => 'faustwp/faustwp.php',
        'url'     => 'https://wordpress.org/plugins/faustwp/',
        'purpose' => 'Stores the headless site secret (faustwp_settings[\'secret_key\']) that RAGBAZ Bridge reads for built-in auth. Install and configure the secret key here.',
      ],
      [
        'name'    => 'WPGraphQL Headless Login',
        'slug'    => 'wp-graphql-headless-login/wp-graphql-headless-login.php',
        'url'     => 'https://wordpress.org/plugins/wp-graphql-headless-login/',
        'purpose' => 'Adds SITETOKEN + OAuth login mutations to WPGraphQL. Required for JWT-based auth flow (login mutation → authToken). Optional if using RAGBAZ Bridge built-in auth.',
      ],
      [
        'name'    => 'WPGraphQL JWT Authentication',
        'slug'    => 'wp-graphql-jwt-authentication/wp-graphql-jwt-authentication.php',
        'url'     => 'https://github.com/wp-graphql/wp-graphql-jwt-authentication',
        'purpose' => 'Alternative JWT auth for WPGraphQL. Use either this or WPGraphQL Headless Login — not both.',
      ],
    ],
    'content' => [
      [
        'name'    => 'LearnPress',
        'slug'    => 'learnpress/learnpress.php',
        'url'     => 'https://wordpress.org/plugins/learnpress/',
        'purpose' => 'LMS plugin. RAGBAZ Bridge exposes LpCourse types with price, duration, curriculum, instructor, and enrolment fields.',
      ],
      [
        'name'    => 'Event Organiser',
        'slug'    => 'event-organiser/event-organiser.php',
        'url'     => 'https://wordpress.org/plugins/event-organiser/',
        'purpose' => 'Events plugin. RAGBAZ Bridge normalises event date/time, venue, cost, and ticket URL fields.',
      ],
      [
        'name'    => 'The Events Calendar',
        'slug'    => 'the-events-calendar/the-events-calendar.php',
        'url'     => 'https://wordpress.org/plugins/the-events-calendar/',
        'purpose' => 'Alternative events plugin (tribe_events post type). RAGBAZ Bridge auto-detects and normalises.',
      ],
      [
        'name'    => 'Events Manager',
        'slug'    => 'events-manager/events-manager.php',
        'url'     => 'https://wordpress.org/plugins/events-manager/',
        'purpose' => 'Another events plugin. RAGBAZ Bridge normalises dates, venue, and cost.',
      ],
    ],
    'ecommerce' => [
      [
        'name'    => 'WooCommerce',
        'slug'    => 'woocommerce/woocommerce.php',
        'url'     => 'https://wordpress.org/plugins/woocommerce/',
        'purpose' => 'eCommerce platform. Combined with WPGraphQL for WooCommerce, exposes products, orders, and cart via GraphQL.',
      ],
      [
        'name'    => 'WPGraphQL for WooCommerce',
        'slug'    => 'wp-graphql-woocommerce/wp-graphql-woocommerce.php',
        'url'     => 'https://wordpress.org/plugins/wp-graphql-woocommerce/',
        'purpose' => 'GraphQL schema for WooCommerce. RAGBAZ Bridge adds price and stock normalisation fields.',
      ],
    ],
    'performance' => [
      [
        'name'    => 'Redis Object Cache',
        'slug'    => 'redis-cache/redis-cache.php',
        'url'     => 'https://wordpress.org/plugins/redis-cache/',
        'purpose' => 'Persistent object cache. Strongly recommended in production — reduces database queries on every GraphQL request.',
      ],
      [
        'name'    => 'Query Monitor',
        'slug'    => 'query-monitor/query-monitor.php',
        'url'     => 'https://wordpress.org/plugins/query-monitor/',
        'purpose' => 'Development-only debugging tool. Disable in production — adds overhead to every request.',
      ],
    ],
  ];
}

// ── Auth status ─────────────────────────────────────────────────────────────

function ragbaz_get_auth_status() {
  $secret = ragbaz_get_site_secret();
  $relay = ragbaz_get_home_graphql_relay_settings(false);
  $secret_source = '';
  if ($secret) {
    $faust = get_option('faustwp_settings', []);
    $secret_source = !empty($faust['secret_key']) ? 'FaustWP settings' : 'ragbaz_site_secret option';
  }
  $headless_id = ragbaz_get_headless_user_id();
  $headless_user = $headless_id ? get_user_by('id', $headless_id) : null;

  return [
    'secret_configured'   => !empty($secret),
    'secret_source'       => $secret_source,
    'secret_preview'      => $secret ? substr($secret, 0, 8) . '…' : '',
    'headless_user_id'    => $headless_id,
    'headless_user_login' => $headless_user ? $headless_user->user_login : '',
    'headless_user_roles' => $headless_user ? implode(', ', $headless_user->roles) : '',
    'faust_active'        => ragbaz_plugin_active('faustwp/faustwp.php'),
    'headless_login_active' => ragbaz_plugin_active('wp-graphql-headless-login/wp-graphql-headless-login.php'),
    'wpgraphql_active'    => function_exists('register_graphql_field'),
    'content_restricted'  => (bool) apply_filters('graphql_require_authentication', false),
    'graphql_relay_enabled' => (bool) $relay['enabled'],
    'graphql_relay_header' => (string) $relay['header_name'],
    'graphql_relay_secret_preview' => (string) $relay['secret_preview'],
  ];
}

// ── Debug payload for Connect panel ─────────────────────────────────────────

function ragbaz_build_debug_payload() {
  global $wp_version;
  $auth = ragbaz_get_auth_status();
  $runtime = ragbaz_get_wp_runtime_status();
  $inventory = ragbaz_get_plugin_inventory();
  $plugin_status = [];
  foreach ($inventory as $group) {
    foreach ($group as $p) {
      $plugin_status[$p['slug']] = ragbaz_plugin_active($p['slug']);
    }
  }
  return [
    'ragbaz_bridge_version' => RAGBAZ_VERSION,
    'wp_version'            => $wp_version,
    'php_version'           => PHP_VERSION,
    'site_url'              => get_site_url(),
    'graphql_endpoint'      => get_site_url() . '/graphql',
    'auth' => [
      'secret_configured'   => $auth['secret_configured'],
      'secret_source'       => $auth['secret_source'],
      'headless_user_login' => $auth['headless_user_login'],
      'headless_user_roles' => $auth['headless_user_roles'],
      'faust_active'        => $auth['faust_active'],
      'headless_login_active' => $auth['headless_login_active'],
    ],
    'plugins'   => $plugin_status,
    'runtime'   => $runtime,
    'generated' => gmdate('c'),
  ];
}

// ── Home connect helpers ───────────────────────────────────────────────────

function ragbaz_get_home_base_url() {
  $raw = trim((string) get_option('ragbaz_home_base_url', 'https://ragbaz.xyz'));
  if ($raw === '') $raw = 'https://ragbaz.xyz';
  $safe = esc_url_raw($raw);
  if (!$safe) return 'https://ragbaz.xyz';
  return untrailingslashit($safe);
}

function ragbaz_get_home_credentials() {
  return [
    'account_id' => trim((string) get_option('ragbaz_home_account_id', '')),
    'passkey'    => trim((string) get_option('ragbaz_home_passkey', '')),
    'gift_key'   => trim((string) get_option('ragbaz_home_gift_key', '')),
    'tenant_slug'=> ragbaz_sanitize_tenant_slug((string) get_option('ragbaz_home_tenant_slug', '')),
  ];
}

function ragbaz_generate_home_graphql_relay_secret() {
  try {
    return bin2hex(random_bytes(24));
  } catch (Throwable $e) {
    return strtolower(wp_generate_password(48, false, false));
  }
}

function ragbaz_get_home_graphql_relay_settings($ensure_secret = true) {
  $enabled_raw = get_option('ragbaz_home_graphql_relay_enabled', '1');
  $enabled = !in_array(strtolower((string) $enabled_raw), ['0', 'false', 'no', 'off'], true);
  $secret = trim((string) get_option('ragbaz_home_graphql_relay_secret', ''));
  if ($enabled && $ensure_secret && $secret === '') {
    $secret = ragbaz_generate_home_graphql_relay_secret();
    update_option('ragbaz_home_graphql_relay_secret', $secret, false);
  }

  return [
    'enabled' => (bool) $enabled,
    'mode' => 'secret-header',
    'header_name' => 'x-ragbaz-relay-secret',
    'graphql_url' => untrailingslashit(get_site_url()) . '/graphql',
    'secret' => $secret,
    'secret_preview' => $secret !== '' ? substr($secret, 0, 8) . '…' : '',
  ];
}

function ragbaz_get_home_connection_graphql_payload() {
  $base_url = ragbaz_get_home_base_url();
  $creds = ragbaz_get_home_credentials();
  $relay = ragbaz_get_home_graphql_relay_settings(false);
  $account_id = preg_replace('/[^a-z0-9]/', '', strtolower((string) $creds['account_id']));
  $passkey = preg_replace('/[^a-z0-9]/', '', strtolower((string) $creds['passkey']));
  $gift_key = preg_replace('/[^a-z0-9-]/', '', strtolower((string) $creds['gift_key']));
  $tenant_slug = ragbaz_sanitize_tenant_slug((string) ($creds['tenant_slug'] ?? ''));

  return [
    'baseUrl' => $base_url,
    'accountId' => $account_id,
    'passkey' => $passkey,
    'giftKey' => $gift_key,
    'tenantSlug' => $tenant_slug,
    'canPhoneHome' => ($account_id !== '' && $passkey !== ''),
    'graphqlRelay' => [
      'enabled' => (bool) $relay['enabled'],
      'mode' => (string) $relay['mode'],
      'headerName' => (string) $relay['header_name'],
      'graphqlUrl' => (string) $relay['graphql_url'],
    ],
  ];
}

function ragbaz_set_home_last_result($status, $message, $extra = []) {
  $payload = [
    'status'  => $status,
    'message' => ragbaz_sanitize_text($message, 400),
    'time'    => gmdate('c'),
    'extra'   => is_array($extra) ? $extra : [],
  ];
  update_option('ragbaz_home_last_result', $payload, false);
  return $payload;
}

function ragbaz_get_home_last_result() {
  $value = get_option('ragbaz_home_last_result', null);
  return is_array($value) ? $value : null;
}

function ragbaz_collect_installed_plugins() {
  if (!function_exists('get_plugins')) {
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
  }
  $all = function_exists('get_plugins') ? get_plugins() : [];
  if (!is_array($all)) return [];

  $output = [];
  foreach ($all as $slug => $meta) {
    $output[] = [
      'slug'    => sanitize_text_field($slug),
      'name'    => isset($meta['Name']) ? sanitize_text_field($meta['Name']) : sanitize_text_field($slug),
      'version' => isset($meta['Version']) ? sanitize_text_field($meta['Version']) : '',
      'active'  => ragbaz_plugin_active($slug),
    ];
  }
  return array_slice($output, 0, 250);
}

function ragbaz_build_home_payload() {
  global $wp_version;
  $creds = ragbaz_get_home_credentials();
  $runtime = ragbaz_get_wp_runtime_status();
  $relay = ragbaz_get_home_graphql_relay_settings(true);
  $site_url = get_site_url();
  $site_host = '';
  $parsed = wp_parse_url($site_url);
  if (is_array($parsed) && !empty($parsed['host'])) {
    $site_host = strtolower((string) $parsed['host']);
  }

  return [
    'capturedAt' => gmdate('c'),
    'site' => [
      'url'        => $site_url,
      'host'       => $site_host,
      'name'       => get_bloginfo('name'),
      'locale'     => get_locale(),
      'wpVersion'  => (string) $wp_version,
      'phpVersion' => (string) PHP_VERSION,
    ],
    'plugin' => [
      'version'                  => RAGBAZ_VERSION,
      'hasWpGraphql'             => function_exists('register_graphql_field'),
      'hasWpGraphqlSmartCache'   => ragbaz_plugin_active('wpgraphql-smart-cache/wpgraphql-smart-cache.php'),
      'hasRagbazGraphqlBridge'   => true,
    ],
    'graphqlRelay' => [
      'enabled' => (bool) $relay['enabled'],
      'mode' => (string) $relay['mode'],
      'headerName' => (string) $relay['header_name'],
      'graphqlUrl' => (string) $relay['graphql_url'],
      'secret' => $relay['enabled'] ? (string) $relay['secret'] : '',
    ],
    'tenant' => [
      'preferredSlug' => ragbaz_sanitize_tenant_slug((string) ($creds['tenant_slug'] ?? '')),
    ],
    'runtime' => [
      'wpDebug'                 => (bool) $runtime['wpDebug'],
      'wpDebugLog'              => (bool) $runtime['wpDebugLog'],
      'scriptDebug'             => (bool) $runtime['scriptDebug'],
      'saveQueries'             => (bool) $runtime['saveQueries'],
      'graphqlDebug'            => (bool) $runtime['graphqlDebug'],
      'queryMonitorActive'      => (bool) $runtime['queryMonitorActive'],
      'xdebugLoaded'            => (bool) $runtime['xdebugActive'],
      'objectCacheEnabled'      => (bool) $runtime['objectCacheEnabled'],
      'objectCacheDropInPresent'=> (bool) $runtime['objectCacheDropInPresent'],
      'redisPluginActive'       => (bool) $runtime['redisPluginActive'],
      'memcachedPluginActive'   => (bool) $runtime['memcachedPluginActive'],
      'opcacheEnabled'          => (bool) $runtime['opcacheEnabled'],
    ],
    'plugins' => ragbaz_collect_installed_plugins(),
    'notes' => [
      'Payload generated by RAGBAZ Bridge Connect panel.',
    ],
    'tags' => [
      'ragbaz-bridge',
      'manual-connect',
    ],
  ];
}

function ragbaz_is_sequential_array($value) {
  if (!is_array($value)) return false;
  $index = 0;
  foreach (array_keys($value) as $key) {
    if ($key !== $index) return false;
    $index++;
  }
  return true;
}

function ragbaz_canonical_json($value) {
  if (is_null($value)) return 'null';
  if (is_bool($value)) return $value ? 'true' : 'false';

  if (is_int($value) || is_float($value)) {
    if (is_float($value) && !is_finite($value)) return 'null';
    $encoded_number = wp_json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return is_string($encoded_number) ? $encoded_number : 'null';
  }

  if (is_string($value)) {
    $encoded_string = wp_json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return is_string($encoded_string) ? $encoded_string : '""';
  }

  if (is_array($value)) {
    if (ragbaz_is_sequential_array($value)) {
      $items = [];
      foreach ($value as $item) {
        $items[] = ragbaz_canonical_json($item);
      }
      return '[' . implode(',', $items) . ']';
    }

    $normalized = [];
    foreach ($value as $k => $v) {
      $normalized[(string) $k] = $v;
    }
    ksort($normalized, SORT_STRING);
    $items = [];
    foreach ($normalized as $k => $v) {
      $items[] = ragbaz_canonical_json((string) $k) . ':' . ragbaz_canonical_json($v);
    }
    return '{' . implode(',', $items) . '}';
  }

  if (is_object($value)) {
    return ragbaz_canonical_json(get_object_vars($value));
  }

  return 'null';
}

function ragbaz_home_request_json($method, $path, $body = null, $query = []) {
  $base = ragbaz_get_home_base_url();
  $url = $base . '/' . ltrim((string) $path, '/');
  if (is_array($query) && !empty($query)) {
    $url = add_query_arg($query, $url);
  }
  $request_args = [
    'method'  => strtoupper((string) $method),
    'timeout' => 20,
    'headers' => ['Content-Type' => 'application/json; charset=utf-8'],
  ];
  if (!is_null($body)) {
    $request_args['body'] = wp_json_encode($body);
  }

  $response = wp_remote_request($url, $request_args);
  if (is_wp_error($response)) {
    return ['ok' => false, 'status' => 0, 'error' => $response->get_error_message()];
  }
  $status = intval(wp_remote_retrieve_response_code($response));
  $raw = wp_remote_retrieve_body($response);
  $json = json_decode((string) $raw, true);

  if ($status >= 200 && $status < 300) {
    return ['ok' => true, 'status' => $status, 'data' => is_array($json) ? $json : ['raw' => $raw]];
  }
  return [
    'ok' => false,
    'status' => $status,
    'error' => is_array($json) && !empty($json['error']) ? $json['error'] : 'home_request_failed',
    'data' => is_array($json) ? $json : ['raw' => $raw],
  ];
}

function ragbaz_home_post_json($path, $body) {
  return ragbaz_home_request_json('POST', $path, $body);
}

function ragbaz_auto_onboard_home() {
  $challenge_result = ragbaz_home_request_json('GET', '/api/v1/home', null, [
    'site_url' => get_site_url(),
    'plugin_version' => RAGBAZ_VERSION,
  ]);
  if (empty($challenge_result['ok'])) {
    return [
      'ok' => false,
      'status' => isset($challenge_result['status']) ? intval($challenge_result['status']) : 0,
      'error' => isset($challenge_result['error']) ? (string) $challenge_result['error'] : 'challenge_request_failed',
      'data' => isset($challenge_result['data']) && is_array($challenge_result['data']) ? $challenge_result['data'] : [],
    ];
  }

  $challenge = isset($challenge_result['data']['challenge']) && is_array($challenge_result['data']['challenge'])
    ? $challenge_result['data']['challenge']
    : null;
  if (!$challenge) {
    return ['ok' => false, 'status' => 0, 'error' => 'challenge_missing'];
  }

  $challenge_id = sanitize_text_field((string) ($challenge['id'] ?? ''));
  $challenge_nonce = sanitize_text_field((string) ($challenge['nonce'] ?? ''));
  $challenge_signature = sanitize_text_field((string) ($challenge['signature'] ?? ''));
  $challenge_issued_at = sanitize_text_field((string) ($challenge['issuedAt'] ?? ''));
  $challenge_expires_at = sanitize_text_field((string) ($challenge['expiresAt'] ?? ''));
  if ($challenge_id === '' || $challenge_nonce === '' || $challenge_signature === '' || $challenge_issued_at === '' || $challenge_expires_at === '') {
    return ['ok' => false, 'status' => 0, 'error' => 'challenge_shape_invalid'];
  }

  $payload = ragbaz_build_home_payload();
  $payload_signature = hash('sha256', $challenge_id . ':' . $challenge_nonce . ':' . ragbaz_canonical_json($payload));
  $register_result = ragbaz_home_post_json('/api/v1/home', [
    'challenge' => [
      'id' => $challenge_id,
      'nonce' => $challenge_nonce,
      'signature' => $challenge_signature,
      'issuedAt' => $challenge_issued_at,
      'expiresAt' => $challenge_expires_at,
    ],
    'payload' => $payload,
    'payloadSignature' => $payload_signature,
  ]);

  if (empty($register_result['ok'])) {
    return [
      'ok' => false,
      'status' => isset($register_result['status']) ? intval($register_result['status']) : 0,
      'error' => isset($register_result['error']) ? (string) $register_result['error'] : 'register_failed',
      'data' => isset($register_result['data']) && is_array($register_result['data']) ? $register_result['data'] : [],
    ];
  }

  $account = isset($register_result['data']['account']) && is_array($register_result['data']['account'])
    ? $register_result['data']['account']
    : null;
  if (!$account) {
    return ['ok' => false, 'status' => 0, 'error' => 'account_missing'];
  }

  $account_id = preg_replace('/[^a-z0-9]/', '', strtolower((string) ($account['id'] ?? '')));
  $passkey = preg_replace('/[^a-z0-9]/', '', strtolower((string) ($account['passkey'] ?? '')));
  $gift_key = preg_replace('/[^a-z0-9-]/', '', strtolower((string) ($account['giftKey'] ?? '')));
  if ($account_id === '' || $passkey === '') {
    return ['ok' => false, 'status' => 0, 'error' => 'account_credentials_missing'];
  }

  update_option('ragbaz_home_account_id', $account_id, false);
  update_option('ragbaz_home_passkey', $passkey, false);
  if ($gift_key !== '') {
    update_option('ragbaz_home_gift_key', $gift_key, false);
  }

  return [
    'ok' => true,
    'status' => isset($register_result['status']) ? intval($register_result['status']) : 200,
    'data' => isset($register_result['data']) && is_array($register_result['data']) ? $register_result['data'] : [],
    'account' => [
      'id' => $account_id,
      'giftKey' => $gift_key,
    ],
  ];
}

function ragbaz_send_home_heartbeat() {
  $creds = ragbaz_get_home_credentials();
  if ($creds['account_id'] === '' || $creds['passkey'] === '') {
    return ['ok' => false, 'error' => 'missing_credentials'];
  }
  return ragbaz_home_post_json('/api/v1/home/heartbeat', [
    'accountId' => $creds['account_id'],
    'passkey'   => $creds['passkey'],
    'payload'   => ragbaz_build_home_payload(),
  ]);
}

function ragbaz_send_home_event($type, $message, $severity = 'good', $details = []) {
  $creds = ragbaz_get_home_credentials();
  if ($creds['account_id'] === '' || $creds['passkey'] === '') {
    return ['ok' => false, 'error' => 'missing_credentials'];
  }
  return ragbaz_home_post_json('/api/v1/home/events', [
    'accountId' => $creds['account_id'],
    'passkey'   => $creds['passkey'],
    'event'     => [
      'type'       => sanitize_key($type),
      'severity'   => sanitize_key($severity),
      'message'    => ragbaz_sanitize_text($message, 220),
      'occurredAt' => gmdate('c'),
      'source'     => 'ragbaz-bridge',
      'details'    => is_array($details) ? $details : [],
    ],
  ]);
}

function ragbaz_claim_home_tenant_slug($slug = '') {
  $creds = ragbaz_get_home_credentials();
  if ($creds['account_id'] === '' || $creds['passkey'] === '') {
    return ['ok' => false, 'error' => 'missing_credentials'];
  }

  $slug_from_option = ragbaz_sanitize_tenant_slug((string) ($creds['tenant_slug'] ?? ''));
  $slug_clean = ragbaz_sanitize_tenant_slug((string) $slug);
  if ($slug_clean === '') $slug_clean = $slug_from_option;
  if ($slug_clean === '') {
    return ['ok' => false, 'error' => 'missing_tenant_slug'];
  }

  $site_url = get_site_url();
  $site_host = '';
  $parsed = wp_parse_url($site_url);
  if (is_array($parsed) && !empty($parsed['host'])) {
    $site_host = strtolower((string) $parsed['host']);
  }

  update_option('ragbaz_home_tenant_slug', $slug_clean, false);

  return ragbaz_home_post_json('/api/v1/home/slug-claim', [
    'accountId' => $creds['account_id'],
    'passkey' => $creds['passkey'],
    'giftKey' => $creds['gift_key'],
    'slug' => $slug_clean,
    'alias' => $slug_clean,
    'siteDomain' => $site_host,
    'siteHost' => $site_host,
    'siteUrl' => $site_url,
  ]);
}

function ragbaz_handle_connect_actions() {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
  if (empty($_POST['ragbaz_connect_action'])) return;
  if (!current_user_can('manage_options')) return;

  check_admin_referer('ragbaz_connect_action');
  $action = sanitize_key(wp_unslash($_POST['ragbaz_connect_action']));
  $redirect = add_query_arg(
    ['page' => 'ragbaz-bridge', 'tab' => 'connect'],
    admin_url('tools.php')
  );

  if ($action === 'save_settings') {
    $base = esc_url_raw(trim((string) wp_unslash($_POST['ragbaz_home_base_url'] ?? '')));
    $account = strtolower(trim((string) wp_unslash($_POST['ragbaz_home_account_id'] ?? '')));
    $passkey = trim((string) wp_unslash($_POST['ragbaz_home_passkey'] ?? ''));
    $gift = strtolower(trim((string) wp_unslash($_POST['ragbaz_home_gift_key'] ?? '')));
    $tenant_slug = ragbaz_sanitize_tenant_slug((string) wp_unslash($_POST['ragbaz_home_tenant_slug'] ?? ''));
    $relay_enabled = !empty($_POST['ragbaz_home_graphql_relay_enabled']) ? '1' : '0';
    $relay_secret_input = trim((string) wp_unslash($_POST['ragbaz_home_graphql_relay_secret'] ?? ''));
    $relay_secret_clean = preg_replace('/[^a-z0-9]/', '', strtolower($relay_secret_input));

    update_option('ragbaz_home_base_url', $base ?: 'https://ragbaz.xyz', false);
    update_option('ragbaz_home_account_id', preg_replace('/[^a-z0-9]/', '', $account), false);
    update_option('ragbaz_home_passkey', preg_replace('/[^a-z0-9]/', '', strtolower($passkey)), false);
    update_option('ragbaz_home_gift_key', preg_replace('/[^a-z0-9-]/', '', $gift), false);
    update_option('ragbaz_home_tenant_slug', $tenant_slug, false);
    update_option('ragbaz_home_graphql_relay_enabled', $relay_enabled, false);
    if ($relay_secret_clean !== '') {
      update_option('ragbaz_home_graphql_relay_secret', $relay_secret_clean, false);
    } elseif ($relay_enabled === '1') {
      ragbaz_get_home_graphql_relay_settings(true);
    }
    ragbaz_set_home_last_result('saved', 'Connection settings saved.');
    wp_redirect(add_query_arg(['ragbaz_connect_result' => 'saved'], $redirect));
    exit;
  }

  if ($action === 'send_heartbeat') {
    $result = ragbaz_send_home_heartbeat();
    if (!empty($result['ok'])) {
      ragbaz_set_home_last_result('ok', 'Heartbeat sent successfully.', ['status' => $result['status'] ?? 200]);
      wp_redirect(add_query_arg(['ragbaz_connect_result' => 'heartbeat_ok'], $redirect));
      exit;
    }
    ragbaz_set_home_last_result('error', 'Heartbeat failed.', ['error' => $result['error'] ?? 'unknown']);
    wp_redirect(add_query_arg(['ragbaz_connect_result' => 'heartbeat_failed'], $redirect));
    exit;
  }

  if ($action === 'auto_onboard') {
    $result = ragbaz_auto_onboard_home();
    if (!empty($result['ok'])) {
      ragbaz_get_home_graphql_relay_settings(true);
      $slug_claim_status = '';
      $slug_claim_error = '';
      $slug_claimed = '';
      $saved_creds = ragbaz_get_home_credentials();
      if (!empty($saved_creds['tenant_slug'])) {
        $slug_claim = ragbaz_claim_home_tenant_slug((string) $saved_creds['tenant_slug']);
        if (!empty($slug_claim['ok'])) {
          $slug_claim_status = 'ok';
          $slug_data = isset($slug_claim['data']) && is_array($slug_claim['data']) ? $slug_claim['data'] : [];
          $slug_claimed = ragbaz_sanitize_tenant_slug((string) ($slug_data['slug'] ?? $saved_creds['tenant_slug']));
        } else {
          $slug_claim_status = 'failed';
          $slug_claim_error = (string) ($slug_claim['error'] ?? 'unknown');
        }
      }
      ragbaz_set_home_last_result('ok', 'Auto onboarding completed and credentials were saved.', [
        'status' => $result['status'] ?? 200,
        'accountId' => $result['account']['id'] ?? '',
        'giftKey' => $result['account']['giftKey'] ?? '',
        'slugClaimStatus' => $slug_claim_status,
        'slugClaimed' => $slug_claimed,
        'slugClaimError' => $slug_claim_error,
      ]);
      wp_redirect(add_query_arg(['ragbaz_connect_result' => 'auto_onboard_ok'], $redirect));
      exit;
    }
    ragbaz_set_home_last_result('error', 'Auto onboarding failed.', [
      'status' => $result['status'] ?? 0,
      'error' => $result['error'] ?? 'unknown',
      'data' => isset($result['data']) && is_array($result['data']) ? $result['data'] : [],
    ]);
    wp_redirect(add_query_arg(['ragbaz_connect_result' => 'auto_onboard_failed'], $redirect));
    exit;
  }

  if ($action === 'rotate_graphql_relay_secret') {
    $next_secret = ragbaz_generate_home_graphql_relay_secret();
    update_option('ragbaz_home_graphql_relay_secret', $next_secret, false);
    update_option('ragbaz_home_graphql_relay_enabled', '1', false);
    ragbaz_set_home_last_result('saved', 'GraphQL relay secret rotated.', [
      'graphqlRelaySecretPreview' => substr($next_secret, 0, 8) . '…',
    ]);
    wp_redirect(add_query_arg(['ragbaz_connect_result' => 'relay_secret_rotated'], $redirect));
    exit;
  }

  if ($action === 'send_event') {
    $event_type = sanitize_key(wp_unslash($_POST['ragbaz_event_type'] ?? 'manual_ping'));
    $event_message = sanitize_text_field(wp_unslash($_POST['ragbaz_event_message'] ?? 'Manual event from Connect panel.'));
    $event_severity = sanitize_key(wp_unslash($_POST['ragbaz_event_severity'] ?? 'good'));
    $result = ragbaz_send_home_event($event_type, $event_message, $event_severity, [
      'wp_admin_user' => wp_get_current_user() ? wp_get_current_user()->user_login : '',
    ]);
    if (!empty($result['ok'])) {
      ragbaz_set_home_last_result('ok', 'Event sent successfully.', ['status' => $result['status'] ?? 200]);
      wp_redirect(add_query_arg(['ragbaz_connect_result' => 'event_ok'], $redirect));
      exit;
    }
    ragbaz_set_home_last_result('error', 'Event send failed.', ['error' => $result['error'] ?? 'unknown']);
    wp_redirect(add_query_arg(['ragbaz_connect_result' => 'event_failed'], $redirect));
    exit;
  }

  if ($action === 'claim_tenant_slug') {
    $slug_input = ragbaz_sanitize_tenant_slug((string) wp_unslash($_POST['ragbaz_home_tenant_slug'] ?? ''));
    if ($slug_input !== '') {
      update_option('ragbaz_home_tenant_slug', $slug_input, false);
    }
    $result = ragbaz_claim_home_tenant_slug($slug_input);
    if (!empty($result['ok'])) {
      $data = isset($result['data']) && is_array($result['data']) ? $result['data'] : [];
      $slug_claimed = ragbaz_sanitize_tenant_slug((string) ($data['slug'] ?? $slug_input));
      if ($slug_claimed !== '') {
        update_option('ragbaz_home_tenant_slug', $slug_claimed, false);
      }
      ragbaz_set_home_last_result('ok', 'Tenant slug claimed successfully.', [
        'status' => $result['status'] ?? 200,
        'slug' => $slug_claimed,
      ]);
      wp_redirect(add_query_arg(['ragbaz_connect_result' => 'slug_claim_ok'], $redirect));
      exit;
    }
    $status = isset($result['status']) ? intval($result['status']) : 0;
    $result_key = $status === 409 ? 'slug_claim_conflict' : 'slug_claim_failed';
    ragbaz_set_home_last_result('error', 'Tenant slug claim failed.', [
      'status' => $status,
      'error' => $result['error'] ?? 'unknown',
      'data' => isset($result['data']) && is_array($result['data']) ? $result['data'] : [],
    ]);
    wp_redirect(add_query_arg(['ragbaz_connect_result' => $result_key], $redirect));
    exit;
  }
}
add_action('admin_init', 'ragbaz_handle_connect_actions');

/**
 * Handle event occurrences toggle save from the Overview tab.
 */
function ragbaz_handle_event_settings() {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
  if (empty($_POST['ragbaz_event_settings_save'])) return;
  if (!current_user_can('manage_options')) return;
  check_admin_referer('ragbaz_event_settings');

  $expand = !empty($_POST['ragbaz_event_expand_occurrences']) ? '1' : '0';
  update_option('ragbaz_event_expand_occurrences', $expand, false);

  wp_redirect(add_query_arg([
    'page' => 'ragbaz-bridge',
    'tab'  => 'overview',
    'ragbaz_event_saved' => '1',
  ], admin_url('tools.php')));
  exit;
}
add_action('admin_init', 'ragbaz_handle_event_settings');

// ── Main render ──────────────────────────────────────────────────────────────

function ragbaz_render_info_page() {
  if (!current_user_can('manage_options')) {
    wp_die(esc_html__('Unauthorized', 'ragbaz'));
  }

  $status   = ragbaz_get_wp_runtime_status();
  $checks   = ragbaz_get_wp_runtime_checks();
  $auth     = ragbaz_get_auth_status();
  $inv      = ragbaz_get_plugin_inventory();
  $debug    = ragbaz_build_debug_payload();
  $tab      = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'overview';
  $base_url = admin_url('tools.php?page=ragbaz-bridge');

  $ok_html  = '<span style="color:#166534;font-weight:600">✓ OK</span>';
  $bad_html = '<span style="color:#b91c1c;font-weight:600">✗</span>';
  $warn_html= '<span style="color:#92400e;font-weight:600">⚠</span>';
  ?>
  <div class="wrap" style="max-width:980px">
    <div style="display:flex;align-items:center;gap:14px;margin:16px 0 4px">
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAACQCAMAAAABfxb6AAAAJFBMVEVMaXFmI4NmI4NmI4NmI4NmJINmI4NmI4NmI4NmI4NmI4NmI4O4C23mAAAAC3RSTlMA7bPRkQk/FnFXKEWVwL4AAAAJcEhZcwAADsQAAA7EAZUrDhsAAAj7SURBVHja7VzZgvIqDJad4Pu/72FV2gINLSrzH3I5o7Uh+5eEx2PRokWLFi1atGjRokWLFi1atGjRokWL/hESyhhpySjxr7OqpOaUkWciwri8yfS8Z6aAJ1bJm+Xnk2l1+ZnGPpKqKbnVlHiBapBKCaGUAf8nzz9ce6ik/ut0PpsF6iV50F4RX/nJr7Nrz2syrTbcCpJCRfEku8ax4i8/oKdi18mBadN488Bx51tD8gIMxFS6zJxw26+kwrvLHvHSKdl9eHbPGYHw7v3iJXoqdiWOXUtBqaFXvHyqeOReiyHVFHqii4ziZXImdoUmHQoXrBgVXQSf0jUbp80G//mg0wr3YK8Nc2VXQDolEMR2fkKaRN88V17lrNd0fUWjAlNSZy7mU+fOV9IYCUd1nstZBSfa7VAAYcPRO08mXm++/RYG515aTyle91rk9J2MKnLDzpON2cSL41cRXvTStJ20XS+bP8vvuXumx1qQtitEPWPsRfOrC/GHtXLpqM768fiL+vyQBd1VrTAc1Hk6bxU87bmRGVLQAuktVP0pdUbGXwdvQDmzZH/JO4eCh6OyTlpyYxWfZSb1zpYT+2ZMYIqEwqdCdQg1ZKMzL/8OcayDLn1KljPpWCtMibNLVNiouXFeTCynjUZRJ+l1N85KeVZMruSM/HoRGQy/RXGZkiQnNt+g0BxT8nJsMRzNl0/aGaQIAdf5DUFpY8Izm28UMEWAMxV+1QGjDaU+znyVlOIXAoZz6Jw30Q7Ymy8qGilOrnUe75A5RWd8vsRb55WZRI/5BlVgj68XSe3f9Nhq1R7F9qWD+eKSSf18/oJh1jbhwIFueoC3/GMtaJA9CD868eUBANH8TeHF2xIYz2vhDvN1dQgX8vvO3LS0CiGwrK0UzVcj0X53jIBqWAwPSpUfTTMn6vTrNDNfieVXBv2gPwA6Sr/qm//n/uctVMM6ksnIr3Mg8vELCe/EaEeyCK7Nx5KCBPNFJpM88il/MLOk0iwND/NXRtr5s9eADWA8gHMBuqfpq1OiQjFV+CfCUuJvM2Fnz0DhQikXtAeZhOTY5E/ybXhWCNMRj9MdrAfasPkVTbgSFb9pB19kN9lDj/k6oDfiYrwG7X5hfGVHhJuOvnAXMmnFGu0Wvu+h83msnFt0xfY6Kjy0QRObVtKfhW/tUHd9ntu4MWhLlIPpw8KC/ouOUkUnSP+DDkvIEGpIc2ryqr/rGICBFHjFvgfpJ5IdqdEqS81Q8K+RTPo1AU8QyZUi3JONwDSR1SxCXiHx/jDx3g2P63yQRhMtTdl20+3yuPDDfKR3p03xdxIhtxVQlA5aDxpvavXBeZsxS9ZHUmrVW2sNYHdkrP2qUXa2Jzli3CeQqM5a85eVRrO11mT5skU2Vx9bAJIVQxEDkLC+DQ0XwyBYgv5OaTBQqTM/qDsyDhpcCny+2h3sC735xh0m0zFBolzl8Nn+Wt1zmHvTETacd4HKEa0D8uH+Wj0W6nvmq2OaxfGxgjqU79PtcVJl+Gos9tCkU0ves+jgJwysu/p0P1HUIyG9kcZ4tURPwafesjVf+BZgNYxhb75eTKbD97mIxPTt9riQ+nSv8zlWpV22EcWkO55CPSpyU51DE6Twg3brk7/WIsc6LZ6V+hRvwjCiZIk7jrS2shl3cGiVYXmtWEheVjB0cPMwwV11dmGckuMJZ3GXqRYk2V91+mxDb70D6in0/rSHzezcliIcBLzJMxzHgowyYeeusiQJv4wGeA9p2wCiwq/XLLqH7eHoiHVFwOZCtpEnDRx7bE6hMb9m4r55Cc2nATTTe4U+lL6yUg53u6ww1CIOeCXgHB3HraBHWRQ2KnxxJw+rB1CKtbKk1J2Av6IHL8uQnk82QKB3wIkIY3n1WgU8V5FDTcuLngmOHDPV7a52XlYgSyWvYICAGAMYLkt2wn0+J9jx3I4xSD1KMu5M4N2J7b2sQTrp04mZh6F5244dJWzP1rIqaKGsZJUacNtL6V1k1aWkIdTZBBWCZVObNxJwirMXpDtbU+S3JmGfjpCLt4xUNi+RW/D8JCT52J4dpy4YgPspzot2cbThTeJt4UEwVzYvVXV1A4O3mBMgMMNlizM9UA8rcjj+XN38wDHcHgELQz+ZdzDFX5OHAKic7FTJiOXHNpk4hmFoClixfUnBi1mH2o+q6vcf5FAB+xUW9bjMsGgK2ENi2+M0xUs9xA7wh1yceiD27MyXt8FBeo59mRaSgEk5rSKQnON3dcCyJfsB2yRukViebQNfnmlE82uY7VbkHMtd0DV8yL0CzqG0Slh9Hod1w4sU9PkBpRISPIydcwwHF2UvNesPP4XkuVnCwvMMwvOmx1oNTb03EijcyBROPTbunErAEGj9qHAniIw8DQNQjZ4BnNpqu3OQh1zZWlWqct6t2deYxcBruPQ5IqPO4kDwraYOTm0MWBVyaEXzUxevwXs+sueLUucM4WdtyI1VaoX9Wcmjf3Nq8Ha7Nk98LcoIOrKr718VAzDSlk5XL45zSx2M7r4ZCoitQkP2FhYdIGn6jYZ/2kEB+J46516LVgo+Vlo4Ff7KG7FrWZjjkpOrkFPB6MMO46AC+JlGfr6qzvmIli6xS8Ac5e9xDVsphH89tx4sz5IcuynHdLpC4qgVHb8Q0nNrSfIdcFRmKxzYM6wcYz450Nn31CtR0vlceirZva4AttYcnmxUpvDeM8bKY1NUHqqpcBtkvP8uXahF/dSHZS7T/pA2pSfqLdTCBy+EOMfag5e/8nbrQOz4jQwwaxRIMnGZ/UMUqnaL7cRVPqOiJ0718WH9jz5HTt8K3b3sW5guYOmSNUV207my9DU/tGu2eJvMDzTPLQx5DpwOqSEbXRzndzbmkPH2ElC5G7hXRXbDOVBk8XbFeq9cUifz9YHdBYkmBE8XUA6wLHEWLPdQ3HZIe3ufkXfmeqT1Xuzu2SldP1NXvMlV4SZjFXVP2A9px/0g90dhNBu5bc5vdvfE7am60hN0usCaMTL2ilOYc1V/MxNLR97oKhmf9EZrVvMC/ywJIcRj0aJFixYtWrRo0aJFixYtWrRo0aJF/xf6D/7JnBw3d3+0AAAAAElFTkSuQmCC"
           alt="RAGBAZ legacy" style="display:none">
      <svg viewBox="0 0 240 54" role="img" aria-label="RAGBAZ" style="height:40px;width:auto;display:block">
        <rect x="1" y="1" width="238" height="52" rx="10" ry="10" fill="#f7ead6" stroke="#8f6b42" stroke-width="2"></rect>
        <text x="120" y="34" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800" fill="#7a4b1b" letter-spacing="1.5">RAGBAZ</text>
      </svg>
      <div>
        <span style="font-size:20px;font-weight:700;color:#7a4b1b;letter-spacing:-.01em">Bridge</span>
        <span style="margin-left:8px;color:#8f6b42;font-size:13px">v<?php echo esc_html(RAGBAZ_VERSION); ?></span>
        <div style="font-size:12px;color:#9a7a52;margin-top:1px">GraphQL Events, Courses, WooCommerce &amp; Downloads StoreFront</div>
      </div>
    </div>

    <nav class="nav-tab-wrapper" style="margin-bottom:20px">
      <?php
      $tabs = [
        'connect'        => 'Connect to RAGBAZ',
        'overview'       => 'Overview',
        'authentication' => 'Authentication',
        'plugins'        => 'Plugins',
        'performance'    => 'Performance',
      ];
      foreach ($tabs as $slug => $label) {
        $active = $tab === $slug ? ' nav-tab-active' : '';
        printf(
          '<a href="%s" class="nav-tab%s">%s</a>',
          esc_url($base_url . '&tab=' . $slug),
          $active,
          esc_html($label)
        );
      }
      ?>
    </nav>

    <?php if ($tab === 'overview') : ?>
    <!-- ── Overview ─────────────────────────────────────────────────── -->
    <h2>What RAGBAZ Bridge does</h2>
    <p style="color:#475569;max-width:720px">
      RAGBAZ Bridge is a single-file WordPress plugin that wires up WPGraphQL extensions
      for headless storefronts. It exposes content types, adds normalised fields, modifies
      WordPress query behaviour for GraphQL visibility, and provides built-in headless
      authentication via a shared site secret.
    </p>

    <h3>GraphQL types registered</h3>
    <table class="widefat striped">
      <thead><tr><th>Type / Field</th><th>Source</th><th>Fields added</th></tr></thead>
      <tbody>
        <tr><td><code>LpCourse</code></td><td>LearnPress</td><td>price, priceFormatted, currency, duration, durationUnit, instructor, curriculum (sections → lessons), hasEnrolled, enrolStatus</td></tr>
        <tr><td><code>Event.startDate / endDate</code></td><td>Event calendar plugins (see below)</td><td>startDate, endDate, allDay, timezone, venueName, venueAddress, ticketUrl, cost</td></tr>
        <tr><td><code>MediaItem.ragbazAsset</code></td><td>Core</td><td>assetId, assetSlug, publicUrl, mimeType, fileSize, variants (array)</td></tr>
        <tr><td><code>RootQuery.ragbazInfo</code></td><td>Core</td><td>version, hasLearnPress, hasEventsPlugin, eventsPlugin, wpRuntime</td></tr>
        <tr><td><code>RootQuery.ragbazPluginVersion</code></td><td>Core</td><td>Version string</td></tr>
        <tr><td><code>RootQuery.ragbazWpRuntime</code></td><td>Core</td><td>Full runtime status object</td></tr>
      </tbody>
    </table>

    <h3 style="margin-top:20px">Supported event calendar plugins</h3>
    <p style="color:#475569;max-width:720px">
      RAGBAZ Bridge resolves <code>startDate</code> and <code>endDate</code> for events using
      plugin-specific storage. The table below lists supported plugins and how dates are resolved.
    </p>
    <table class="widefat striped">
      <thead><tr><th>Plugin</th><th>Post type</th><th>Date storage</th><th>Support level</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Event Organiser</strong></td>
          <td><code>event</code></td>
          <td>Custom <code>eo_events</code> table (<code>StartDate</code>, <code>StartTime</code>, <code>EndDate</code>, <code>FinishTime</code>). Queries the next upcoming occurrence (<code>StartDate &ge; CURDATE()</code>), falls back to the most recent past occurrence.</td>
          <td><span style="color:#166534;font-weight:600">Full support</span></td>
        </tr>
        <tr>
          <td><strong>The Events Calendar</strong> (TEC)</td>
          <td><code>tribe_events</code></td>
          <td>Post meta: <code>_EventStartDate</code>, <code>_EventEndDate</code></td>
          <td><span style="color:#166534;font-weight:600">Supported</span></td>
        </tr>
        <tr>
          <td><strong>Events Manager</strong></td>
          <td><code>event</code></td>
          <td>Custom <code>em_events</code> table (<code>event_start_date</code>, <code>event_start_time</code>, <code>event_end_date</code>, <code>event_end_time</code>). Queries next upcoming occurrence, skips recurrence templates. Venue resolved via <code>em_locations</code> join.</td>
          <td><span style="color:#166534;font-weight:600">Full support</span></td>
        </tr>
        <tr>
          <td><strong>Timely</strong> (All-in-One Event Calendar)</td>
          <td><code>ai1ec_event</code></td>
          <td>Custom <code>ai1ec_events</code> table (unix timestamps) + <code>ai1ec_event_instances</code> for pre-expanded recurring occurrences. Venue, cost, ticket URL, timezone, allDay all stored as columns in <code>ai1ec_events</code>.</td>
          <td><span style="color:#166534;font-weight:600">Full support</span></td>
        </tr>
        <tr>
          <td><strong>WP Event Manager</strong></td>
          <td><code>event_listing</code></td>
          <td>Post meta: <code>_event_start_date</code>, <code>_event_end_date</code>, <code>_event_start_time</code>, <code>_event_end_time</code>. Venue via <code>_event_venue_name</code>, location via <code>_event_location</code>.</td>
          <td><span style="color:#166534;font-weight:600">Supported</span></td>
        </tr>
        <tr>
          <td>Other / unknown</td>
          <td>—</td>
          <td>—</td>
          <td><span style="color:#b91c1c">Not supported</span> — startDate/endDate will be empty</td>
        </tr>
      </tbody>
    </table>

    <?php if (!empty($_GET['ragbaz_event_saved'])) : ?>
    <div class="notice notice-success inline" style="margin:12px 0"><p>Event settings saved.</p></div>
    <?php endif; ?>

    <h3 style="margin-top:20px">Event occurrence settings</h3>
    <form method="post">
      <?php wp_nonce_field('ragbaz_event_settings'); ?>
      <input type="hidden" name="ragbaz_event_settings_save" value="1">
      <table class="form-table" role="presentation">
        <tr>
          <th scope="row">Expand occurrences</th>
          <td>
            <label>
              <input type="checkbox" name="ragbaz_event_expand_occurrences" value="1"
                <?php checked(ragbaz_event_occurrences_enabled()); ?>>
              Expose an <code>occurrences</code> field on the <code>Event</code> GraphQL type
            </label>
            <p class="description">
              When enabled, each Event node includes an <code>occurrences</code> list with all
              start/end dates from the calendar plugin's occurrence table (Event Organiser, Events Manager, Timely).
              For meta-based plugins (TEC, WP Event Manager), a single occurrence is returned.<br>
              The storefront can detect this via <code>ragbazCapabilities { eventOccurrences }</code>.
              <strong>Default: off</strong> — <code>startDate</code>/<code>endDate</code> return the next upcoming occurrence only.
            </p>
          </td>
        </tr>
      </table>
      <?php submit_button('Save event settings', 'secondary'); ?>
    </form>

    <h3 style="margin-top:20px">WordPress behaviour changes</h3>
    <table class="widefat striped">
      <thead><tr><th>Hook / Filter</th><th>What it does</th></tr></thead>
      <tbody>
        <tr>
          <td><code>register_post_type_args</code></td>
          <td>Sets <code>show_in_graphql: true</code> on event post types (<code>tribe_events</code>, <code>event</code>, <code>event_listing</code>, <code>eo_event</code>, <code>ai1ec_event</code>) so they appear in the WPGraphQL schema even if the originating plugin didn't set that flag.</td>
        </tr>
        <tr>
          <td><code>register_taxonomy_args</code></td>
          <td>Sets <code>show_in_graphql: true</code> on event-related taxonomies (<code>tribe_events_cat</code>, <code>event_tag</code>, <code>event_category</code>, <code>events_categories</code>, <code>events_tags</code>, <code>event_listing_category</code>, <code>event_listing_type</code>) for the same reason.</td>
        </tr>
        <tr>
          <td><code>determine_current_user</code> (priority 20)</td>
          <td>Authenticates headless API requests carrying the correct site-secret header as a WordPress administrator. Only fires for requests to the <code>/graphql</code> endpoint. No effect on WP admin, REST, or front-end requests.</td>
        </tr>
        <tr>
          <td><code>rest_api_init</code></td>
          <td>Registers a <code>ragbaz_asset</code> REST field on <code>attachment</code> posts, mirroring the GraphQL <code>ragbazAsset</code> data for REST consumers.</td>
        </tr>
      </tbody>
    </table>

    <h3 style="margin-top:20px">GraphQL query examples</h3>
    <pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:14px;border-radius:4px;overflow:auto"><code>query BridgeProbe {
  ragbazPluginVersion
  ragbazInfo { version hasLearnPress hasEventsPlugin eventsPlugin }
  ragbazWpRuntime { okForProduction opcacheEnabled objectCacheEnabled checkedAt }
}</code></pre>

    <?php elseif ($tab === 'authentication') : ?>
    <!-- ── Authentication ────────────────────────────────────────────── -->
    <h2>Built-in headless authentication</h2>

    <?php
    if ($auth['secret_configured']) {
      echo '<div style="background:#f0fdf4;border:1px solid #86efac;padding:12px 16px;border-radius:6px;margin-bottom:16px">';
      echo '<strong style="color:#166534">✓ Auth is configured.</strong> ';
      printf(
        'Secret source: <code>%s</code> &nbsp;|&nbsp; Secret preview: <code>%s</code> &nbsp;|&nbsp; Authenticates as: <code>%s</code> (%s)',
        esc_html($auth['secret_source']),
        esc_html($auth['secret_preview']),
        esc_html($auth['headless_user_login']),
        esc_html($auth['headless_user_roles'])
      );
      echo '</div>';
    } else {
      echo '<div style="background:#fef2f2;border:1px solid #fca5a5;padding:12px 16px;border-radius:6px;margin-bottom:16px">';
      echo '<strong style="color:#b91c1c">✗ No site secret configured.</strong> Headless requests will be unauthenticated. See "How to fix" below.';
      echo '</div>';
    }
    ?>

    <h3>How it works</h3>
    <p style="max-width:720px">
      RAGBAZ Bridge hooks into WordPress's <code>determine_current_user</code> filter at priority&nbsp;20.
      When an incoming request to <code>/graphql</code> carries a secret header that matches the configured
      site secret, WordPress authenticates the request as the headless service-account user (the first
      administrator by default). This happens before WPGraphQL evaluates any field-level access checks,
      so all normally-restricted content becomes accessible to the headless storefront.
    </p>
    <p style="max-width:720px">
      The secret is never exposed in GraphQL responses. Constant-time comparison (<code>hash_equals</code>)
      prevents timing attacks.
    </p>

    <h3>Headers accepted</h3>
    <table class="widefat striped" style="max-width:640px">
      <thead><tr><th>Header</th><th>Use</th></tr></thead>
      <tbody>
        <tr><td><code>X-Headless-Secret: &lt;secret&gt;</code></td><td>FaustWP / standard headless</td></tr>
        <tr><td><code>X-Faust-Secret: &lt;secret&gt;</code></td><td>Alternative name</td></tr>
        <tr><td><code>X-FaustWP-Secret: &lt;secret&gt;</code></td><td>Alternative name</td></tr>
        <tr><td><code>X-RAGBAZ-Secret: &lt;secret&gt;</code></td><td>RAGBAZ-specific override</td></tr>
      </tbody>
    </table>

    <h3 style="margin-top:20px">How to fix authentication issues</h3>
    <ol style="max-width:720px;line-height:1.9">
      <li>
        <strong>Install and activate FaustWP.</strong>
        It stores the headless secret in <code>faustwp_settings['secret_key']</code>, which RAGBAZ Bridge reads automatically.
        Go to <em>Settings → Faust</em> and note the secret key.
      </li>
      <li>
        <strong>Copy the secret to your storefront environment.</strong>
        Set <code>FAUST_SECRET_KEY=&lt;value&gt;</code> (and optionally push it as a Cloudflare Worker secret with <code>wrangler secret put FAUST_SECRET_KEY</code>).
      </li>
      <li>
        <strong>Verify with curl:</strong><br>
        <pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:4px;margin-top:6px"><code>curl -s -X POST <?php echo esc_url(get_site_url()); ?>/graphql \
  -H "Content-Type: application/json" \
  -H "X-Headless-Secret: YOUR_SECRET" \
  -d '{"query":"{ viewer { name roles { nodes { name } } } }"}' | python3 -m json.tool</code></pre>
        You should see your administrator name and role.
      </li>
      <li>
        <strong>If WPGraphQL has "Restrict Content" enabled</strong> and you still get
        <em>"cannot be accessed without authentication"</em>, confirm the secret matches exactly
        (no trailing spaces). Check <em>GraphQL → Settings → Auth</em> for the restriction setting.
      </li>
      <li>
        <strong>Service account user.</strong> By default RAGBAZ Bridge authenticates as the first
        administrator (lowest ID). To use a dedicated service account user, set the WordPress option
        <code>ragbaz_headless_user_id</code> to that user's ID, or use the
        <code>ragbaz_headless_user_id</code> filter in a mu-plugin.
      </li>
    </ol>

    <h3 style="margin-top:20px">wp-graphql-headless-login JWT flow (optional)</h3>
    <p style="max-width:720px">
      If you also have WPGraphQL Headless Login installed and configured, the storefront can exchange
      the site secret for a short-lived JWT via the <code>login(input: { provider: SITETOKEN, … })</code>
      mutation. The JWT is then used as a Bearer token for subsequent requests. RAGBAZ Bridge's
      built-in auth is tried first; the JWT flow is a fallback.
      <br><strong>Important:</strong> the <code>login</code> mutation must be publicly accessible
      (WP Admin → GraphQL → Settings → Auth) or RAGBAZ Bridge's own auth must be active for
      the mutation to succeed.
    </p>

    <?php elseif ($tab === 'plugins') : ?>
    <!-- ── Plugins ──────────────────────────────────────────────────── -->
    <h2>Plugin inventory</h2>
    <?php
    $groups = [
      'required'       => ['label' => 'Required',               'color' => '#b91c1c'],
      'authentication' => ['label' => 'Authentication',         'color' => '#1e40af'],
      'content'        => ['label' => 'Content (optional)',      'color' => '#166534'],
      'ecommerce'      => ['label' => 'eCommerce (optional)',    'color' => '#7c3aed'],
      'performance'    => ['label' => 'Performance (optional)',  'color' => '#92400e'],
    ];
    foreach ($groups as $group_key => $group_meta) :
      if (empty($inv[$group_key])) continue;
      ?>
      <h3 style="color:<?php echo esc_attr($group_meta['color']); ?>;margin-top:22px">
        <?php echo esc_html($group_meta['label']); ?>
      </h3>
      <table class="widefat striped">
        <thead><tr><th>Plugin</th><th style="width:70px">Status</th><th>Purpose</th></tr></thead>
        <tbody>
          <?php foreach ($inv[$group_key] as $p) :
            $active = ragbaz_plugin_active($p['slug']);
          ?>
          <tr>
            <td>
              <strong><?php echo esc_html($p['name']); ?></strong><br>
              <a href="<?php echo esc_url($p['url']); ?>" target="_blank" rel="noopener noreferrer" style="font-size:12px"><?php echo esc_html($p['url']); ?></a>
            </td>
            <td>
              <?php if ($active) : ?>
                <span style="color:#166534;font-weight:600">Active</span>
              <?php else : ?>
                <span style="color:#94a3b8">Inactive</span>
              <?php endif; ?>
            </td>
            <td style="color:#475569"><?php echo esc_html($p['purpose']); ?></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    <?php endforeach; ?>

    <?php elseif ($tab === 'performance') : ?>
    <!-- ── Performance ──────────────────────────────────────────────── -->
    <h2>WordPress runtime &amp; performance</h2>
    <p style="color:#475569">
      These checks identify common settings that hurt performance or expose debug information in production.
    </p>
    <table class="widefat striped" style="max-width:820px">
      <thead>
        <tr><th>Setting</th><th>Current</th><th>Recommended</th><th>Status</th></tr>
      </thead>
      <tbody>
      <?php foreach ($checks as $check) :
        $ok       = !empty($check['ok']);
        $required = !empty($check['required']);
        $status_text = $ok ? 'OK' : ($required ? 'ACTION NEEDED' : 'RECOMMENDED');
        $status_color = $ok ? '#166534' : ($required ? '#b91c1c' : '#92400e');
      ?>
        <tr>
          <td><code><?php echo esc_html($check['label']); ?></code></td>
          <td><strong><?php echo esc_html(ragbaz_bool_label(!empty($check['value']))); ?></strong></td>
          <td><?php echo esc_html(ragbaz_bool_label(!empty($check['recommended']))); ?></td>
          <td style="font-weight:600;color:<?php echo esc_attr($status_color); ?>"><?php echo esc_html($status_text); ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>

    <p style="margin-top:14px">
      <strong>Production-ready:</strong>
      <span style="color:<?php echo esc_attr($status['okForProduction'] ? '#166534' : '#b91c1c'); ?>;font-weight:600">
        <?php echo esc_html($status['okForProduction'] ? 'Yes' : 'No — see actions above'); ?>
      </span>
      <span style="margin-left:14px;color:#475569;font-size:13px">Checked: <?php echo esc_html($status['checkedAt']); ?></span>
    </p>

    <?php elseif ($tab === 'connect') : ?>
    <!-- ── Connect ──────────────────────────────────────────────────── -->
    <?php
    $home_base = ragbaz_get_home_base_url();
    $home_creds = ragbaz_get_home_credentials();
    $relay = ragbaz_get_home_graphql_relay_settings(true);
    $tenant_slug = ragbaz_sanitize_tenant_slug((string) ($home_creds['tenant_slug'] ?? ''));
    $last_result = ragbaz_get_home_last_result();
    $site_url_raw = get_site_url();
    $site_host = '';
    $parsed_site = wp_parse_url($site_url_raw);
    if (is_array($parsed_site) && !empty($parsed_site['host'])) {
      $site_host = strtolower((string) $parsed_site['host']);
    }
    $tenant_preview = $home_creds['gift_key'] !== '' ? 'https://' . $home_creds['gift_key'] . '.ragbaz.xyz/' : '';
    $tenant_slug_preview = $tenant_slug !== '' ? 'https://' . $tenant_slug . '.ragbaz.xyz/' : '';
    $tenant_info = $site_host !== '' ? $home_base . '/tenant/' . rawurlencode($site_host) : '';
    $gift_info = $home_creds['gift_key'] !== '' ? $home_base . '/articulate/sites/' . rawurlencode($home_creds['gift_key']) : '';
    $slug_info = $tenant_slug !== '' ? $home_base . '/articulate/sites/' . rawurlencode($tenant_slug) : '';
    ?>
    <?php
    $has_account = $home_creds['account_id'] !== '';
    $has_passkey = $home_creds['passkey'] !== '';
    $has_gift = $home_creds['gift_key'] !== '';
    $relay_enabled = !empty($relay['enabled']);
    $can_phone_home = $has_account && $has_passkey;
    $connect_result = !empty($_GET['ragbaz_connect_result']) ? sanitize_key(wp_unslash($_GET['ragbaz_connect_result'])) : '';
    $connect_notice_map = [
      'saved' => ['tone' => '#14532d', 'bg' => '#ecfdf5', 'border' => '#86efac', 'message' => 'Connection settings saved.'],
      'auto_onboard_ok' => ['tone' => '#14532d', 'bg' => '#ecfdf5', 'border' => '#86efac', 'message' => 'Auto onboarding completed and credentials were saved.'],
      'heartbeat_ok' => ['tone' => '#14532d', 'bg' => '#ecfdf5', 'border' => '#86efac', 'message' => 'Phone-home heartbeat sent successfully.'],
      'event_ok' => ['tone' => '#14532d', 'bg' => '#ecfdf5', 'border' => '#86efac', 'message' => 'Call-home event sent successfully.'],
      'slug_claim_ok' => ['tone' => '#14532d', 'bg' => '#ecfdf5', 'border' => '#86efac', 'message' => 'Tenant slug claimed and reserved successfully.'],
      'relay_secret_rotated' => ['tone' => '#14532d', 'bg' => '#ecfdf5', 'border' => '#86efac', 'message' => 'GraphQL relay secret rotated and relay kept enabled.'],
      'auto_onboard_failed' => ['tone' => '#991b1b', 'bg' => '#fef2f2', 'border' => '#fecaca', 'message' => 'Auto onboarding failed. Check Home base URL and network connectivity.'],
      'heartbeat_failed' => ['tone' => '#991b1b', 'bg' => '#fef2f2', 'border' => '#fecaca', 'message' => 'Heartbeat failed. Check credentials and endpoint URL.'],
      'event_failed' => ['tone' => '#991b1b', 'bg' => '#fef2f2', 'border' => '#fecaca', 'message' => 'Event send failed. Check credentials and endpoint URL.'],
      'slug_claim_conflict' => ['tone' => '#991b1b', 'bg' => '#fef2f2', 'border' => '#fecaca', 'message' => 'Tenant slug is already claimed by another site.'],
      'slug_claim_failed' => ['tone' => '#991b1b', 'bg' => '#fef2f2', 'border' => '#fecaca', 'message' => 'Tenant slug claim failed. Check credentials, slug format, and endpoint URL.'],
    ];
    $notice = isset($connect_notice_map[$connect_result]) ? $connect_notice_map[$connect_result] : null;
    ?>

    <h2>Connect &amp; Phone Home</h2>
    <div style="max-width:820px;background:#fff7ed;border:1px solid #e2c9a7;padding:14px 16px;border-radius:10px;margin-bottom:14px">
      <p style="margin:0 0 8px;color:#5b3a1f;font-size:13px">
        Connect this WordPress site to <strong>RAGBAZ.xyz</strong> and push diagnostics snapshots.
      </p>
      <ol style="margin:0;padding-left:18px;color:#7a4b1b;font-size:13px;line-height:1.5">
        <li>Click <strong>Auto onboard</strong> to request and save account credentials from RAGBAZ.xyz.</li>
        <li>Optionally set a <strong>tenant slug alias</strong> (letters, digits, hyphen; no dots) and claim it.</li>
        <li>Keep <strong>GraphQL relay for RAGBAZ.xyz</strong> enabled unless you explicitly want to disable it.</li>
        <li>Click <strong>Phone home now</strong> to send a heartbeat snapshot and update status pages.</li>
        <li>Use <strong>Advanced settings</strong> only if you need manual endpoint/credential overrides.</li>
      </ol>
    </div>

    <?php if ($notice) : ?>
      <div style="background:<?php echo esc_attr($notice['bg']); ?>;border:1px solid <?php echo esc_attr($notice['border']); ?>;padding:10px 12px;border-radius:8px;max-width:820px;margin-bottom:14px;color:<?php echo esc_attr($notice['tone']); ?>">
        <strong>Connect status:</strong> <?php echo esc_html($notice['message']); ?>
      </div>
    <?php endif; ?>

    <div style="display:grid;grid-template-columns:1fr;gap:14px;max-width:820px;margin-bottom:20px">
      <form method="post" style="background:#fff;border:1px solid #d8c2a4;padding:16px;border-radius:10px;box-shadow:0 1px 0 rgba(122,75,27,0.04)">
        <?php wp_nonce_field('ragbaz_connect_action'); ?>
        <input type="hidden" name="ragbaz_connect_action" value="save_settings" />
        <h3 style="margin:0 0 12px;color:#5b3a1f">Quick start (recommended)</h3>
        <p style="margin:0 0 12px;color:#7a4b1b;font-size:13px">
          Auto onboarding is the default path. It saves keys, keeps relay auth separate from storefront auth, and requires minimal manual input.
        </p>
        <p style="margin:0 0 12px">
          <button class="button button-secondary" name="ragbaz_connect_action" value="auto_onboard">Auto onboard (request keys from RAGBAZ.xyz)</button>
        </p>
        <div style="background:#f8fafc;border:1px solid #dbeafe;border-radius:8px;padding:10px 12px;margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:#1e3a8a">
            <input type="checkbox" name="ragbaz_home_graphql_relay_enabled" value="1" <?php checked($relay_enabled); ?> />
            Allow RAGBAZ.xyz GraphQL relay (recommended)
          </label>
          <p style="margin:8px 0 0;color:#334155;font-size:12px">
            Mode: <code><?php echo esc_html($relay['mode']); ?></code> · Header: <code><?php echo esc_html($relay['header_name']); ?></code> ·
            Secret: <code><?php echo esc_html($relay['secret_preview'] ?: 'not generated'); ?></code>
          </p>
          <p style="margin:8px 0 0;font-size:12px;color:#475569">
            This relay secret is separate from storefront auth keys and can be disabled any time.
          </p>
        </div>
        <div style="background:#f8fafc;border:1px solid #dbeafe;border-radius:8px;padding:10px 12px;margin-bottom:12px">
          <h4 style="margin:0 0 8px;color:#1e3a8a;font-size:13px">Claim tenant slug alias (step 2)</h4>
          <p style="margin:0 0 8px;color:#334155;font-size:12px">
            Set a simple alias so this site can be reached as <code>https://&lt;slug&gt;.ragbaz.xyz/</code> and via tenant lookup pages.
          </p>
          <input id="ragbaz_home_tenant_slug" name="ragbaz_home_tenant_slug" type="text" class="regular-text code" value="<?php echo esc_attr($tenant_slug); ?>" placeholder="xtas" />
          <p style="margin:6px 0 0;color:#64748b;font-size:12px">
            Use lowercase <code>a-z</code>, digits, and hyphen only (no dots). Example: <code>xtas</code>.
          </p>
          <p style="margin:10px 0 0">
            <button class="button" name="ragbaz_connect_action" value="claim_tenant_slug" <?php disabled(!$can_phone_home); ?>>Claim / reserve slug</button>
          </p>
        </div>
        <details style="margin:0 0 10px">
          <summary style="cursor:pointer;font-weight:600;color:#7a4b1b">Advanced settings (manual overrides)</summary>
          <table class="form-table" role="presentation" style="margin:8px 0 0">
            <tbody>
              <tr>
                <th scope="row"><label for="ragbaz_home_base_url">Home base URL</label></th>
                <td><input id="ragbaz_home_base_url" name="ragbaz_home_base_url" type="url" class="regular-text code" value="<?php echo esc_attr($home_base); ?>" /></td>
              </tr>
              <tr>
                <th scope="row"><label for="ragbaz_home_account_id">Account ID</label></th>
                <td><input id="ragbaz_home_account_id" name="ragbaz_home_account_id" type="text" class="regular-text code" value="<?php echo esc_attr($home_creds['account_id']); ?>" /></td>
              </tr>
              <tr>
                <th scope="row"><label for="ragbaz_home_passkey">Passkey</label></th>
                <td><input id="ragbaz_home_passkey" name="ragbaz_home_passkey" type="text" class="regular-text code" value="<?php echo esc_attr($home_creds['passkey']); ?>" /></td>
              </tr>
              <tr>
                <th scope="row"><label for="ragbaz_home_gift_key">Gift key / codename</label></th>
                <td><input id="ragbaz_home_gift_key" name="ragbaz_home_gift_key" type="text" class="regular-text code" value="<?php echo esc_attr($home_creds['gift_key']); ?>" /></td>
              </tr>
              <tr>
                <th scope="row"><label for="ragbaz_home_graphql_relay_secret">GraphQL relay secret</label></th>
                <td>
                  <input id="ragbaz_home_graphql_relay_secret" name="ragbaz_home_graphql_relay_secret" type="text" class="regular-text code" placeholder="leave empty to keep current" />
                  <p style="margin:6px 0 0;color:#64748b;font-size:12px">Optional manual override. Leave empty to preserve current secret.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </details>
        <p style="display:flex;flex-wrap:wrap;gap:8px;margin:0">
          <button class="button button-primary">Save settings</button>
          <button class="button" name="ragbaz_connect_action" value="rotate_graphql_relay_secret">Rotate relay secret</button>
        </p>
      </form>

      <div style="max-width:820px;background:#eef6ff;border:1px solid #bfd7f5;padding:14px 16px;border-radius:10px">
        <h3 style="margin:0 0 8px;color:#1d3d66;font-size:14px">Shared hosting URL guidance (domain vs subdomain)</h3>
        <p style="margin:0 0 8px;color:#2a4b73;font-size:13px">
          If your current site runs at <code>xtas.nu</code> and you want the WordPress admin/content host to be
          <code>wp.xtas.nu</code>, keep one canonical WordPress codebase and point the new host there.
        </p>
        <ol style="margin:0;padding-left:18px;color:#2a4b73;font-size:13px;line-height:1.5">
          <li>Create the DNS record for <code>wp.xtas.nu</code> (A/AAAA/CNAME according to your host).</li>
          <li>In hosting control panel, create a web root for <code>wp.xtas.nu</code>.</li>
          <li>Choose one path strategy:
            <ul style="margin:6px 0 0 18px;list-style:disc">
              <li><strong>Move strategy:</strong> move WordPress into that directory and update URLs.</li>
              <li><strong>Symlink strategy:</strong> keep existing files and symlink the new docroot to the same code directory.</li>
            </ul>
          </li>
          <li>Update <code>home</code> and <code>siteurl</code> to <code>https://wp.xtas.nu</code> (WP admin or wp-config/wp-cli).</li>
          <li>Resave permalinks, verify <code>/graphql</code> and then update StoreFront advanced WordPress URL to the new host.</li>
        </ol>
        <p style="margin:8px 0 0;color:#1d3d66;font-size:12px">
          Tip: If public pages should remain on apex domain, keep storefront front-end on <code>xtas.nu</code> and reserve
          <code>wp.xtas.nu</code> as the canonical WordPress/GraphQL origin.
        </p>
      </div>

      <form method="post" style="background:#fff;border:1px solid #d8c2a4;padding:16px;border-radius:10px;box-shadow:0 1px 0 rgba(122,75,27,0.04)">
        <?php wp_nonce_field('ragbaz_connect_action'); ?>
        <h3 style="margin:0 0 12px;color:#5b3a1f">Call-home actions</h3>
        <p style="margin:0 0 12px;color:#7a4b1b;font-size:13px">
          Send a full snapshot heartbeat or a compact event payload to <code><?php echo esc_html($home_base); ?></code>.
        </p>
        <p>
          <button class="button button-primary button-large" name="ragbaz_connect_action" value="send_heartbeat" <?php disabled(!$can_phone_home); ?>>
            Phone home now (send heartbeat)
          </button>
        </p>
        <?php if (!$can_phone_home) : ?>
          <p style="margin:0 0 12px;color:#b45309;font-size:12px">
            Add Account ID and Passkey in Connection settings before sending heartbeat/events.
          </p>
        <?php endif; ?>
        <details>
          <summary style="cursor:pointer;font-weight:600;color:#7a4b1b">Advanced event payload</summary>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;max-width:720px;align-items:end;margin-top:10px">
            <label>Type<br><input name="ragbaz_event_type" class="regular-text code" value="manual_ping" placeholder="manual_ping" /></label>
            <label>Severity<br>
              <select name="ragbaz_event_severity" class="regular-text">
                <option value="good">good</option>
                <option value="warn">warn</option>
                <option value="bad">bad</option>
              </select>
            </label>
            <label>Message<br><input name="ragbaz_event_message" class="regular-text" value="Manual event from Connect panel" /></label>
          </div>
          <p style="margin-top:12px">
            <button class="button" name="ragbaz_connect_action" value="send_event" <?php disabled(!$can_phone_home); ?>>Send call-home event</button>
          </p>
        </details>
      </form>

      <div style="background:#fff;border:1px solid #d8c2a4;padding:16px;border-radius:10px;box-shadow:0 1px 0 rgba(122,75,27,0.04)">
        <h3 style="margin:0 0 10px;color:#5b3a1f">Connected site links</h3>
        <p style="margin:0 0 8px;color:#7a4b1b;font-size:12px">
          Readiness:
          <strong style="color:<?php echo esc_attr($has_account ? '#14532d' : '#991b1b'); ?>">Account <?php echo esc_html($has_account ? 'set' : 'missing'); ?></strong> ·
          <strong style="color:<?php echo esc_attr($has_passkey ? '#14532d' : '#991b1b'); ?>">Passkey <?php echo esc_html($has_passkey ? 'set' : 'missing'); ?></strong> ·
          <strong style="color:<?php echo esc_attr($has_gift ? '#14532d' : '#92400e'); ?>">Gift key <?php echo esc_html($has_gift ? 'set' : 'optional'); ?></strong> ·
          <strong style="color:<?php echo esc_attr($relay_enabled ? '#14532d' : '#92400e'); ?>">GraphQL relay <?php echo esc_html($relay_enabled ? 'enabled' : 'disabled'); ?></strong>
        </p>
        <ul style="margin:0;padding-left:18px;line-height:1.9">
          <?php if ($tenant_preview) : ?>
            <li><a href="<?php echo esc_url($tenant_preview); ?>" target="_blank" rel="noopener noreferrer">Tenant preview</a>: <code><?php echo esc_html($tenant_preview); ?></code></li>
          <?php endif; ?>
          <?php if ($tenant_slug_preview) : ?>
            <li><a href="<?php echo esc_url($tenant_slug_preview); ?>" target="_blank" rel="noopener noreferrer">Tenant preview by slug</a>: <code><?php echo esc_html($tenant_slug_preview); ?></code></li>
          <?php endif; ?>
          <?php if ($gift_info) : ?>
            <li><a href="<?php echo esc_url($gift_info); ?>" target="_blank" rel="noopener noreferrer">Gift-key site info screen</a>: <code><?php echo esc_html($gift_info); ?></code></li>
          <?php endif; ?>
          <?php if ($slug_info) : ?>
            <li><a href="<?php echo esc_url($slug_info); ?>" target="_blank" rel="noopener noreferrer">Slug site info screen</a>: <code><?php echo esc_html($slug_info); ?></code></li>
          <?php endif; ?>
          <?php if ($tenant_info) : ?>
            <li><a href="<?php echo esc_url($tenant_info); ?>" target="_blank" rel="noopener noreferrer">Domain info screen</a>: <code><?php echo esc_html($tenant_info); ?></code></li>
          <?php endif; ?>
        </ul>
        <?php if ($last_result) : ?>
          <p style="margin:10px 0 0;color:#334155;font-size:13px">
            Last result: <strong><?php echo esc_html($last_result['status']); ?></strong> at
            <code><?php echo esc_html($last_result['time']); ?></code> —
            <?php echo esc_html($last_result['message']); ?>
          </p>
        <?php endif; ?>
      </div>
    </div>

    <h3>Site debug payload</h3>
    <p style="color:#475569;font-size:13px;max-width:720px">
      This is the data that will be sent to the RAGBAZ platform. Secrets are not included — only
      whether a secret is configured and its source. Review before connecting.
    </p>
    <pre id="ragbaz-debug-payload" style="background:#0f172a;color:#e2e8f0;padding:20px;border-radius:6px;overflow:auto;font-size:12px;line-height:1.6;max-height:520px"><?php
      echo esc_html(json_encode($debug, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    ?></pre>
    <p style="margin-top:10px">
      <button class="button" onclick="
        navigator.clipboard.writeText(document.getElementById('ragbaz-debug-payload').textContent)
          .then(function(){ this.textContent='Copied!'; }.bind(this))
          .catch(function(){ this.textContent='Copy failed'; }.bind(this));
      ">Copy to clipboard</button>
    </p>

    <?php endif; ?>
  </div>
  <?php
}

// ---------------------------------------------------------------------------
// Headless authentication
// ---------------------------------------------------------------------------

/**
 * Returns the site secret used to authenticate headless API requests.
 *
 * Checks, in order:
 *   1. FaustWP settings option  (faustwp_settings['secret_key'])
 *   2. Standalone option        (ragbaz_site_secret)
 */
function ragbaz_get_site_secret() {
  $faust = get_option('faustwp_settings', []);
  if (!empty($faust['secret_key'])) {
    return trim($faust['secret_key']);
  }
  $direct = get_option('ragbaz_site_secret', '');
  return $direct ? trim($direct) : '';
}

/**
 * Extracts the secret sent by the headless client from the HTTP request.
 * Accepts X-Headless-Secret, X-Faust-Secret, X-FaustWP-Secret, or
 * X-RAGBAZ-Secret / X-RAGBAZ-Relay-Secret
 * (PHP normalises header names to HTTP_X_* in $_SERVER).
 */
function ragbaz_get_request_secret() {
  $candidates = [
    'HTTP_X_RAGBAZ_RELAY_SECRET',
    'HTTP_X_HEADLESS_SECRET',
    'HTTP_X_FAUST_SECRET',
    'HTTP_X_FAUSTWP_SECRET',
    'HTTP_X_RAGBAZ_SECRET',
  ];
  foreach ($candidates as $key) {
    if (!empty($_SERVER[$key])) {
      return trim($_SERVER[$key]);
    }
  }
  return '';
}

function ragbaz_get_graphql_relay_secret() {
  $relay = ragbaz_get_home_graphql_relay_settings(false);
  if (empty($relay['enabled'])) return '';
  return trim((string) $relay['secret']);
}

/**
 * Returns the WordPress user ID that secret-authenticated requests run as.
 *
 * Prefers a dedicated service-account user configured via the
 * `ragbaz_headless_user_id` option; falls back to the first administrator.
 * Override the resolved user via the `ragbaz_headless_user_id` filter.
 */
function ragbaz_get_headless_user_id() {
  $configured = intval(get_option('ragbaz_headless_user_id', 0));
  if ($configured > 0) {
    $user = get_user_by('id', $configured);
    if ($user && !is_wp_error($user)) {
      return apply_filters('ragbaz_headless_user_id', $configured);
    }
  }
  $admins = get_users([
    'role'   => 'administrator',
    'number' => 1,
    'fields' => 'ids',
    'orderby' => 'ID',
    'order'  => 'ASC',
  ]);
  $id = !empty($admins) ? (int) $admins[0] : 0;
  return apply_filters('ragbaz_headless_user_id', $id);
}

/**
 * Authenticate headless requests that carry the correct secret header.
 *
 * Accepted secrets:
 * - Site secret (FaustWP secret_key / ragbaz_site_secret)
 * - Optional relay secret (ragbaz_home_graphql_relay_secret when enabled)
 *
 * Requests are scoped to the /graphql endpoint so no other WordPress routes are affected.
 *
 * This makes the Faust/RAGBAZ secret a first-class authentication method for
 * WPGraphQL without depending on wp-graphql-headless-login's JWT flow.
 */
add_filter('determine_current_user', function ($user_id) {
  // Already authenticated — nothing to do.
  if ($user_id) return $user_id;

  // Scope to GraphQL endpoint only.
  $uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '';
  if (strpos($uri, '/graphql') === false) return $user_id;

  $request_secret = ragbaz_get_request_secret();
  if (!$request_secret) return $user_id;

  $accepted_secrets = [];
  $site_secret = ragbaz_get_site_secret();
  if ($site_secret) $accepted_secrets[] = $site_secret;
  $relay_secret = ragbaz_get_graphql_relay_secret();
  if ($relay_secret) $accepted_secrets[] = $relay_secret;
  if (empty($accepted_secrets)) return $user_id;

  $matched = false;
  foreach ($accepted_secrets as $secret) {
    if (hash_equals($secret, $request_secret)) {
      $matched = true;
      break;
    }
  }
  if (!$matched) return $user_id;

  $headless_id = ragbaz_get_headless_user_id();
  return $headless_id > 0 ? $headless_id : $user_id;
}, 20);

add_action('graphql_register_types', function () {
  if (!function_exists('register_graphql_field')) {
    return;
  }

  // --- LearnPress fields on LpCourse ---
  register_graphql_field('LpCourse', 'price', [
    'type'    => 'Float',
    'resolve' => function ($post) {
      $val = get_post_meta($post->databaseId, '_lp_price', true);
      return $val !== '' ? (float) $val : null;
    },
  ]);

  register_graphql_field('LpCourse', 'priceRendered', [
    'type'    => 'String',
    'resolve' => function ($post) {
      $val = get_post_meta($post->databaseId, '_lp_price', true);
      if ($val === '' || $val === false) return null;
      return 'kr' . number_format((float) $val, 2, '.', '');
    },
  ]);

  register_graphql_field('LpCourse', 'duration', [
    'type'    => 'String',
    'resolve' => function ($post) {
      $val = get_post_meta($post->databaseId, '_lp_duration', true);
      return $val !== '' ? (string) $val : null;
    },
  ]);

  register_graphql_field('LpCourse', 'curriculum', [
    'type'    => ['list_of' => 'LpLesson'],
    'resolve' => function ($post) {
      global $wpdb;
      $course_id = $post->databaseId;
      $section_table = $wpdb->prefix . 'learnpress_sections';
      $items_table   = $wpdb->prefix . 'learnpress_section_items';

      $items = $wpdb->get_results($wpdb->prepare(
        "SELECT si.item_id
         FROM {$items_table} si
         JOIN {$section_table} s ON s.section_id = si.section_id
         WHERE s.section_course_id = %d
           AND si.item_type = 'lp_lesson'
         ORDER BY s.section_order ASC, si.item_order ASC",
        $course_id
      ));

      if (empty($items)) return [];

      $ids = array_map(function ($row) { return (int) $row->item_id; }, $items);
      $posts = get_posts([
        'post_type'      => 'lp_lesson',
        'post__in'       => $ids,
        'posts_per_page' => count($ids),
        'orderby'        => 'post__in',
        'post_status'    => 'publish',
      ]);

      return array_map(function ($p) {
        return new \WPGraphQL\Model\Post($p);
      }, $posts);
    },
  ]);

  // Course access schema
  register_graphql_object_type('CourseAccessRule', [
    'fields' => [
      'courseUri' => ['type' => 'String'],
      'allowedUsers' => ['type' => ['list_of' => 'String']],
      'priceCents' => ['type' => 'Int'],
      'currency' => ['type' => 'String'],
      'vatPercent' => ['type' => 'Float'],
      'active' => ['type' => 'Boolean'],
      'updatedAt' => ['type' => 'String'],
    ],
  ]);

  register_graphql_object_type('CourseAccessForUser', [
    'fields' => [
      'hasAccess' => ['type' => 'Boolean'],
    ],
  ]);

  register_graphql_input_type('SetCourseAccessRuleInput', [
    'fields' => [
      'courseUri' => ['type' => 'String'],
      'allowedUsers' => ['type' => ['list_of' => 'String']],
      'priceCents' => ['type' => 'Int'],
      'currency' => ['type' => 'String'],
      'vatPercent' => ['type' => 'Float'],
      'active' => ['type' => 'Boolean'],
    ],
  ]);

  register_graphql_object_type('SetCourseAccessRulePayload', [
    'fields' => [
      'rule' => ['type' => 'CourseAccessRule'],
    ],
  ]);

  register_graphql_input_type('GrantCourseAccessInput', [
    'fields' => [
      'courseUri' => ['type' => 'String'],
      'email' => ['type' => 'String'],
    ],
  ]);

  register_graphql_object_type('GrantCourseAccessPayload', [
    'fields' => [
      'success' => ['type' => 'Boolean'],
    ],
  ]);

  register_graphql_field('RootQuery', 'courseAccessRules', [
    'type' => ['list_of' => 'CourseAccessRule'],
    'resolve' => function () {
      if (!current_user_can('manage_options')) return [];
      return array_values(ragbaz_get_rules());
    },
  ]);

  register_graphql_field('RootQuery', 'courseAccessConfig', [
    'type' => 'CourseAccessRule',
    'args' => [
      'courseUri' => ['type' => 'String'],
    ],
    'resolve' => function ($source, $args) {
      $rule = ragbaz_get_rule(isset($args['courseUri']) ? $args['courseUri'] : '');
      return $rule ?: null;
    },
  ]);

  register_graphql_field('RootQuery', 'courseAccessForUser', [
    'type' => 'CourseAccessForUser',
    'args' => [
      'courseUri' => ['type' => 'String'],
      'email' => ['type' => 'String'],
    ],
    'resolve' => function ($source, $args) {
      $course_uri = isset($args['courseUri']) ? $args['courseUri'] : '';
      $email = isset($args['email']) ? $args['email'] : '';
      return [
        'hasAccess' => ragbaz_has_access($course_uri, $email),
      ];
    },
  ]);

  register_graphql_mutation('setCourseAccessRule', [
    'inputFields' => [
      'courseUri' => ['type' => ['non_null' => 'String']],
      'allowedUsers' => ['type' => ['list_of' => 'String']],
      'priceCents' => ['type' => 'Int'],
      'currency' => ['type' => 'String'],
      'vatPercent' => ['type' => 'Float'],
      'active' => ['type' => 'Boolean'],
    ],
    'outputFields' => [
      'rule' => ['type' => 'CourseAccessRule'],
    ],
    'mutateAndGetPayload' => function ($input) {
      if (!current_user_can('manage_options')) {
        throw new Exception('Unauthorized');
      }
      $rule = ragbaz_set_rule(
        isset($input['courseUri']) ? $input['courseUri'] : '',
        isset($input['allowedUsers']) ? $input['allowedUsers'] : [],
        isset($input['priceCents']) ? intval($input['priceCents']) : 0,
        isset($input['currency']) ? $input['currency'] : 'usd',
        array_key_exists('active', $input) ? (bool) $input['active'] : null,
        array_key_exists('vatPercent', $input) ? $input['vatPercent'] : null
      );
      return ['rule' => $rule];
    },
  ]);

  register_graphql_mutation('grantCourseAccess', [
    'inputFields' => [
      'courseUri' => ['type' => ['non_null' => 'String']],
      'email' => ['type' => ['non_null' => 'String']],
    ],
    'outputFields' => [
      'success' => ['type' => 'Boolean'],
    ],
    'mutateAndGetPayload' => function ($input) {
      if (!current_user_can('manage_options')) {
        throw new Exception('Unauthorized');
      }
      $success = ragbaz_grant_user_access(
        isset($input['courseUri']) ? $input['courseUri'] : '',
        isset($input['email']) ? $input['email'] : ''
      );
      return ['success' => (bool) $success];
    },
  ]);

  // --- RAGBAZ info probe (for storefront detection) ---
  register_graphql_object_type('RagbazCapabilities', [
    'fields' => [
      'pluginPresent' => ['type' => 'Boolean'],
      'pluginVersion' => ['type' => 'String'],
      'pluginSemver' => ['type' => 'String'],
      'assetMetaSchemaVersion' => ['type' => 'String'],
      'assetMetaRestField' => ['type' => 'Boolean'],
      'assetMetaGraphqlField' => ['type' => 'Boolean'],
      'eventOccurrences' => ['type' => 'Boolean'],
    ],
  ]);

  register_graphql_object_type('RagbazWpRuntime', [
    'fields' => [
      'pluginVersion' => ['type' => 'String'],
      'checkedAt' => ['type' => 'String'],
      'wpDebug' => ['type' => 'Boolean'],
      'wpDebugLog' => ['type' => 'Boolean'],
      'scriptDebug' => ['type' => 'Boolean'],
      'saveQueries' => ['type' => 'Boolean'],
      'graphqlDebug' => ['type' => 'Boolean'],
      'queryMonitorActive' => ['type' => 'Boolean'],
      'xdebugActive' => ['type' => 'Boolean'],
      'objectCacheDropInPresent' => ['type' => 'Boolean'],
      'redisPluginActive' => ['type' => 'Boolean'],
      'memcachedPluginActive' => ['type' => 'Boolean'],
      'objectCacheEnabled' => ['type' => 'Boolean'],
      'opcacheEnabled' => ['type' => 'Boolean'],
      'debugFlagsOk' => ['type' => 'Boolean'],
      'debugToolsOk' => ['type' => 'Boolean'],
      'cacheReadinessOk' => ['type' => 'Boolean'],
      'okForProduction' => ['type' => 'Boolean'],
    ],
  ]);

  register_graphql_object_type('RagbazGraphqlRelay', [
    'fields' => [
      'enabled' => ['type' => 'Boolean'],
      'mode' => ['type' => 'String'],
      'headerName' => ['type' => 'String'],
      'graphqlUrl' => ['type' => 'String'],
    ],
  ]);

  register_graphql_object_type('RagbazHomeConnection', [
    'fields' => [
      'baseUrl' => ['type' => 'String'],
      'accountId' => ['type' => 'String'],
      'passkey' => ['type' => 'String'],
      'giftKey' => ['type' => 'String'],
      'tenantSlug' => ['type' => 'String'],
      'canPhoneHome' => ['type' => 'Boolean'],
      'graphqlRelay' => ['type' => 'RagbazGraphqlRelay'],
    ],
  ]);

  register_graphql_object_type('RagbazInfo', [
    'fields' => [
      'version' => ['type' => 'String'],
      'pluginSemver' => ['type' => 'String'],
      'hasLearnPress' => ['type' => 'Boolean'],
      'hasEventsPlugin' => ['type' => 'Boolean'],
      'eventsPlugin' => ['type' => 'String'],
      'wpRuntime' => ['type' => 'RagbazWpRuntime'],
      'capabilities' => ['type' => 'RagbazCapabilities'],
    ],
  ]);

  register_graphql_object_type('RagbazAttachmentAssetDimensions', [
    'fields' => [
      'width' => ['type' => 'Int'],
      'height' => ['type' => 'Int'],
    ],
  ]);

  register_graphql_object_type('RagbazAttachmentAssetOriginal', [
    'fields' => [
      'id' => ['type' => 'String'],
      'url' => ['type' => 'String'],
    ],
  ]);

  register_graphql_object_type('RagbazAttachmentAssetVariant', [
    'fields' => [
      'sourceId' => ['type' => 'Int'],
      'url' => ['type' => 'String'],
      'mime' => ['type' => 'String'],
      'size' => ['type' => 'Int'],
      'width' => ['type' => 'Int'],
      'height' => ['type' => 'Int'],
      'format' => ['type' => 'String'],
      'role' => ['type' => 'String'],
      'variantKind' => ['type' => 'String'],
      'hash' => ['type' => 'String'],
      'originalId' => ['type' => 'String'],
      'originalUrl' => ['type' => 'String'],
    ],
  ]);

  register_graphql_object_type('RagbazAttachmentAsset', [
    'fields' => [
      'assetId' => ['type' => 'String'],
      'ownerUri' => ['type' => 'String'],
      'uri' => ['type' => 'String'],
      'slug' => ['type' => 'String'],
      'role' => ['type' => 'String'],
      'format' => ['type' => 'String'],
      'variantKind' => ['type' => 'String'],
      'hash' => ['type' => 'String'],
      'mime' => ['type' => 'String'],
      'size' => ['type' => 'Int'],
      'dimensions' => ['type' => 'RagbazAttachmentAssetDimensions'],
      'original' => ['type' => 'RagbazAttachmentAssetOriginal'],
      'variants' => ['type' => ['list_of' => 'RagbazAttachmentAssetVariant']],
    ],
  ]);

  register_graphql_field('RootQuery', 'ragbazInfo', [
    'type' => 'RagbazInfo',
    'resolve' => function () {
      $capabilities = ragbaz_get_capabilities();
      return [
        'version' => RAGBAZ_VERSION,
        'pluginSemver' => $capabilities['pluginSemver'],
        'hasLearnPress' => function_exists('learn_press_get_user'),
        'hasEventsPlugin' => ragbaz_detect_events_plugin(),
        'eventsPlugin' => ragbaz_detect_events_plugin_name(),
        'wpRuntime' => current_user_can('manage_options')
          ? ragbaz_get_wp_runtime_status()
          : null,
        'capabilities' => $capabilities,
      ];
    },
  ]);

  register_graphql_field('RootQuery', 'ragbazCapabilities', [
    'type' => 'RagbazCapabilities',
    'resolve' => function () {
      return ragbaz_get_capabilities();
    },
  ]);

  register_graphql_field('RootQuery', 'ragbazWpRuntime', [
    'type' => 'RagbazWpRuntime',
    'resolve' => function () {
      if (!current_user_can('manage_options')) return null;
      return ragbaz_get_wp_runtime_status();
    },
  ]);

  register_graphql_field('RootQuery', 'ragbazHomeConnection', [
    'type' => 'RagbazHomeConnection',
    'resolve' => function () {
      if (!current_user_can('manage_options')) return null;
      return ragbaz_get_home_connection_graphql_payload();
    },
  ]);

  register_graphql_field('RootQuery', 'ragbazPluginVersion', [
    'type' => 'String',
    'resolve' => function () {
      return RAGBAZ_VERSION;
    },
  ]);

  register_graphql_field('MediaItem', 'ragbazAsset', [
    'type' => 'RagbazAttachmentAsset',
    'resolve' => function ($media_item) {
      $attachment_id = isset($media_item->databaseId)
        ? intval($media_item->databaseId)
        : (isset($media_item->ID) ? intval($media_item->ID) : 0);
      if ($attachment_id <= 0) return null;
      return ragbaz_get_attachment_asset_payload($attachment_id);
    },
  ]);

  // --- Event fields ---
  register_graphql_field('Event', 'startDate', [
    'type'    => 'String',
    'resolve' => function ($post) {
      $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
      return ragbaz_get_event_datetime($id, 'start');
    },
  ]);

  register_graphql_field('Event', 'endDate', [
    'type'    => 'String',
    'resolve' => function ($post) {
      $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
      return ragbaz_get_event_datetime($id, 'end');
    },
  ]);

  register_graphql_field('Event', 'allDay', [
    'type'    => 'Boolean',
    'resolve' => function ($post) {
      $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
      return ragbaz_get_event_all_day($id);
    },
  ]);

  register_graphql_field('Event', 'timezone', [
    'type'    => 'String',
    'resolve' => function ($post) {
      $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
      return ragbaz_get_event_timezone($id);
    },
  ]);

  register_graphql_field('Event', 'venueName', [
    'type'    => 'String',
    'resolve' => function ($post) {
      $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
      return ragbaz_get_event_venue_name($id);
    },
  ]);

  register_graphql_field('Event', 'venueAddress', [
    'type'    => 'String',
    'resolve' => function ($post) {
      $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
      return ragbaz_get_event_venue_address($id);
    },
  ]);

  register_graphql_field('Event', 'ticketUrl', [
    'type'    => 'String',
    'resolve' => function ($post) {
      $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
      return ragbaz_get_event_ticket_url($id);
    },
  ]);

  register_graphql_field('Event', 'cost', [
    'type'    => 'Float',
    'resolve' => function ($post) {
      $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
      return ragbaz_get_event_cost($id);
    },
  ]);

  // --- Event occurrences (Option A — opt-in via admin toggle) ---
  if (ragbaz_event_occurrences_enabled()) {
    register_graphql_object_type('EventOccurrence', [
      'fields' => [
        'startDate' => ['type' => 'String'],
        'endDate'   => ['type' => 'String'],
        'allDay'    => ['type' => 'Boolean'],
      ],
    ]);

    register_graphql_field('Event', 'occurrences', [
      'type'        => ['list_of' => 'EventOccurrence'],
      'description' => 'All occurrences for this event (upcoming first, then past). Only populated when the "Expand occurrences" option is enabled in RAGBAZ Bridge settings.',
      'resolve'     => function ($post) {
        $id = isset($post->databaseId) ? $post->databaseId : (isset($post->ID) ? $post->ID : 0);
        return ragbaz_get_event_occurrences($id);
      },
    ]);
  }
});
