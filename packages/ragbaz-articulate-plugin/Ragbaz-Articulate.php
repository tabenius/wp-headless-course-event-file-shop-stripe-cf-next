<?php
/**
 * Plugin Name: RAGBAZ-Articulate
 * Plugin URI: https://ragbaz.xyz/products
 * Description: GraphQL helpers for headless storefronts — exposes LearnPress courses and generic event data (Event Organiser, The Events Calendar, Events Manager) via WPGraphQL without bundling third‑party code.
 * Author: RAGBAZ / Articulate
 * Author URI: https://ragbaz.xyz
 * Version: 1.0.2
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
const RAGBAZ_VERSION = '1.0.2';
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

function ragbaz_set_rule($course_uri, $allowed_users, $price_cents, $currency, $active = null) {
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

  $rules[$course_uri] = [
    'courseUri' => $course_uri,
    'allowedUsers' => $emails,
    'priceCents' => $price_cents,
    'currency' => $currency,
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
    !isset($rule['active']) || (bool) $rule['active']
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
        array_key_exists('active', $input) ? (bool) $input['active'] : null
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
  register_graphql_object_type('RagbazInfo', [
    'fields' => [
      'version' => ['type' => 'String'],
      'hasLearnPress' => ['type' => 'Boolean'],
      'hasEventsPlugin' => ['type' => 'Boolean'],
    ],
  ]);

  register_graphql_field('RootQuery', 'ragbazInfo', [
    'type' => 'RagbazInfo',
    'resolve' => function () {
      return [
        'version' => RAGBAZ_VERSION,
        'hasLearnPress' => function_exists('learn_press_get_user'),
        'hasEventsPlugin' => ragbaz_detect_events_plugin(),
      ];
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
