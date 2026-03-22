# LearnPress WPGraphQL Integration — Design

## Goal

Expose LearnPress courses natively via WPGraphQL so the Next.js app can list and render courses with its own auth/paywall instead of linking externally to the tenant's WordPress `/courses/`.

## WordPress Side — mu-plugin extension

Extend the existing `Articulate-LearnPress-Stripe.php` mu-plugin.

### 1. Register LP CPTs in WPGraphQL

Use the `register_post_type_args` filter to add `show_in_graphql` for:

- `lp_course` → `LpCourse` / `LpCourses`
- `lp_lesson` → `LpLesson` / `LpLessons`

### 2. Custom field resolvers on LpCourse

- `price` (Float) — from `_lp_price` post meta
- `priceRendered` (String) — formatted price with currency
- `duration` (String) — from `_lp_duration` post meta
- `curriculum` (list of LpLesson) — resolved from `wp_learnpress_sections` + `wp_learnpress_section_items` tables

## Next.js Side

### 1. Course listing page at `/courses`

New route `src/app/courses/page.js` that queries `lpCourses` and renders a grid.

### 2. Course detail via `[...uri]` catch-all

Add `LpCourse` to the handled `__typename` list. Uses existing `Course` component + paywall logic.

### 3. LpCourse GraphQL fragment

New fragment for LpCourse: title, content, featuredImage, price, duration.

### 4. Navigation

Change Onlinekurser link from external tenant `/courses/` back to internal `/courses`.

### 5. Opt-in env var

`NEXT_PUBLIC_WORDPRESS_LEARNPRESS=1` — follows the same conditional pattern as editorBlocks and Event CPT.

## Auth Flow (already built)

The paywall in `[...uri]/page.js` checks `isCourseType` → requires login → checks `hasCourseAccess()` → shows paywall or renders content. Only needs `LpCourse` added to the typename check.

## Out of Scope

- Quiz/question GraphQL types
- LearnPress enrollment sync (mu-plugin already checks LP enrollment as fallback)
- WooCommerce integration
