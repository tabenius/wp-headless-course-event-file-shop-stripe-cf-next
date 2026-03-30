import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCssSnippet,
  buildVariationSettings,
  collectInitialAxisValues,
  getSimilarFonts,
  normalizeAxisValue,
} from "../src/utils.js";

test("normalizeAxisValue clamps and rounds to step", () => {
  const axis = { min: -12, max: 0, default: 0, step: 0.5 };
  assert.equal(normalizeAxisValue(-99, axis), -12);
  assert.equal(normalizeAxisValue(99, axis), 0);
  assert.equal(normalizeAxisValue(-3.26, axis), -3.5);
});

test("collectInitialAxisValues builds deterministic axis object", () => {
  const axes = [
    { tag: "wght", min: 100, max: 900, default: 400, step: 1 },
    { tag: "opsz", min: 8, max: 72, default: 14, step: 1 },
  ];
  const current = { wght: 777, random: 1 };
  const next = collectInitialAxisValues(axes, current);
  assert.deepEqual(next, { wght: 777, opsz: 14 });
});

test("buildVariationSettings preserves axis order from source", () => {
  const axes = [
    { tag: "opsz", min: 8, max: 72, default: 14, step: 1 },
    { tag: "wght", min: 100, max: 900, default: 400, step: 1 },
  ];
  const settings = buildVariationSettings({ wght: 600, opsz: 20 }, axes);
  assert.equal(settings, "'opsz' 20, 'wght' 600");
});

test("getSimilarFonts prefers category and token overlap", () => {
  const selected = { family: "Roboto Flex", category: "sans-serif" };
  const fonts = [
    selected,
    { family: "Roboto", category: "sans-serif" },
    { family: "Playfair Display", category: "serif" },
    { family: "Flex Mono", category: "monospace" },
  ];
  const similar = getSimilarFonts(selected, fonts, 2);
  assert.equal(similar.length, 2);
  assert.equal(similar[0].family, "Roboto");
});

test("buildCssSnippet returns stable snippet", () => {
  const css = buildCssSnippet({
    family: "Inter",
    fontSize: 48,
    variationSettings: "'wght' 500, 'opsz' 14",
  });
  assert.match(css, /font-family: 'Inter', system-ui, sans-serif;/);
  assert.match(css, /font-size: 48px;/);
  assert.match(css, /font-variation-settings: 'wght' 500, 'opsz' 14;/);
});
