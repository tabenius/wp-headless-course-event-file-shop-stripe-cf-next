/** @type {import('next').NextConfig} */
const wpHostname = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_WORDPRESS_URL || "").hostname || "localhost";
  } catch {
    return "localhost";
  }
})();

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: '.',
  webpack(config) {
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "localhost" },
      { protocol: "http", hostname: wpHostname },
      { protocol: "https", hostname: wpHostname },
    ],
    ...(process.env.CLOUDFLARE_IMAGE_RESIZING === "1"
      ? {
          loader: "custom",
          loaderFile: "./src/lib/cloudflareImageLoader.js",
        }
      : {}),
  },
  // Note: env variables are set in next.config.js only accept string values so used publicRuntimeConfig instead
  publicRuntimeConfig: {
    // Controls posts per page for blog, category and tag pages
    wordPressDisplaySettings: {
      postsPerPage: 5,
    },
  },
};

export default nextConfig;
