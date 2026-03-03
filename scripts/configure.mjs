#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const COLORS = {
  purple: "\x1b[1;95m",
  cyan: "\x1b[1;96m",
  green: "\x1b[1;92m",
  yellow: "\x1b[1;93m",
  red: "\x1b[1;91m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

function detectRoot(startCwd) {
  const direct = path.join(startCwd, "package.json");
  const parent = path.join(startCwd, "..", "package.json");
  return Promise.allSettled([stat(direct), stat(parent)]).then((results) => {
    if (results[0].status === "fulfilled") return startCwd;
    if (results[1].status === "fulfilled") return path.resolve(startCwd, "..");
    return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  });
}

function printHeader(rootDir) {
  output.write("\x1Bc");
  output.write(COLORS.purple);
  output.write(`██████╗  █████╗  ██████╗ ██████╗  █████╗ ███████╗\n`);
  output.write(`██╔══██╗██╔══██╗██╔════╝ ██╔══██╗██╔══██╗╚══███╔╝\n`);
  output.write(`██████╔╝███████║██║  ███╗██████╔╝███████║  ███╔╝ \n`);
  output.write(`██╔══██╗██╔══██║██║   ██║██╔══██╗██╔══██║ ███╔╝  \n`);
  output.write(`██║  ██║██║  ██║╚██████╔╝██████╔╝██║  ██║███████╗\n`);
  output.write(`╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝\n`);
  output.write(COLORS.reset);
  output.write(`${COLORS.cyan}Project root:${COLORS.reset} ${rootDir}\n\n`);
}

