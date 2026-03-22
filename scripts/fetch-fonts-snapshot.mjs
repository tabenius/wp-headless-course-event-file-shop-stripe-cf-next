// Run once: node scripts/fetch-fonts-snapshot.mjs
// Requires GOOGLE_FONTS_API_KEY env var. Writes to src/lib/googleFontsSnapshot.json.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const key = process.env.GOOGLE_FONTS_API_KEY;
if (!key) {
  console.error("Set GOOGLE_FONTS_API_KEY first.");
  process.exit(1);
}

const res = await fetch(
  `https://www.googleapis.com/webfonts/v1/webfonts?key=${key}&sort=popularity`,
);
if (!res.ok) throw new Error(`Failed: ${res.status}`);
const { items } = await res.json();

const fonts = items.map(({ family, category, axes, variants }) => ({
  family,
  category,
  axes: axes || [],
  variants: variants || [],
}));

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/googleFontsSnapshot.json",
);
writeFileSync(outPath, JSON.stringify({ fonts }, null, 2));
console.log(`Wrote ${fonts.length} fonts to googleFontsSnapshot.json`);
