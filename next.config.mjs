import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function envFlagEnabled(rawValue, defaultEnabled = false) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return defaultEnabled;
  }
  const value = String(rawValue).trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
}

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

const ragbazHomeBase = (() => {
  const raw =
    process.env.NEXT_PUBLIC_RAGBAZ_HOME_BASE_URL ||
    process.env.RAGBAZ_HOME_BASE_URL ||
    "https://ragbaz.xyz";
  return String(raw).replace(/\/+$/, "");
})();

const ragbazDocsBase = (() => {
  const raw =
    process.env.NEXT_PUBLIC_RAGBAZ_DOCS_BASE_URL ||
    `${ragbazHomeBase}/docs`;
  return String(raw).replace(/\/+$/, "");
})();

const enableSpanishLocale = envFlagEnabled(
  process.env.NEXT_PUBLIC_ENABLE_ES_LOCALE,
  false,
);

const nextConfig = {
  trailingSlash: true,
  reactStrictMode: true,
  // Keep production browser source maps disabled by default. Enable them only
  // for builds where protected /__maps debugging is needed.
  productionBrowserSourceMaps: envFlagEnabled(
    process.env.PRODUCTION_BROWSER_SOURCEMAPS,
    false,
  ),
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
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/lib/i18n/es.runtime":
        enableSpanishLocale === true
          ? path.resolve(__dirname, "src/lib/i18n/es.runtime.js")
          : path.resolve(__dirname, "src/lib/i18n/es.disabled.js"),
    };
    return config;
  },
  async redirects() {
    return [
      // Docs split: keep local /docs/admin/* static assets intact, only redirect
      // guide/documentation pages.
      {
        source: "/docs",
        destination: `${ragbazDocsBase}`,
        permanent: true,
      },
      {
        source: "/docs/:lang(en|sv|es)",
        destination: `${ragbazDocsBase}/:lang`,
        permanent: true,
      },
      {
        source: "/docs/:lang(en|sv|es)/:slug*",
        destination: `${ragbazDocsBase}/:lang/:slug*`,
        permanent: true,
      },
      {
        source: "/technical-manual",
        destination: `${ragbazDocsBase}/en/technical-manual`,
        permanent: true,
      },
      {
        source: "/changelog",
        destination: `${ragbazDocsBase}/en/changelog`,
        permanent: true,
      },
      // Release/download split to ragbaz.xyz.
      {
        source: "/downloads/ragbaz-bridge/ragbaz-bridge.zip",
        destination: `${ragbazHomeBase}/downloads/ragbaz-bridge/ragbaz-bridge.zip`,
        permanent: true,
      },
      {
        source: "/release/ragbaz-bridge.zip",
        destination: `${ragbazHomeBase}/release/ragbaz-bridge.zip`,
        permanent: true,
      },
      {
        source: "/release/ragbaz-bridge/latest",
        destination: `${ragbazHomeBase}/release/ragbaz-bridge/latest`,
        permanent: true,
      },
      {
        source: "/release/ragbaz-bridge/:version/ragbaz-bridge.zip",
        destination: `${ragbazHomeBase}/release/ragbaz-bridge/:version/ragbaz-bridge.zip`,
        permanent: true,
      },
      {
        source: "/bridge/plugin-download",
        destination: `${ragbazHomeBase}/bridge/plugin-download`,
        permanent: true,
      },
      {
        source: "/articulate/plugin-download",
        destination: `${ragbazHomeBase}/articulate/plugin-download`,
        permanent: true,
      },
    ];
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
