import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

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

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    plugins: {
      "custom-rules": { rules: { "no-t-three-args": noTThreeArgs } },
    },
    rules: {
      "react-hooks/error-boundaries": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "custom-rules/no-t-three-args": "error",
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
