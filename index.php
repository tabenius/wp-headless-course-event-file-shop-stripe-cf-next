<?php
/**
 * Headless WordPress Proxy Index
 * Location: xtas.nu
 * * Routes local WP internals to wp-index.php
 * Routes all other traffic to https://xtas.ragbaz.xyz/
 */

$request_uri = $_SERVER['REQUEST_URI'];
$remote_base = 'https://xtas.ragbaz.xyz';

// 1. Define Local WordPress Routes
$is_graphql  = (strpos($request_uri, '/graphql') !== false);
$is_rest_api = (strpos($request_uri, '/wp-json') !== false);
$is_admin    = (strpos($request_uri, '/wp-admin') !== false || strpos($request_uri, '/wp-login.php') !== false);
$is_includes = (strpos($request_uri, '/wp-includes') !== false || strpos($request_uri, '/wp-content') !== false);

// If it's a WordPress internal request or a physical file request (images/plugins), 
// let the local server handle it via the renamed wp-index.php.
if ($is_graphql || $is_rest_api || $is_admin || $is_includes || file_exists(__DIR__ . $request_uri)) {
    // Only load wp-index if it's not a direct file (like an image)
    if (!file_exists(__DIR__ . $request_uri) || is_dir(__DIR__ . $request_uri)) {
        require __DIR__ . '/wp-index.php';
    }
    return;
}

// 2. Proxy everything else to Next.js
$target_url = $remote_base . $request_uri;

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $target_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

// Forward POST data (for forms, search, etc.)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

// Forward Request Headers (Auth, Cookies, etc.)
$headers = [];
foreach (getallheaders() as $name => $value) {
    if (strtolower($name) !== 'host') {
        $headers[] = "$name: $value";
    }
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

// Execute Proxy Request
$response = curl_exec($ch);
$info = curl_getinfo($ch);
curl_close($ch);

// 3. Send Response to Browser
http_response_code($info['http_code']);

// Forward the Content-Type (HTML, JSON, etc.)
if (isset($info['content_type'])) {
    header("Content-Type: " . $info['content_type']);
}

echo $response;
exit;
