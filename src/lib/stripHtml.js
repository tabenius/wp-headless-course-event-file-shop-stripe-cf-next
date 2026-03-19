export function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  // Remove shortcodes like [gallery ids="1,2"] or [embed]...[/embed]
  const withoutShortcodes = html.replace(/\[\/?\w[^\]]*\]/g, " ");
  // Strip HTML tags
  return withoutShortcodes.replace(/<[^>]*>/g, " ");
}
