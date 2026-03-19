/**
 * Convert a string to a URL-safe slug.
 * Handles Unicode characters (Swedish å/ä/ö etc.) via NFKD normalization.
 */
export function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip HTML tags and collapse whitespace. */
export function stripHtml(html) {
  return (html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
