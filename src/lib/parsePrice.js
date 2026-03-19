/**
 * Parse a WooCommerce / WordPress rendered price string into integer cents.
 *
 * Handles:
 *   "750"        → 75000
 *   "750.00"     → 75000
 *   "750,00"     → 75000   (European decimal comma)
 *   "1 234,50"   → 123450  (space thousands separator, European decimal)
 *   "1.234,56"   → 123456  (dot thousands, comma decimal)
 *   "1,234.56"   → 123456  (comma thousands, dot decimal)
 *   "kr 750"     → 75000   (currency prefix/suffix stripped)
 *   "750,00 kr"  → 75000
 */
export function parsePriceCents(str) {
  if (!str) return 0;
  // Normalise HTML entities, then extract the longest digit/separator run
  const s0 = String(str).replace(/&nbsp;/g, " ");
  const match = s0.match(/[\d\s.,]+/);
  if (!match) return 0;

  let s = match[0].trim();
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot > -1 && lastComma > -1) {
    if (lastComma > lastDot) {
      // e.g. "1.234,56" — comma is decimal separator
      s = s.replace(/[.\s]/g, "").replace(",", ".");
    } else {
      // e.g. "1,234.56" — dot is decimal separator
      s = s.replace(/[,\s]/g, "");
    }
  } else if (lastComma > -1) {
    // Only commas present
    const afterComma = s.slice(lastComma + 1).replace(/\s/g, "");
    if (afterComma.length === 2) {
      // "750,00" — comma is decimal separator
      s = s.replace(/\s/g, "").replace(",", ".");
    } else {
      // "1,234" — comma is thousands separator
      s = s.replace(/[,\s]/g, "");
    }
  } else {
    s = s.replace(/\s/g, "");
  }

  const val = parseFloat(s);
  if (!isFinite(val) || val <= 0) return 0;
  return Math.round(val * 100);
}
