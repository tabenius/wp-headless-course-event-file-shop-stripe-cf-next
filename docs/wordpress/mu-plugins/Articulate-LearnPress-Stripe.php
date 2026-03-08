<?php
/**
 * Plugin Name: Articulate-LearnPress-Stripe
 * Description: Stores LearnPress course access rules in WP options + user meta and exposes WPGraphQL fields/mutations.
 * Author: Articulate
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
  exit;
}

const ARTICULATE_COURSE_RULES_OPTION = 'Articulate_course_access_rules';

function hwptoolkit_normalize_email($email) {
  return sanitize_email(strtolower(trim((string) $email)));
}

function hwptoolkit_normalize_uri($uri) {
  $uri = trim((string) $uri);
  if ($uri === '') return '';
  return strpos($uri, '/') === 0 ? $uri : '/' . $uri;
}

function hwptoolkit_get_rules() {
  $rules = get_option(ARTICULATE_COURSE_RULES_OPTION, []);
  return is_array($rules) ? $rules : [];
}

function hwptoolkit_set_rules($rules) {
  update_option(ARTICULATE_COURSE_RULES_OPTION, $rules, false);
}

function hwptoolkit_get_rule($course_uri) {
  $course_uri = hwptoolkit_normalize_uri($course_uri);
  if ($course_uri === '') return null;
  $rules = hwptoolkit_get_rules();
  return isset($rules[$course_uri]) && is_array($rules[$course_uri]) ? $rules[$course_uri] : null;
}

function hwptoolkit_set_rule($course_uri, $allowed_users, $price_cents, $currency) {
  $course_uri = hwptoolkit_normalize_uri($course_uri);
  if ($course_uri === '') return null;

  $emails = array_values(array_unique(array_filter(array_map('hwptoolkit_normalize_email', (array) $allowed_users))));
  $price_cents = max(0, intval($price_cents));
  $currency = sanitize_text_field(strtolower((string) $currency));
  if ($currency === '') $currency = 'usd';

  $rules = hwptoolkit_get_rules();
  $rules[$course_uri] = [
    'courseUri' => $course_uri,
    'allowedUsers' => $emails,
    'priceCents' => $price_cents,
    'currency' => $currency,
    'updatedAt' => gmdate('c'),
  ];
  hwptoolkit_set_rules($rules);
  return $rules[$course_uri];
}

function hwptoolkit_grant_user_access($course_uri, $email) {
  $course_uri = hwptoolkit_normalize_uri($course_uri);
  $email = hwptoolkit_normalize_email($email);
  if ($course_uri === '' || $email === '') return false;

  $rule = hwptoolkit_get_rule($course_uri);
  if (!$rule) {
    $rule = [
      'courseUri' => $course_uri,
      'allowedUsers' => [],
      'priceCents' => 0,
      'currency' => 'usd',
      'updatedAt' => gmdate('c'),
    ];
  }

  if (!in_array($email, $rule['allowedUsers'], true)) {
    $rule['allowedUsers'][] = $email;
  }

  hwptoolkit_set_rule(
    $course_uri,
    $rule['allowedUsers'],
    isset($rule['priceCents']) ? intval($rule['priceCents']) : 0,
    isset($rule['currency']) ? $rule['currency'] : 'usd'
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

function hwptoolkit_has_access($course_uri, $email) {
  $course_uri = hwptoolkit_normalize_uri($course_uri);
  $email = hwptoolkit_normalize_email($email);
  if ($course_uri === '' || $email === '') return false;

  $rule = hwptoolkit_get_rule($course_uri);
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
// Register LearnPress CPTs in WPGraphQL
// ---------------------------------------------------------------------------
add_filter('register_post_type_args', function ($args, $post_type) {
  $lp_types = [
    'lp_course' => ['graphql_single' => 'LpCourse',  'graphql_plural' => 'LpCourses'],
    'lp_lesson' => ['graphql_single' => 'LpLesson',  'graphql_plural' => 'LpLessons'],
  ];
  if (isset($lp_types[$post_type])) {
    $args['show_in_graphql']     = true;
    $args['graphql_single_name'] = $lp_types[$post_type]['graphql_single'];
    $args['graphql_plural_name'] = $lp_types[$post_type]['graphql_plural'];
  }
  return $args;
}, 10, 2);

add_action('graphql_register_types', function () {
  if (!function_exists('register_graphql_object_type')) {
    return;
  }

  // -- LearnPress custom fields on LpCourse --
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

  register_graphql_object_type('CourseAccessRule', [
    'fields' => [
      'courseUri' => ['type' => 'String'],
      'allowedUsers' => ['type' => ['list_of' => 'String']],
      'priceCents' => ['type' => 'Int'],
      'currency' => ['type' => 'String'],
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
      return array_values(hwptoolkit_get_rules());
    },
  ]);

  register_graphql_field('RootQuery', 'courseAccessConfig', [
    'type' => 'CourseAccessRule',
    'args' => [
      'courseUri' => ['type' => 'String'],
    ],
    'resolve' => function ($source, $args) {
      $rule = hwptoolkit_get_rule(isset($args['courseUri']) ? $args['courseUri'] : '');
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
        'hasAccess' => hwptoolkit_has_access($course_uri, $email),
      ];
    },
  ]);

  register_graphql_mutation('setCourseAccessRule', [
    'inputFields' => [
      'courseUri' => ['type' => ['non_null' => 'String']],
      'allowedUsers' => ['type' => ['list_of' => 'String']],
      'priceCents' => ['type' => 'Int'],
      'currency' => ['type' => 'String'],
    ],
    'outputFields' => [
      'rule' => ['type' => 'CourseAccessRule'],
    ],
    'mutateAndGetPayload' => function ($input) {
      if (!current_user_can('manage_options')) {
        throw new Exception('Unauthorized');
      }
      $rule = hwptoolkit_set_rule(
        isset($input['courseUri']) ? $input['courseUri'] : '',
        isset($input['allowedUsers']) ? $input['allowedUsers'] : [],
        isset($input['priceCents']) ? intval($input['priceCents']) : 0,
        isset($input['currency']) ? $input['currency'] : 'usd'
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
      $success = hwptoolkit_grant_user_access(
        isset($input['courseUri']) ? $input['courseUri'] : '',
        isset($input['email']) ? $input['email'] : ''
      );
      return ['success' => (bool) $success];
    },
  ]);
});
