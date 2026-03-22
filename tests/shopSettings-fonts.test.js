import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeFontRole,
  normalizeTypographyPalette,
  normalizeLinkStyle,
} from "../src/lib/shopSettings.js";

describe("normalizeFontRole", () => {
  it("accepts a valid preset role", () => {
    const input = { type: "preset", stack: "system-ui, sans-serif" };
    const result = normalizeFontRole(input, {
      type: "preset",
      stack: "system-ui",
    });
    assert.equal(result.type, "preset");
    assert.equal(result.stack, "system-ui, sans-serif");
  });

  it("accepts a google role", () => {
    const input = {
      type: "google",
      family: "Inter",
      isVariable: true,
      weightRange: [100, 900],
    };
    const result = normalizeFontRole(input, {
      type: "preset",
      stack: "system-ui",
    });
    assert.equal(result.type, "google");
    assert.equal(result.family, "Inter");
  });

  it("accepts inherit type", () => {
    const result = normalizeFontRole(
      { type: "inherit" },
      { type: "preset", stack: "system-ui" },
    );
    assert.equal(result.type, "inherit");
  });

  it("coerces old string fontHeading to preset object", () => {
    const result = normalizeFontRole(
      "var(--font-montserrat), 'Helvetica Neue', sans-serif",
      { type: "preset", stack: "system-ui" },
    );
    assert.equal(result.type, "preset");
    assert.ok(result.stack.includes("montserrat"));
  });

  it("returns fallback for invalid input", () => {
    const fallback = { type: "preset", stack: "system-ui" };
    const result = normalizeFontRole(null, fallback);
    assert.deepEqual(result, fallback);
  });

  it("strips unknown fields from google role", () => {
    const result = normalizeFontRole(
      {
        type: "google",
        family: "Inter",
        isVariable: true,
        weightRange: [100, 900],
        colorSlot: 1,
        evil: "hack",
      },
      { type: "preset", stack: "system-ui" },
    );
    assert.equal(result.evil, undefined);
    assert.equal(result.colorSlot, 1);
  });
});

describe("normalizeTypographyPalette", () => {
  it("returns default when absent", () => {
    assert.deepEqual(normalizeTypographyPalette(undefined), ["#111111"]);
  });
  it("accepts valid one-entry palette", () => {
    assert.deepEqual(normalizeTypographyPalette(["#0a0a0a"]), ["#0a0a0a"]);
  });
  it("accepts two-entry palette", () => {
    assert.deepEqual(normalizeTypographyPalette(["#0a0a0a", "#1c3d5a"]), [
      "#0a0a0a",
      "#1c3d5a",
    ]);
  });
  it("rejects non-hex entries", () => {
    assert.deepEqual(normalizeTypographyPalette(["notacolor"]), ["#111111"]);
  });
  it("caps at two entries", () => {
    const result = normalizeTypographyPalette(["#111", "#222", "#333"]);
    assert.equal(result.length, 2);
  });
});

describe("normalizeLinkStyle", () => {
  it("returns defaults when absent", () => {
    const result = normalizeLinkStyle(undefined);
    assert.equal(result.hoverVariant, "underline");
    assert.equal(result.underlineDefault, "hover");
  });
  it("accepts valid values", () => {
    const result = normalizeLinkStyle({
      hoverVariant: "highlight",
      underlineDefault: "always",
    });
    assert.equal(result.hoverVariant, "highlight");
  });
  it("rejects unknown hoverVariant", () => {
    const result = normalizeLinkStyle({ hoverVariant: "evil" });
    assert.equal(result.hoverVariant, "underline");
  });
});
