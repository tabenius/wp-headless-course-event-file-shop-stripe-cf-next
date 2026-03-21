<?php
/**
 * Plugin Name: RAGBAZ-Articulate
 * Plugin URI: https://ragbaz.xyz/products
 * Description: GraphQL helpers for headless storefronts — exposes LearnPress courses and generic event data (Event Organiser, The Events Calendar, Events Manager) via WPGraphQL without bundling third‑party code.
 * Author: RAGBAZ / Articulate
 * Author URI: https://ragbaz.xyz
 * Version: 1.0.3
 * Requires at least: 6.3
 * Tested up to: 6.5
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Requires: WPGraphQL
 * Optional: LearnPress, Event Organiser, The Events Calendar, Events Manager, WooCommerce + WPGraphQL for WooCommerce
 * Text Domain: ragbaz-articulate
 * Contact: ragbaz@proton.me
 */

if (!defined('ABSPATH')) {
  exit;
}

// Keep the legacy option name so existing rules remain intact.
const RAGBAZ_COURSE_RULES_OPTION = 'Articulate_course_access_rules';
const RAGBAZ_VERSION = '1.0.3';
const RAGBAZ_STOREFRONT_URL = 'https://github.com/ragbaz/ragbaz-articulate-storefront';

function ragbaz_get_storefront_url() {
  return esc_url_raw(apply_filters('ragbaz_storefront_url', RAGBAZ_STOREFRONT_URL));
}

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
  $event_types = ['event', 'events', 'tribe_events', 'event_listing', 'eo_event'];
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
function ragbaz_get_event_datetime($post_id, $which = 'start') {
  $post_id = intval($post_id);
  if ($post_id <= 0) return null;

  // Event Organiser helper (preferred when available)
  if ($which === 'start' && function_exists('eo_get_the_start')) {
    $val = eo_get_the_start('c', $post_id);
    if ($val) return ragbaz_normalize_iso_datetime($val);
  }
  if ($which === 'end' && function_exists('eo_get_the_end')) {
    $val = eo_get_the_end('c', $post_id);
    if ($val) return ragbaz_normalize_iso_datetime($val);
  }

  // The Events Calendar / Events Manager meta keys
  $meta_keys = $which === 'start'
    ? ['_EventStartDate', '_EventStartDateUTC', '_event_start_date', '_event_start', '_EventStartDateISO']
    : ['_EventEndDate', '_EventEndDateUTC', '_event_end_date', '_event_end', '_EventEndDateISO'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if ($val !== '' && $val !== false) {
      $iso = ragbaz_normalize_iso_datetime($val);
      if ($iso) return $iso;
    }
  }

  $post = get_post($post_id);
  if ($post) {
    if ($which === 'start' && $post->post_date_gmt) return ragbaz_normalize_iso_datetime($post->post_date_gmt);
    if ($which === 'end' && $post->post_modified_gmt) return ragbaz_normalize_iso_datetime($post->post_modified_gmt);
  }

  return null;
}

function ragbaz_get_event_all_day($post_id) {
  $post_id = intval($post_id);
  if ($post_id <= 0) return null;

  if (function_exists('eo_is_all_day')) {
    return (bool) eo_is_all_day($post_id);
  }

  $meta_keys = ['_EventAllDay', '_event_all_day'];
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

  $meta_keys = ['_EventTimezone', '_event_timezone'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if (is_string($val) && $val !== '') return $val;
  }

  return get_option('timezone_string') ?: null;
}

function ragbaz_get_event_venue_name($post_id) {
  if (function_exists('eo_get_venue_name')) {
    $val = eo_get_venue_name(false, $post_id);
    if ($val) return $val;
  }
  if (function_exists('tribe_get_venue')) {
    $val = tribe_get_venue($post_id);
    if ($val) return $val;
  }

  $terms = wp_get_post_terms($post_id, ['event-venue', 'event_venue', 'tribe_venue']);
  if (!is_wp_error($terms) && !empty($terms)) {
    return $terms[0]->name;
  }

  return null;
}

function ragbaz_get_event_venue_address($post_id) {
  if (function_exists('eo_get_venue_address')) {
    $address = eo_get_venue_address(false, $post_id);
    if (is_array($address) && !empty($address)) {
      return implode(', ', array_filter($address));
    }
  }
  if (function_exists('tribe_get_full_address')) {
    $addr = tribe_get_full_address($post_id, true);
    if ($addr) return $addr;
  }

  $meta_keys = ['_VenueAddress', '_venue_address'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if (is_string($val) && trim($val) !== '') return $val;
  }

  return null;
}

function ragbaz_get_event_ticket_url($post_id) {
  $meta_keys = ['_EventURL', '_event_url'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if (is_string($val) && trim($val) !== '') return esc_url_raw($val);
  }
  return null;
}

function ragbaz_get_event_cost($post_id) {
  $meta_keys = ['_EventCost', '_event_cost', '_EventPrice'];
  foreach ($meta_keys as $key) {
    $val = get_post_meta($post_id, $key, true);
    if ($val !== '' && $val !== false) return (float) $val;
  }
  return null;
}

