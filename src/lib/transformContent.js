import site from "@/lib/site";

/**
 * Transform WordPress HTML content:
 * - Add mailto: prefix to bare email links
 * - Strip site hostname from internal links (href)
 * - Handles both www and non-www variants
 */
export function transformContent(html) {
  if (!html) return html;

  // Add mailto: to email links missing it (href="someone@example.com")
  let result = html.replace(
    /href="([^"@\s]+@[^"@\s]+\.[^"\s]+)"/g,
    (match, email) => {
      if (email.startsWith("mailto:") || email.startsWith("http")) return match;
      return `href="mailto:${email}"`;
    },
  );

  // Collect all origin variants to strip (www / non-www, with / without trailing slash)
  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").replace(/\/+$/, "");
  const siteUrl = (site.url || "").replace(/\/+$/, "");
  const origins = new Set();
  for (const url of [wpUrl, siteUrl]) {
    if (!url) continue;
    origins.add(url);
    // Add www / non-www counterpart
    if (url.includes("://www.")) {
      origins.add(url.replace("://www.", "://"));
    } else {
      origins.add(url.replace("://", "://www."));
    }
  }

  for (const origin of origins) {
    const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`href="${escaped}(/[^"]*)"`, "g"),
      'href="$1"',
    );
    result = result.replace(
      new RegExp(`href="${escaped}"`, "g"),
      'href="/"',
    );
  }

  return result;
}
