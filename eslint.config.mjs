import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    rules: {
      "react-hooks/error-boundaries": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
    },
  },
  {
    ignores: [
      ".*/**",
      "node_modules/**",
      ".next/**",
      ".open-next/**",
      "out/**",
      "build/**",
    ],
  },
];

export default eslintConfig;
