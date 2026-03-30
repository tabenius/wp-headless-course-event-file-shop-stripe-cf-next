import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeFilePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function getStaticString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (
    node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked || node.quasis[0].value.raw || "";
  }
  return null;
}

function getPropertyName(property) {
  if (!property || property.type !== "Property") return null;
  if (!property.computed && property.key?.type === "Identifier") {
    return property.key.name;
  }
  return getStaticString(property.key);
}

function getObjectProperty(objectNode, propertyName) {
  if (!objectNode || objectNode.type !== "ObjectExpression") return null;
  return (
    objectNode.properties.find((property) => getPropertyName(property) === propertyName) ||
    null
  );
}

function hasNoStoreOption(objectNode, propertyName) {
  const property = getObjectProperty(objectNode, propertyName);
  if (!property) return false;
  return getStaticString(property.value) === "no-store";
}

function hasNoStoreAllowComment(sourceCode, node) {
  const allComments = sourceCode.getAllComments();
  if (allComments.some((comment) => comment.value.includes("lint-allow-render-no-store"))) {
    return true;
  }
  return sourceCode
    .getCommentsBefore(node)
    .some((comment) => comment.value.includes("lint-allow-render-no-store"));
}

function isRenderEntryFile(filename) {
  const normalized = normalizeFilePath(filename);
  if (!normalized.includes("/src/app/")) return false;
  if (normalized.includes("/src/app/api/")) return false;
  return /\/src\/app\/(?!api\/)(?:.+\/)?(page|layout|template|default|error|not-found)\.[cm]?[jt]sx?$/.test(
    normalized,
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function flattenLocaleMap(value, prefix = "", out = new Map()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    out.set(prefix, value);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenLocaleMap(child, next, out);
    } else {
      out.set(next, child);
    }
  }
  return out;
}

function extractPlaceholders(text) {
  if (typeof text !== "string") return [];
  const matches = [...text.matchAll(/\{(\w+)\}/g)];
  return [...new Set(matches.map((match) => match[1]))].sort();
}

