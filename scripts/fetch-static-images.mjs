/**
 * Downloads static site images (logo, background) at build time
 * so they're served from the edge instead of proxied via WordPress.
 *
 * Run: node scripts/fetch-static-images.mjs
 * Or add to your build script: node scripts/fetch-static-images.mjs && next build
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(rootDir, "public", "img");

let site;
try {
  const raw = await fs.readFile(path.join(rootDir, "site.json"), "utf8");
  site = JSON.parse(raw);
} catch {
  console.error("Could not read site.json");
  process.exit(1);
}

const baseUrl = (
  process.env.NEXT_PUBLIC_WORDPRESS_URL ||
  site.url ||
  ""
).replace(/\/$/, "");

const assets = [
  { remote: site.logo.path, local: "logo.png" },
  { remote: site.icons.favicon, local: "favicon.png" },
  { remote: site.icons.apple, local: "apple-icon.png" },
  { remote: site.backgroundImage, local: "bg.webp" },
];

await fs.mkdir(publicDir, { recursive: true });

for (const { remote, local } of assets) {
  const url = `${baseUrl}${remote}`;
  const dest = path.join(publicDir, local);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  SKIP ${local} — ${res.status} ${res.statusText}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
    const kb = (buf.length / 1024).toFixed(1);
    console.log(`  OK   ${local} (${kb} KB) ← ${url}`);
  } catch (err) {
    console.warn(`  FAIL ${local} — ${err.message}`);
  }
}

console.log(`\nDone. Static images saved to public/img/`);
console.log("Update site.json paths to use /img/ prefix for local serving.");
