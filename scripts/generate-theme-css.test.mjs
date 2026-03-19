import test from "node:test";
import assert from "node:assert/strict";

import { buildCss, validateTheme } from "./generate-theme-css.mjs";

test("validateTheme accepts required slugs and returns normalized items", () => {
  const theme = {
    settings: {
      color: {
        palette: [
          { slug: "background", color: "#fff" },
          { slug: "foreground", color: "#111" },
          { slug: "primary", color: "#0f766e" },
        ],
      },
      typography: {
        fontFamilies: [
          { slug: "body", fontFamily: "Nunito, sans-serif" },
          { slug: "heading", fontFamily: "Montserrat, sans-serif" },
        ],
      },
    },
  };

  const items = validateTheme(theme);
  assert.equal(items.colors.length, 3);
  assert.equal(items.fonts.length, 2);
});

test("validateTheme throws when required slugs are missing", () => {
  const theme = {
    settings: {
      color: {
        palette: [{ slug: "primary", color: "#0f766e" }],
      },
      typography: {
        fontFamilies: [{ slug: "body", fontFamily: "Nunito, sans-serif" }],
      },
    },
  };

  assert.throws(
    () => validateTheme(theme),
    /Required color slug "background" is missing/,
  );
});

test("buildCss emits CSS variables and utility classes", () => {
  const css = buildCss({
    colors: [
      { slug: "background", value: "#fff" },
      { slug: "foreground", value: "#111" },
    ],
    fonts: [
      { slug: "body", value: "Nunito, sans-serif" },
      { slug: "heading", value: "Montserrat, sans-serif" },
    ],
  });

  assert.match(css, /--color-background: #fff;/);
  assert.match(css, /--font-heading: Montserrat, sans-serif;/);
  assert.match(css, /\.has-foreground-color/);
  assert.match(css, /\.font-body/);
});
