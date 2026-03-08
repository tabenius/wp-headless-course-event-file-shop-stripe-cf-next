import config from "../../site.json";

const baseUrl = (
  process.env.NEXT_PUBLIC_WORDPRESS_URL ||
  config.url ||
  "https://www.xtas.nu"
).replace(/\/$/, "");

/** Full URL for a WordPress asset path */
export function wpAsset(path) {
  return `${baseUrl}${path}`;
}

/** Site configuration with resolved URLs */
const site = {
  ...config,
  url: baseUrl,
  logoUrl: wpAsset(config.logo.path),
  bgImageUrl: wpAsset(config.backgroundImage),
  faviconUrl: wpAsset(config.icons.favicon),
  appleIconUrl: wpAsset(config.icons.apple),
  socialLinks: Object.values(config.social),
};

export default site;
