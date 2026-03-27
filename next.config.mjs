import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const wpHostname = (() => {
  try {
    return (
      new URL(process.env.NEXT_PUBLIC_WORDPRESS_URL || "").hostname ||
      "localhost"
    );
  } catch {
    return "localhost";
  }
})();

const wpImageHosts = (() => {
  const hosts = new Set(["localhost"]);
  if (wpHostname) {
    hosts.add(wpHostname);
    if (wpHostname.startsWith("www.")) {
      hosts.add(wpHostname.slice(4));
    } else {
      hosts.add(`www.${wpHostname}`);
    }
  }
  return Array.from(hosts);
})();

const nextConfig = {
  trailingSlash: true,
  reactStrictMode: true,
  productionBrowserSourceMaps:
    process.env.PRODUCTION_BROWSER_SOURCEMAPS === "1",
  outputFileTracingRoot: __dirname,
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
  turbopack: {
    rules: {
      "*.md": {
        loaders: [{ loader: "raw-loader" }],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    return config;
  },
  async rewrites() {
    const wpBase = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").replace(
      /\/+$/,
      "",
    );
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
      ...wpImageHosts.flatMap((hostname) => [
        { protocol: "http", hostname },
        { protocol: "https", hostname },
      ]),
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
