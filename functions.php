<?php
/**
 * Enable CORS for Headless Next.js Frontend
 * Add this to functions.php or a custom plugin
 */

add_action('init', function() {
    $allowed_origin = 'https://xtas.ragbaz.xyz';

    // Check if the request is coming from our Next.js frontend
    if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] === $allowed_origin) {
        header("Access-Control-Allow-Origin: $allowed_origin");
        header("Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE");
        header("Access-Control-Allow-Credentials: true");
        header("Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, X-WP-Nonce");

        // Handle the OPTIONS 'Preflight' request immediately
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            status_header(200);
            exit;
        }
    }
});

// Specifically for the REST API (if you use it alongside GraphQL)
add_filter('rest_pre_serve_request', function($value) {
    header("Access-Control-Allow-Origin: https://xtas.ragbaz.xyz");
    header("Access-Control-Allow-Credentials: true");
    return $value;
});
