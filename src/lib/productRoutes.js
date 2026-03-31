/**
 * Single source of truth for product routing and display decisions.
 * Used by inventory, shop, and admin components.
 */

/**
 * Slug prefix for a new product based on its mode and (for manual_uri) WP post type.
 * Only applied at creation time — never retroactively to existing slugs.
 *
 * wpType comes from allWpContent[n]._type: "course" | "event" | "product" | …
 */
export function resolveSlugPrefix(productMode, wpType) {
  if (productMode === "asset") return "asset-";
  if (productMode === "digital_file") return "dl-";
  if (productMode === "manual_uri") {
    if (wpType === "course") return "course-";
    if (wpType === "event") return "event-";
    return "content-";
  }
  return "";
}

/**
 * Resolve the URL a logged-in owner navigates to in order to access a product.
 * - asset / digital_file  → /digital/{slug}  (proxied access check)
 * - manual_uri            → product.contentUri  (WordPress content path)
 * - fallback              → /shop/{slug}
 */
export function resolveProductHref(product) {
  const mode = product?.productMode || "digital_file";
  const slug = product?.slug || product?.id || "";
  if (mode === "asset" || mode === "digital_file") {
    return slug ? `/digital/${encodeURIComponent(slug)}` : "";
  }
  if (mode === "manual_uri" && product?.contentUri) {
    return product.contentUri;
  }
  return slug ? `/shop/${encodeURIComponent(slug)}` : "";
}

/** Action label for an owned product. */
export function resolveProductAction(product) {
  const mode = product?.productMode || "digital_file";
  if (mode === "asset" || mode === "digital_file") return "Download";
  if (mode === "manual_uri") return "Open content";
  return "Open";
}

/** Display label for the product type. */
export function resolveProductTypeLabel(product) {
  const mode = product?.productMode || "digital_file";
  if (mode === "asset") return "Asset product";
  if (mode === "digital_file") return "Digital file";
  if (mode === "manual_uri") return "Protected content";
  return "Product";
}
