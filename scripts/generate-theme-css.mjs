import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = process.cwd();
const themeJsonPath = path.join(rootDir, "theme.json");
const outCssPath = path.join(rootDir, "src", "app", "theme.generated.css");

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getThemeItems(theme) {
  const palette = theme?.settings?.color?.palette ?? [];
  const fontFamilies = theme?.settings?.typography?.fontFamilies ?? [];

  return {
    colors: palette
      .map((item) => ({
        slug: toSlug(item?.slug || item?.name),
        value: String(item?.color || "").trim(),
      }))
      .filter((item) => item.slug && item.value),
    fonts: fontFamilies
      .map((item) => ({
        slug: toSlug(item?.slug || item?.name),
        value: String(item?.fontFamily || "").trim(),
      }))
      .filter((item) => item.slug && item.value),
  };
}

export function buildCss({ colors, fonts }) {
  const lines = [];

  lines.push("/* Auto-generated from theme.json. Do not edit manually. */");
  lines.push(":root {");

  for (const color of colors) {
    lines.push(`  --color-${color.slug}: ${color.value};`);
  }

  for (const font of fonts) {
    lines.push(`  --font-${font.slug}: ${font.value};`);
  }

  const background = colors.find((item) => item.slug === "background");
  const foreground = colors.find((item) => item.slug === "foreground");

  if (background)
    lines.push(`  --background: var(--color-${background.slug});`);
  if (foreground)
    lines.push(`  --foreground: var(--color-${foreground.slug});`);

  lines.push("}");
  lines.push("");

  for (const color of colors) {
    lines.push(
      `.has-${color.slug}-color { color: var(--color-${color.slug}); }`,
    );
    lines.push(
      `.has-${color.slug}-background-color { background-color: var(--color-${color.slug}); }`,
    );
  }

  if (colors.length > 0) lines.push("");

  for (const font of fonts) {
    lines.push(`.font-${font.slug} { font-family: var(--font-${font.slug}); }`);
  }

  lines.push("");
  return `${lines.join("\n")}`;
}

function hasDuplicateSlugs(items) {
  const set = new Set();
  for (const item of items) {
    if (set.has(item.slug)) return true;
    set.add(item.slug);
  }
  return false;
}

export function validateTheme(theme) {
  if (!theme || typeof theme !== "object") {
    throw new Error("theme.json must contain a JSON object.");
  }

  const palette = theme?.settings?.color?.palette;
  const fontFamilies = theme?.settings?.typography?.fontFamilies;
  if (!Array.isArray(palette) || palette.length === 0) {
    throw new Error(
      "theme.json requires settings.color.palette with at least one color.",
    );
  }
  if (!Array.isArray(fontFamilies) || fontFamilies.length === 0) {
    throw new Error(
      "theme.json requires settings.typography.fontFamilies with at least one font.",
    );
  }

  const { colors, fonts } = getThemeItems(theme);
  if (colors.length === 0) {
    throw new Error("No valid color entries found in settings.color.palette.");
  }
  if (fonts.length === 0) {
    throw new Error(
      "No valid font entries found in settings.typography.fontFamilies.",
    );
  }

  if (hasDuplicateSlugs(colors)) {
    throw new Error("Duplicate color slugs found in theme.json.");
  }
  if (hasDuplicateSlugs(fonts)) {
    throw new Error("Duplicate font slugs found in theme.json.");
  }

  const colorSlugs = new Set(colors.map((item) => item.slug));
  const fontSlugs = new Set(fonts.map((item) => item.slug));
  for (const requiredColor of ["background", "foreground"]) {
    if (!colorSlugs.has(requiredColor)) {
      throw new Error(`Required color slug "${requiredColor}" is missing.`);
    }
  }
  for (const requiredFont of ["body", "heading"]) {
    if (!fontSlugs.has(requiredFont)) {
      throw new Error(`Required font slug "${requiredFont}" is missing.`);
    }
  }

  return { colors, fonts };
}

export async function generateThemeCss() {
  const themeText = await fs.readFile(themeJsonPath, "utf8");
  const theme = JSON.parse(themeText);
  const css = buildCss(validateTheme(theme));

  await fs.mkdir(path.dirname(outCssPath), { recursive: true });
  await fs.writeFile(outCssPath, css, "utf8");
  process.stdout.write(`Generated ${path.relative(rootDir, outCssPath)}\n`);
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  generateThemeCss().catch((error) => {
    process.stderr.write(`Failed to generate theme CSS: ${error.message}\n`);
    process.exit(1);
  });
}