/** @type {import("eslint").Rule.RuleModule} */
const noTThreeArgs = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow calling t() with 3 arguments — t(key, params) accepts only 2. " +
        "A 3-arg call silently drops the interpolation object.",
    },
    messages: {
      tooManyArgs:
        "t() accepts at most 2 arguments (key, params). " +
        "The third argument is silently ignored — merge fallback and interpolation into one params object.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "t" &&
          node.arguments.length > 2
        ) {
          context.report({ node, messageId: "tooManyArgs" });
        }
      },
    };
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const i18nLocaleParity = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure EN/SV/ES locale files share the same keys and placeholder names.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const filename = normalizeFilePath(context.filename);
        if (!filename.endsWith("/src/lib/i18n/index.js")) return;

        let locales = null;
        try {
          locales = {
            en: readJson(path.resolve(__dirname, "src/lib/i18n/en.json")),
            sv: readJson(path.resolve(__dirname, "src/lib/i18n/sv.json")),
            es: readJson(path.resolve(__dirname, "src/lib/i18n/es.json")),
          };
        } catch (error) {
          context.report({
            node,
            message: `i18n parity check failed to load locale files: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
          return;
        }

        const flat = {
          en: flattenLocaleMap(locales.en),
          sv: flattenLocaleMap(locales.sv),
          es: flattenLocaleMap(locales.es),
        };

        const baseKeys = new Set(flat.en.keys());
        for (const locale of ["sv", "es"]) {
          const localeKeys = new Set(flat[locale].keys());
          const missing = [...baseKeys].filter((key) => !localeKeys.has(key));
          const extra = [...localeKeys].filter((key) => !baseKeys.has(key));
          if (missing.length > 0) {
            context.report({
              node,
              message: `i18n ${locale}.json is missing ${missing.length} key(s): ${missing
                .slice(0, 8)
                .join(", ")}${missing.length > 8 ? " …" : ""}`,
            });
          }
          if (extra.length > 0) {
            context.report({
              node,
              message: `i18n ${locale}.json has ${extra.length} extra key(s): ${extra
                .slice(0, 8)
                .join(", ")}${extra.length > 8 ? " …" : ""}`,
            });
          }
        }

        const placeholderMismatches = [];
        for (const key of baseKeys) {
          const enValue = flat.en.get(key);
          const svValue = flat.sv.get(key);
          const esValue = flat.es.get(key);
          if (
            typeof enValue !== "string" ||
            typeof svValue !== "string" ||
            typeof esValue !== "string"
          ) {
            continue;
          }
          const enPlaceholders = extractPlaceholders(enValue).join(",");
          const svPlaceholders = extractPlaceholders(svValue).join(",");
          const esPlaceholders = extractPlaceholders(esValue).join(",");
          if (
            enPlaceholders !== svPlaceholders ||
            enPlaceholders !== esPlaceholders
          ) {
            placeholderMismatches.push(
              `${key} (en:[${enPlaceholders}] sv:[${svPlaceholders}] es:[${esPlaceholders}])`,
            );
          }
        }
        if (placeholderMismatches.length > 0) {
          context.report({
            node,
            message:
              `i18n placeholder mismatch in ${placeholderMismatches.length} key(s): ` +
              `${placeholderMismatches.slice(0, 4).join("; ")}` +
              (placeholderMismatches.length > 4 ? " …" : ""),
          });
        }
      },
    };
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const noRenderNoStore = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow no-store fetch/KV options in render-entry files unless explicitly allowlisted.",
    },
    schema: [],
  },
  create(context) {
    const filename = normalizeFilePath(context.filename);
    const inRenderEntry = isRenderEntryFile(filename);
    const sourceCode = context.sourceCode;

    if (!inRenderEntry) return {};

    function report(node, apiName) {
      if (hasNoStoreAllowComment(sourceCode, node)) return;
      context.report({
        node,
        message:
          `Avoid no-store in render-entry files (${apiName}) because it can force static->dynamic flips. ` +
          `Use force-cache/revalidate or add explicit allow comment 'lint-allow-render-no-store' when intentional.`,
      });
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "fetch" &&
          node.arguments.length > 1 &&
          node.arguments[1]?.type === "ObjectExpression" &&
          hasNoStoreOption(node.arguments[1], "cache")
        ) {
          report(node, "fetch");
          return;
        }
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "readCloudflareKvJsonWithOptions" &&
          node.arguments.length > 1 &&
          node.arguments[1]?.type === "ObjectExpression" &&
          hasNoStoreOption(node.arguments[1], "cacheMode")
        ) {
          report(node, "readCloudflareKvJsonWithOptions");
        }
      },
    };
  },
};

function resolveRuntimeValue(programNode) {
  for (const statement of programNode.body || []) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const declaration = statement.declaration;
    if (!declaration || declaration.type !== "VariableDeclaration") continue;
    for (const variable of declaration.declarations || []) {
      if (variable.id?.type !== "Identifier" || variable.id.name !== "runtime") continue;
      return getStaticString(variable.init);
    }
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const noNodeImportsInEdgeContext = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow node:* imports in edge contexts; require runtime=nodejs for API routes that need node builtins.",
    },
    schema: [],
  },
  create(context) {
    const filename = normalizeFilePath(context.filename);
    const isApiRoute = /\/src\/app\/api\/.+\/route\.[cm]?[jt]sx?$/.test(filename);
    let runtime = null;

    function enforceEdgeContext() {
      if (runtime === "nodejs") return false;
      if (runtime === "edge") return true;
      return isApiRoute;
    }

    function report(node, specifier) {
      if (!enforceEdgeContext()) return;
      context.report({
        node,
        message:
          `Node builtin import '${specifier}' is not allowed in edge context. ` +
          `Set 'export const runtime = \"nodejs\"' for this route or remove node builtin usage.`,
      });
    }

    return {
      Program(node) {
        runtime = resolveRuntimeValue(node);
      },
      ImportDeclaration(node) {
        const specifier = getStaticString(node.source);
        if (specifier?.startsWith("node:")) {
          report(node, specifier);
        }
      },
      ImportExpression(node) {
        const specifier = getStaticString(node.source);
        if (specifier?.startsWith("node:")) {
          report(node, specifier);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length > 0
        ) {
          const specifier = getStaticString(node.arguments[0]);
          if (specifier?.startsWith("node:")) {
            report(node, specifier);
          }
        }
      },
    };
  },
};

const customRules = {
  "no-t-three-args": noTThreeArgs,
  "i18n-locale-parity": i18nLocaleParity,
  "no-render-no-store": noRenderNoStore,
  "no-node-imports-in-edge-context": noNodeImportsInEdgeContext,
};

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    plugins: {
      "custom-rules": { rules: customRules },
    },
    rules: {
      "react-hooks/error-boundaries": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "custom-rules/no-t-three-args": "error",
      "custom-rules/no-render-no-store": "error",
      "custom-rules/no-node-imports-in-edge-context": "error",
      "no-use-before-define": [
        "error",
        {
          functions: false,
          classes: true,
          variables: true,
          allowNamedExports: false,
        },
      ],
    },
  },
  {
    files: ["src/lib/i18n/index.js"],
    rules: {
      "custom-rules/i18n-locale-parity": "error",
    },
  },
  {
    ignores: [
      ".*/**",
      "node_modules/**",
      "**/.next/**",
      ".next/**",
      "src/.next/**",
      ".open-next/**",
      "out/**",
      "build/**",
    ],
  },
];

export default eslintConfig;
