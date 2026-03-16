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
  productionBrowserSourceMaps: true,
  outputFileTracingRoot: '.',
  env: {
    NEXT_PUBLIC_BUILD_TIME:
      process.env.NEXT_PUBLIC_BUILD_TIME ||
      process.env.BUILD_TIME ||
      process.env.VERCEL_GIT_COMMIT_TIMESTAMP ||
      process.env.VERCEL_DEPLOYMENT_TIME ||
      new Date().toISOString(),
    NEXT_PUBLIC_GIT_SHA:
      process.env.NEXT_PUBLIC_GIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "",
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    return config;
  },
  terserOptions: {
    compress: {
      drop_console: false,
    },
  },
  async rewrites() {
    const wpBase = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").replace(/\/+$/, "");
    const hasWp = Boolean(wpBase);
    return hasWp
      ? [
          {
            source: "/wp-content/:path*",
            destination: `${wpBase}/wp-content/:path*`,
          },
        ]
      : [];
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "localhost" },
      { protocol: "http", hostname: wpHostname },
      { protocol: "https", hostname: wpHostname },
      { protocol: "https", hostname: "usercontent.one" },
    ],
    ...(process.env.CLOUDFLARE_IMAGE_RESIZING === "1"
      ? {
          loader: "custom",
          loaderFile: "./src/lib/cloudflareImageLoader.js",
        }
      : {}),
  },
};

export default nextConfig;
