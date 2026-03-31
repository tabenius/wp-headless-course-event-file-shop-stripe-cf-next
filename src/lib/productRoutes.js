/**
 * Single source of truth for product routing and display decisions.
 * Used by inventory, shop, and admin components.
 */

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
