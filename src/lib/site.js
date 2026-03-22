import config from "../../site.json";
import { tenantConfig } from "@/lib/tenantConfig";

/**
 * Lazily resolve the base URL so Cloudflare Workers secrets/vars
 * override the build-time .env value.
 */
function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_WORDPRESS_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    tenantConfig.siteUrl ||
    config.url ||
    "https://www.example.com"
  ).replace(/\/$/, "");
}

/** Resolve an asset path — local paths (/img/...) stay as-is, WP paths get prefixed */
export function wpAsset(assetPath) {
  if (assetPath.startsWith("/img/") || assetPath.startsWith("http")) {
    return assetPath;
  }
  return `${getBaseUrl()}${assetPath}`;
}

/**
 * Site configuration with a Proxy so `site.url` and asset URLs
 * always reflect the current runtime env vars, not build-time values.
 */
const staticSite = {
  ...config,
  url: tenantConfig.siteUrl || config.url,
  contact: {
    ...(config.contact || {}),
    email: tenantConfig.supportEmail || config?.contact?.email,
  },
  logoUrl: wpAsset(config.logo.path),
  bgImageUrl: wpAsset(config.backgroundImage),
  faviconUrl: wpAsset(config.icons.favicon),
  appleIconUrl: wpAsset(config.icons.apple),
  socialLinks: Object.values(config.social),
};

const site = new Proxy(staticSite, {
  get(target, prop) {
    if (prop === "url") return getBaseUrl();
    return target[prop];
  },
});

export default site;
