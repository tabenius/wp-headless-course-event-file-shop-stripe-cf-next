import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleRoot = path.resolve(__dirname, "..");
const distDir = path.join(moduleRoot, "dist");
const bundleBase = path.join(distDir, "example.bundle");
const entryFile = path.join(moduleRoot, "build", "example-entry.jsx");
const jsOut = `${bundleBase}.js`;
const cssOut = `${bundleBase}.css`;
const htmlOut = path.join(distDir, "google-font-chooser-single.html");

await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [entryFile],
  outfile: jsOut,
  bundle: true,
  minify: true,
  platform: "browser",
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  loader: {
    ".css": "css",
  },
  logLevel: "info",
});

const [jsCode, cssCode] = await Promise.all([
  readFile(jsOut, "utf8"),
  readFile(cssOut, "utf8").catch(() => ""),
]);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>react-google-font-chooser-ui (single file bundle)</title>
  <style>${cssCode}</style>
</head>
<body>
  <div id="app"></div>
  <script>${jsCode}</script>
</body>
</html>
`;

await writeFile(htmlOut, html, "utf8");

await Promise.all([rm(jsOut, { force: true }), rm(cssOut, { force: true })]);

console.log(`Wrote ${htmlOut}`);