function runCommand(rootDir, command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readEnvMap(envFile) {
  const values = new Map();
  if (!(await fileExists(envFile))) return values;
  const raw = await readFile(envFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    values.set(key, value);
  }
  return values;
}

async function setEnvValue(envFile, key, value) {
  const lines = (await fileExists(envFile))
    ? (await readFile(envFile, "utf8")).split(/\r?\n/)
    : [];
  let updated = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      updated = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!updated) nextLines.push(`${key}=${value}`);
  await writeFile(envFile, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

async function pause(rl) {
  await rl.question("Press Enter to continue...");
}

async function setupEnv({ rl, rootDir, envFile, shopFile, shopExampleFile }) {
  output.write(`${COLORS.bold}Environment setup${COLORS.reset}\n`);

  if (!(await fileExists(envFile))) {
    const envExample = path.join(rootDir, ".env.example");
    if (await fileExists(envExample)) {
      await copyFile(envExample, envFile);
      output.write(`${COLORS.green}Created .env from .env.example${COLORS.reset}\n`);
    } else {
      await writeFile(envFile, "", "utf8");
    }
  }

  const env = await readEnvMap(envFile);
  const askValue = async (label, key, fallback) => {
    const current = env.get(key) || fallback;
    const response = await rl.question(`${label} [${current}]: `);
    const value = response.trim() || current;
    await setEnvValue(envFile, key, value);
  };

  await askValue("WordPress URL", "NEXT_PUBLIC_WORDPRESS_URL", "https://www.example.com/");
  await askValue("Admin emails (comma-separated)", "ADMIN_EMAILS", "admin@example.com");
  await askValue(
    "Admin passwords (comma-separated, same order)",
    "ADMIN_PASSWORDS",
    "change-this-password",
  );
  await askValue("AUTH_SECRET", "AUTH_SECRET", "replace-with-a-long-random-secret");
  await askValue("Digital access store backend (local/cloudflare)", "DIGITAL_ACCESS_STORE", "cloudflare");

  if (await fileExists(shopExampleFile)) {
    const seed = await rl.question("Use example shop products as seed now? (y/N): ");
    if (/^y/i.test(seed.trim())) {
      await mkdir(path.dirname(shopFile), { recursive: true });
      await copyFile(shopExampleFile, shopFile);
      output.write(`${COLORS.green}Seeded shop catalog from example.${COLORS.reset}\n`);
    }
  }

  output.write(`${COLORS.green}Updated ${envFile}${COLORS.reset}\n`);
}

async function setupThemeDefaults({ rl, rootDir }) {
  const answer = await rl.question(`${COLORS.bold}Write nice default theme.json?${COLORS.reset} (y/N): `);
  if (!/^y/i.test(answer.trim())) {
    output.write("Skipped.\n");
    return;
  }

  const theme = {
    $schema: "https://schemas.wp.org/trunk/theme.json",
    version: 3,
    settings: {
      color: {
        palette: [
          { slug: "background", name: "Background", color: "#f8f7f4" },
          { slug: "foreground", name: "Foreground", color: "#1f2937" },
          { slug: "primary", name: "Primary", color: "#0f766e" },
          { slug: "muted", name: "Muted", color: "#64748b" },
        ],
      },
      typography: {
        fontFamilies: [
          {
            slug: "body",
            name: "Body",
            fontFamily: 'var(--font-nunito), "Segoe UI", sans-serif',
          },
          {
            slug: "heading",
            name: "Heading",
            fontFamily: 'var(--font-montserrat), "Helvetica Neue", sans-serif',
          },
        ],
      },
    },
  };

  await writeFile(path.join(rootDir, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`, "utf8");
  await runCommand(rootDir, "npm", ["run", "theme:css"]);
  output.write(`${COLORS.green}theme.json written and CSS regenerated.${COLORS.reset}\n`);
}

async function checkCommand(name) {
  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "where" : "which", [name], {
      stdio: "ignore",
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function preflight({ rootDir, envFile }) {
  output.write(`${COLORS.bold}Running preflight checks...${COLORS.reset}\n`);

  let failed = false;
  for (const cmd of ["node", "npm", "git"]) {
    if (await checkCommand(cmd)) {
      output.write(`${COLORS.green}OK${COLORS.reset} ${cmd}\n`);
    } else {
      output.write(`${COLORS.red}MISSING${COLORS.reset} ${cmd}\n`);
      failed = true;
    }
  }

  if (await checkCommand("wrangler")) {
    output.write(`${COLORS.green}OK${COLORS.reset} wrangler\n`);
  } else {
    output.write(
      `${COLORS.yellow}WARN${COLORS.reset} wrangler not installed (needed for Cloudflare preview/deploy).\n`,
    );
  }

  if (await fileExists(envFile)) {
    output.write(`${COLORS.green}OK${COLORS.reset} .env found\n`);
  } else {
    output.write(`${COLORS.yellow}WARN${COLORS.reset} .env missing. Run env setup first.\n`);
  }

  if (failed) {
    output.write(`${COLORS.red}Preflight failed due to missing required tools.${COLORS.reset}\n`);
    return;
  }

  await runCommand(rootDir, "npm", ["run", "theme:css"]);
  await runCommand(rootDir, "npm", ["run", "test:theme"]);
  output.write(`${COLORS.green}Preflight complete.${COLORS.reset}\n`);
}

async function chooseDevelop({ rl, rootDir }) {
  output.write(`\n${COLORS.bold}Develop options${COLORS.reset}\n`);
  output.write("1) next dev\n");
  output.write("2) cf preview (OpenNext + wrangler dev)\n");
  output.write("3) Back\n");
  const choice = (await rl.question("Select: ")).trim();
  if (choice === "1") await runCommand(rootDir, "npm", ["run", "dev"]);
  if (choice === "2") await runCommand(rootDir, "npm", ["run", "cf:preview"]);
}

async function chooseBuild({ rl, rootDir }) {
  output.write(`\n${COLORS.bold}Build options${COLORS.reset}\n`);
  output.write("1) next build\n");
  output.write("2) cf build\n");
  output.write("3) both\n");
  output.write("4) Back\n");
  const choice = (await rl.question("Select: ")).trim();
  if (choice === "1") await runCommand(rootDir, "npm", ["run", "build"]);
  if (choice === "2") await runCommand(rootDir, "npm", ["run", "cf:build"]);
  if (choice === "3") {
    await runCommand(rootDir, "npm", ["run", "build"]);
    await runCommand(rootDir, "npm", ["run", "cf:build"]);
  }
}

async function chooseDeploy({ rl, rootDir }) {
  output.write(`\n${COLORS.bold}Deploy options${COLORS.reset}\n`);
  output.write("1) Cloudflare deploy\n");
  output.write("2) Back\n");
  const choice = (await rl.question("Select: ")).trim();
  if (choice !== "1") return;
  const confirm = await rl.question("Proceed with npm run cf:deploy? (y/N): ");
  if (/^y/i.test(confirm.trim())) {
    await runCommand(rootDir, "npm", ["run", "cf:deploy"]);
  } else {
    output.write("Deploy cancelled.\n");
  }
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCourseUri(courseUri) {
  const trimmed = String(courseUri || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

async function loadShopCatalog({ shopFile }) {
  if (!(await fileExists(shopFile))) return [];
  const raw = await readFile(shopFile, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveShopCatalog({ shopFile }, products) {
  await mkdir(path.dirname(shopFile), { recursive: true });
  await writeFile(shopFile, `${JSON.stringify(products, null, 2)}\n`, "utf8");
}

async function getBaseSiteUrl(envFile) {
  const env = await readEnvMap(envFile);
  const siteUrl = env.get("NEXT_PUBLIC_SITE_URL") || env.get("APP_BASE_URL") || "http://localhost:3000";
  return siteUrl.replace(/\/+$/, "");
}

async function listShopProducts(ctx) {
  const products = await loadShopCatalog(ctx);
  const siteBase = await getBaseSiteUrl(ctx.envFile);
  if (products.length === 0) {
    output.write(`${COLORS.yellow}No products found in catalog.${COLORS.reset}\n`);
    return;
  }

  output.write(`${COLORS.bold}Catalog products:${COLORS.reset}\n`);
  products.forEach((product, index) => {
    const slug = slugify(product.slug || product.name);
    const productUrl = `${siteBase}/shop/${slug}`;
    output.write(
      `${index + 1}. ${product.name || "(unnamed)"} | slug=${slug} | type=${product.type || "digital_file"} | price=${product.priceCents || 0} ${String(product.currency || "sek").toUpperCase()}\n`,
    );
    output.write(`   URL: ${productUrl}\n`);
    if (product.type === "course" && product.courseUri) {
      output.write(`   Course target: ${product.courseUri}\n`);
    }
  });
}

async function guidedAddShopProduct(ctx) {
  const products = await loadShopCatalog(ctx);
  const name = (await ctx.rl.question("Product name: ")).trim();
  if (!name) {
    output.write(`${COLORS.red}Name is required.${COLORS.reset}\n`);
    return;
  }

  const generatedSlug = slugify(name);
  const slugInput = (await ctx.rl.question(`Slug [${generatedSlug}]: `)).trim();
  let slug = slugify(slugInput || generatedSlug);
  if (!slug) slug = generatedSlug;

  const typeInput = (await ctx.rl.question("Type (digital_file/course) [digital_file]: ")).trim();
  const type = typeInput === "course" ? "course" : "digital_file";

  const description = (await ctx.rl.question("Description: ")).trim();
  const imageUrl = normalizeUrl(await ctx.rl.question("Image URL (optional): "));
  const priceInput = (await ctx.rl.question("Price in cents [0]: ")).trim();
  const priceCents = Number.parseInt(priceInput || "0", 10) || 0;
  const currencyInput = (await ctx.rl.question("Currency [sek]: ")).trim();
  const currency = (currencyInput || "sek").toLowerCase();
  const activeInput = (await ctx.rl.question("Active product? (Y/n): ")).trim();
  const active = !/^n/i.test(activeInput);

  let fileUrl = "";
  let courseUri = "";
  if (type === "digital_file") {
    fileUrl = normalizeUrl(await ctx.rl.question("File URL (https://...): "));
    if (!fileUrl) {
      output.write(`${COLORS.red}A valid file URL is required for digital_file products.${COLORS.reset}\n`);
      return;
    }
  } else {
    courseUri = normalizeCourseUri(await ctx.rl.question("Course URI (/courses/your-course): "));
    if (!courseUri) {
      output.write(`${COLORS.red}Course URI is required for course products.${COLORS.reset}\n`);
      return;
    }
    output.write(
      `${COLORS.cyan}Tip:${COLORS.reset} You can create multiple products for the same course URI (early bird, standard, premium).\n`,
    );
  }

  products.push({
    name,
    slug,
    type,
    description,
    imageUrl,
    priceCents,
    currency,
    fileUrl,
    courseUri,
    active,
  });
  await saveShopCatalog(ctx, products);

  const siteBase = await getBaseSiteUrl(ctx.envFile);
  output.write(`${COLORS.green}Product added.${COLORS.reset}\n`);
  output.write(`Product URL: ${siteBase}/shop/${slug}\n`);
  output.write(`Admin UI: ${siteBase}/admin\n`);
  output.write("In Admin UI you can refine image URL, file URL, or attach to a course URI.\n");
}

async function guidedEditShopProduct(ctx) {
  const products = await loadShopCatalog(ctx);
  if (products.length === 0) {
    output.write(`${COLORS.yellow}No products to edit.${COLORS.reset}\n`);
    return;
  }

  await listShopProducts(ctx);
  const indexInput = (await ctx.rl.question("Select product number to edit: ")).trim();
  const index = Number.parseInt(indexInput, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= products.length) {
    output.write(`${COLORS.red}Invalid selection.${COLORS.reset}\n`);
    return;
  }

  const current = products[index];
  const name = (await ctx.rl.question(`Name [${current.name || ""}]: `)).trim() || current.name || "";
  const suggestedSlug = slugify(name || current.slug || "");
  const slugAnswer = (await ctx.rl.question(`Slug [${current.slug || suggestedSlug}]: `)).trim();
  const slug = slugify(slugAnswer || current.slug || suggestedSlug);
  const typeAnswer = (await ctx.rl.question(`Type (digital_file/course) [${current.type || "digital_file"}]: `)).trim();
  const type = typeAnswer === "course" ? "course" : typeAnswer === "digital_file" ? "digital_file" : current.type || "digital_file";
  const description =
    (await ctx.rl.question(`Description [${current.description || ""}]: `)).trim() || current.description || "";
  const imagePrompt = await ctx.rl.question(`Image URL [${current.imageUrl || ""}]: `);
  const imageUrl = imagePrompt.trim() ? normalizeUrl(imagePrompt) : current.imageUrl || "";
  const priceInput = (await ctx.rl.question(`Price in cents [${current.priceCents || 0}]: `)).trim();
  const priceCents = priceInput ? Number.parseInt(priceInput, 10) || 0 : current.priceCents || 0;
  const currency =
    (await ctx.rl.question(`Currency [${current.currency || "sek"}]: `)).trim().toLowerCase() ||
    current.currency ||
    "sek";
  const activePrompt = (await ctx.rl.question(`Active product? (Y/n) [${current.active === false ? "n" : "y"}]: `)).trim();
  const active = activePrompt ? !/^n/i.test(activePrompt) : current.active !== false;

  let fileUrl = current.fileUrl || "";
  let courseUri = current.courseUri || "";
  if (type === "digital_file") {
    const filePrompt = await ctx.rl.question(`File URL [${current.fileUrl || ""}]: `);
    fileUrl = filePrompt.trim() ? normalizeUrl(filePrompt) : current.fileUrl || "";
    courseUri = "";
    if (!fileUrl) {
      output.write(`${COLORS.red}A valid file URL is required for digital_file products.${COLORS.reset}\n`);
      return;
    }
  } else {
    const coursePrompt = await ctx.rl.question(`Course URI [${current.courseUri || ""}]: `);
    courseUri = coursePrompt.trim() ? normalizeCourseUri(coursePrompt) : current.courseUri || "";
    fileUrl = "";
    if (!courseUri) {
      output.write(`${COLORS.red}Course URI is required for course products.${COLORS.reset}\n`);
      return;
    }
    output.write(
      `${COLORS.cyan}Tip:${COLORS.reset} Multiple products can share the same course URI for pricing tiers.\n`,
    );
  }

  products[index] = {
    name,
    slug,
    type,
    description,
    imageUrl,
    priceCents,
    currency,
    fileUrl,
    courseUri,
    active,
  };

  await saveShopCatalog(ctx, products);
  const siteBase = await getBaseSiteUrl(ctx.envFile);
  output.write(`${COLORS.green}Product updated.${COLORS.reset}\n`);
  output.write(`Product URL: ${siteBase}/shop/${slug}\n`);
  output.write(`Admin UI: ${siteBase}/admin\n`);
}

async function guidedRemoveShopProduct(ctx) {
  const products = await loadShopCatalog(ctx);
  if (products.length === 0) {
    output.write(`${COLORS.yellow}No products to remove.${COLORS.reset}\n`);
    return;
  }

  await listShopProducts(ctx);
  const indexInput = (await ctx.rl.question("Select product number to remove: ")).trim();
  const index = Number.parseInt(indexInput, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= products.length) {
    output.write(`${COLORS.red}Invalid selection.${COLORS.reset}\n`);
    return;
  }

  const target = products[index];
  const confirm = await ctx.rl.question(
    `Remove "${target.name || target.slug || "product"}"? (y/N): `,
  );
  if (!/^y/i.test(confirm.trim())) {
    output.write("Remove cancelled.\n");
    return;
  }

  products.splice(index, 1);
  await saveShopCatalog(ctx, products);
  output.write(`${COLORS.green}Product removed.${COLORS.reset}\n`);
}

async function seedShopCatalog({ shopFile, shopExampleFile }) {
  if (!(await fileExists(shopExampleFile))) {
    output.write(`${COLORS.red}Missing ${shopExampleFile}${COLORS.reset}\n`);
    return;
  }
  await mkdir(path.dirname(shopFile), { recursive: true });
  await copyFile(shopExampleFile, shopFile);
  output.write(`${COLORS.green}Shop catalog seeded from example.${COLORS.reset}\n`);
}

async function editShopCatalog({ shopFile, shopExampleFile, rootDir }) {
  await mkdir(path.dirname(shopFile), { recursive: true });
  if (!(await fileExists(shopFile)) && (await fileExists(shopExampleFile))) {
    await copyFile(shopExampleFile, shopFile);
  }

  if (process.env.EDITOR) {
    await runCommand(rootDir, process.env.EDITOR, [shopFile]);
  } else {
    output.write(`${COLORS.yellow}EDITOR is not set. Edit manually:${COLORS.reset} ${shopFile}\n`);
  }
}

async function validateShopCatalog({ shopFile }) {
  if (!(await fileExists(shopFile))) {
    output.write(`${COLORS.red}Shop catalog not found:${COLORS.reset} ${shopFile}\n`);
    return;
  }
  try {
    const raw = await readFile(shopFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      output.write(`${COLORS.red}Catalog must be a JSON array.${COLORS.reset}\n`);
      return;
    }
    output.write(`${COLORS.green}Shop catalog JSON is valid.${COLORS.reset}\n`);
  } catch (error) {
    output.write(`${COLORS.red}Invalid shop catalog JSON:${COLORS.reset} ${error.message}\n`);
  }
}

async function shopToolsMenu(ctx) {
  while (true) {
    output.write(`\n${COLORS.bold}Shop catalog tools${COLORS.reset}\n`);
    output.write("1) Seed from example\n");
    output.write("2) Guided add product\n");
    output.write("3) Guided edit product\n");
    output.write("4) Guided remove product\n");
    output.write("5) List products + generated URLs\n");
    output.write("6) Edit catalog file in $EDITOR\n");
    output.write("7) Validate catalog JSON\n");
    output.write("8) Show admin UI link and guidance\n");
    output.write("9) Back\n");

    const choice = (await ctx.rl.question("Select: ")).trim();
    if (choice === "1") await seedShopCatalog(ctx);
    else if (choice === "2") await guidedAddShopProduct(ctx);
    else if (choice === "3") await guidedEditShopProduct(ctx);
    else if (choice === "4") await guidedRemoveShopProduct(ctx);
    else if (choice === "5") await listShopProducts(ctx);
    else if (choice === "6") await editShopCatalog(ctx);
    else if (choice === "7") await validateShopCatalog(ctx);
    else if (choice === "8") {
      const siteBase = await getBaseSiteUrl(ctx.envFile);
      output.write(`${COLORS.bold}Admin UI:${COLORS.reset} ${siteBase}/admin\n`);
      output.write(
        "Use the Shop-produkter section to add image URL, file URL, or attach products to course URIs.\n",
      );
      output.write(
        "You can attach many products to the same course URI (early bird, standard, premium package).\n",
      );
    } else if (choice === "9") {
      return;
    } else {
      output.write(`${COLORS.yellow}Invalid option.${COLORS.reset}\n`);
    }
  }
}

async function fullPipeline(ctx) {
  await preflight(ctx);
  await runCommand(ctx.rootDir, "npm", ["run", "cf:build"]);
  const answer = await ctx.rl.question("Deploy after successful build? (y/N): ");
  if (/^y/i.test(answer.trim())) {
    await runCommand(ctx.rootDir, "npm", ["run", "cf:deploy"]);
  }
}

async function main() {
  const rl = readline.createInterface({ input, output });
  try {
    const rootDir = await detectRoot(process.cwd());
    const ctx = {
      rl,
      rootDir,
      envFile: path.join(rootDir, ".env"),
      shopFile: path.join(rootDir, "config", "digital-products.json"),
      shopExampleFile: path.join(rootDir, "config", "digital-products.example.json"),
    };

    while (true) {
      printHeader(rootDir);
      output.write(`${COLORS.bold}Menu${COLORS.reset}\n`);
      output.write("1) Setup environment (.env)\n");
      output.write("2) Setup theme.json defaults\n");
      output.write("3) Preflight\n");
      output.write("4) Develop\n");
      output.write("5) Build\n");
      output.write("6) Deploy\n");
      output.write("7) Shop catalog tools\n");
      output.write("8) Full pipeline (preflight + build + optional deploy)\n");
      output.write("9) Exit\n\n");

      const option = (await rl.question("Select an option: ")).trim();
      try {
        if (option === "1") await setupEnv(ctx);
        else if (option === "2") await setupThemeDefaults(ctx);
        else if (option === "3") await preflight(ctx);
        else if (option === "4") await chooseDevelop(ctx);
        else if (option === "5") await chooseBuild(ctx);
        else if (option === "6") await chooseDeploy(ctx);
        else if (option === "7") await shopToolsMenu(ctx);
        else if (option === "8") await fullPipeline(ctx);
        else if (option === "9") break;
        else output.write(`${COLORS.yellow}Invalid option.${COLORS.reset}\n`);
      } catch (error) {
        output.write(`${COLORS.red}${error.message}${COLORS.reset}\n`);
      }
      await pause(rl);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`${COLORS.red}${error.message}${COLORS.reset}`);
  process.exit(1);
});
