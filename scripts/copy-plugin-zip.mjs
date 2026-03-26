import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const sourceZip = path.join(
  repoRoot,
  "packages",
  "ragbaz-bridge-plugin",
  "dist",
  "ragbaz-bridge.zip"
);

const destinations = [
  path.join(repoRoot, "public", "downloads", "ragbaz-bridge"),
  path.join(repoRoot, "ragbaz.xyz", "release"),
];

if (!existsSync(sourceZip)) {
  console.error(`Plugin zip not found at: ${sourceZip}`);
  process.exit(1);
}

for (const destinationDir of destinations) {
  mkdirSync(destinationDir, { recursive: true });
  const destinationZip = path.join(destinationDir, "ragbaz-bridge.zip");
  copyFileSync(sourceZip, destinationZip);
  console.log(`Copied plugin zip to ${destinationZip}`);
}