function ragbaz_detect_events_plugin() {
  $event_types = ['event', 'events', 'tribe_events', 'event_listing', 'eo_event'];
  foreach ($event_types as $type) {
    if (post_type_exists($type)) return true;
  }
  return false;
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
  ];
}

// ---------------------------------------------------------------------------
// Admin UI: surface storefront link in plugin row + lightweight notice
// ---------------------------------------------------------------------------
function ragbaz_plugin_row_links($links) {
  $links[] = sprintf(
    '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
    esc_url(ragbaz_get_storefront_url()),
    esc_html__('Use with Articulate storefront (GitHub)', 'ragbaz')
  );
  return $links;
}

add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'ragbaz_plugin_row_links');
add_filter('plugin_row_meta', function ($links, $file) {
  if ($file === plugin_basename(__FILE__)) {
    $links[] = sprintf(
      '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
      esc_url(ragbaz_get_storefront_url()),
      esc_html__('Storefront repo', 'ragbaz')
    );
  }
  return $links;
}, 10, 2);

function ragbaz_admin_notice() {
  if (!current_user_can('manage_options')) return;
  if (defined('DOING_AJAX') && DOING_AJAX) return;
  // Avoid showing on every page load
  if (get_transient('ragbaz_notice_shown')) return;
  set_transient('ragbaz_notice_shown', '1', DAY_IN_SECONDS);
  $url = esc_url(ragbaz_get_storefront_url());
  echo '<div class="notice notice-info is-dismissible"><p>';
  echo sprintf(
    esc_html__('RAGBAZ-Articulate is active. Pair it with the Articulate storefront: %s', 'ragbaz'),
    '<a href="' . $url . '" target="_blank" rel="noopener noreferrer">' . $url . '</a>'
  );
  echo '</p></div>';
}
add_action('admin_notices', 'ragbaz_admin_notice');
add_action('network_admin_notices', 'ragbaz_admin_notice');

function ragbaz_register_info_page() {
  add_management_page(
    'RAGBAZ Articulate Info',
    'RAGBAZ Articulate',
    'manage_options',
    'ragbaz-articulate-info',
    'ragbaz_render_info_page'
  );
}
add_action('admin_menu', 'ragbaz_register_info_page');

function ragbaz_bool_label($value) {
  return $value ? 'on' : 'off';
}

function ragbaz_render_info_page() {
  if (!current_user_can('manage_options')) {
    wp_die(esc_html__('Unauthorized', 'ragbaz'));
  }
  $status = ragbaz_get_wp_runtime_status();
  $checks = ragbaz_get_wp_runtime_checks();
  ?>
  <div class="wrap">
    <h1>RAGBAZ Articulate Info</h1>
    <p>
      Minimal production-readiness checks for WordPress runtime and GraphQL debug settings.
    </p>
    <table class="widefat striped" style="max-width: 980px;">
      <thead>
        <tr>
          <th>Setting</th>
          <th>Current</th>
          <th>Recommended</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
      <?php foreach ($checks as $check) : ?>
        <?php
        $ok = !empty($check['ok']);
        $required = !empty($check['required']);
        $status_text = $ok ? 'OK' : ($required ? 'ACTION' : 'RECOMMENDED');
        ?>
        <tr>
          <td><code><?php echo esc_html($check['label']); ?></code></td>
          <td><strong><?php echo esc_html(ragbaz_bool_label(!empty($check['value']))); ?></strong></td>
          <td><?php echo esc_html(ragbaz_bool_label(!empty($check['recommended']))); ?></td>
          <td style="font-weight: 600; color: <?php echo esc_attr($ok ? '#166534' : ($required ? '#b91c1c' : '#92400e')); ?>">
            <?php echo esc_html($status_text); ?>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>

    <p style="margin-top: 14px;">
      <strong>Production-ready summary:</strong>
      <span style="color: <?php echo esc_attr($status['okForProduction'] ? '#166534' : '#b91c1c'); ?>; font-weight: 600;">
        <?php echo esc_html($status['okForProduction'] ? 'OK' : 'Needs action'); ?>
      </span>
      <span style="margin-left: 12px; color: #475569;">Checked: <?php echo esc_html($status['checkedAt']); ?></span>
    </p>

    <h2 style="margin-top: 24px;">GraphQL essentials</h2>
    <p>Query only the terse essentials from WPGraphQL:</p>
    <pre style="max-width: 980px; overflow: auto;"><code>query RagbazRuntime {
  ragbazPluginVersion
  ragbazWpRuntime {
    pluginVersion
    checkedAt
    okForProduction
    cacheReadinessOk
    wpDebug
    wpDebugLog
    scriptDebug
    saveQueries
    graphqlDebug
    queryMonitorActive
    xdebugActive
    objectCacheDropInPresent
    redisPluginActive
    memcachedPluginActive
    objectCacheEnabled
    opcacheEnabled
  }
}</code></pre>
  </div>
  <?php
}

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

  register_graphql_object_type('RagbazInfo', [
    'fields' => [
      'version' => ['type' => 'String'],
      'pluginSemver' => ['type' => 'String'],
      'hasLearnPress' => ['type' => 'Boolean'],
      'hasEventsPlugin' => ['type' => 'Boolean'],
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
});
