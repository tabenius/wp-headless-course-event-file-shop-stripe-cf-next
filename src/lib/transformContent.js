import site from "@/lib/site";
import { decodeEntities } from "@/lib/decodeEntities";

/**
 * Transform WordPress HTML content:
 * - Add mailto: prefix to bare email links
 * - Strip site hostname from internal links (href)
 * - Handles http/https, www/non-www variants
 */
export function transformContent(html) {
  if (!html) return "";

  let result = decodeEntities(html);

  // Add mailto: to email links missing it (href="someone@example.com")
  result = result.replace(
    /href="([^"@\s]+@[^"@\s]+\.[^"\s]+)"/g,
    (match, email) => {
      if (email.startsWith("mailto:") || email.startsWith("http")) return match;
      return `href="mailto:${email}"`;
    },
  );

  // Collect all origin variants to strip
  // (http/https, www/non-www, with/without trailing slash)
  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "").replace(
    /\/+$/,
    "",
  );
  const siteUrl = (site.url || "").replace(/\/+$/, "");
  const origins = new Set();
  for (const url of [wpUrl, siteUrl]) {
    if (!url) continue;
    // Add both http and https variants
    const httpsUrl = url.replace(/^http:/, "https:");
    const httpUrl = url.replace(/^https:/, "http:");
    for (const variant of [httpsUrl, httpUrl]) {
      origins.add(variant);
      // Add www / non-www counterpart
      if (variant.includes("://www.")) {
        origins.add(variant.replace("://www.", "://"));
      } else {
        origins.add(variant.replace("://", "://www."));
      }
    }
  }

  for (const origin of origins) {
    const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`href="${escaped}(/[^"]*)"`, "g"),
      'href="$1"',
    );
    result = result.replace(new RegExp(`href="${escaped}"`, "g"), 'href="/"');
  }

  // Auto-link bare email addresses (not already linked)
  result = result.replace(
    /(^|[\s>])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})($|[\s<])/gi,
    (_, prefix, email, suffix) =>
      `${prefix}<a href="mailto:${email}">${email}</a>${suffix}`,
  );

  // Replace Contact Form 7 shortcodes with a simple contact form
  const contactEmail =
    site?.contact?.email ||
    process.env.CONTACT_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    "info@xtas.nu";
  const formHtml = `
    <form class="contact-form space-y-3 bg-gray-50 border border-gray-200 p-4 rounded" method="POST" action="/api/contact">
      <input type="hidden" name="to" value="${contactEmail}" />
      <div class="flex flex-col gap-1">
        <label class="text-sm font-semibold text-gray-700">Namn</label>
        <input name="name" type="text" required class="w-full border rounded px-3 py-2" placeholder="Ditt namn" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-semibold text-gray-700">E-post</label>
        <input name="email" type="email" required class="w-full border rounded px-3 py-2" placeholder="din@epost.se" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-semibold text-gray-700">Meddelande</label>
        <textarea name="message" rows="5" required class="w-full border rounded px-3 py-2" placeholder="Vad vill du fråga eller boka?"></textarea>
      </div>
      <button type="submit" class="px-4 py-2 rounded bg-gray-800 text-white shop-cta hover:bg-gray-700">
        Skicka
      </button>
    </form>
  `;
  result = result.replace(/\[contact-form-7[^\]]*\]/gi, formHtml);

  return result;
}
