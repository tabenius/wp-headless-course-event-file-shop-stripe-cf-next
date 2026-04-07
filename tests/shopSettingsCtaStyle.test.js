import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCtaStyle } from "../src/lib/shopSettings.js";

describe("normalizeCtaStyle", () => {
  it("returns upstream for null", () => {
    assert.deepEqual(normalizeCtaStyle(null), { type: "upstream" });
  });

  it("returns upstream for undefined", () => {
    assert.deepEqual(normalizeCtaStyle(undefined), { type: "upstream" });
  });

  it("returns upstream for explicit upstream type", () => {
    assert.deepEqual(normalizeCtaStyle({ type: "upstream" }), {
      type: "upstream",
    });
  });

  it("returns upstream for missing bgColor", () => {
    assert.deepEqual(normalizeCtaStyle({ textColor: "background" }), {
      type: "upstream",
    });
  });

  it("returns upstream for invalid bgColor", () => {
    assert.deepEqual(normalizeCtaStyle({ bgColor: "hotpink" }), {
      type: "upstream",
    });
  });

  it("normalizes a minimal valid ctaStyle", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      borderRadius: "md",
      border: "none",
      shadow: "none",
      fontWeight: "semibold",
      textTransform: "none",
      paddingSize: "md",
    });
    assert.deepEqual(result, {
      bgColor: "primary",
      textColor: "background",
      borderRadius: "md",
      border: "none",
      shadow: "none",
      fontWeight: "semibold",
      textTransform: "none",
      paddingSize: "md",
    });
  });

  it("clamps invalid textColor to background", () => {
    const result = normalizeCtaStyle({ bgColor: "primary", textColor: "neon" });
    assert.equal(result.textColor, "background");
  });

  it("clamps invalid borderRadius to md", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      borderRadius: "xxl",
    });
    assert.equal(result.borderRadius, "md");
  });

  it("includes bgCustom only when bgColor is custom", () => {
    const result = normalizeCtaStyle({
      bgColor: "custom",
      bgCustom: "#ff0000",
      textColor: "background",
    });
    assert.equal(result.bgCustom, "#ff0000");
    const noCustom = normalizeCtaStyle({
      bgColor: "primary",
      bgCustom: "#ff0000",
      textColor: "background",
    });
    assert.equal(noCustom.bgCustom, undefined);
  });

  it("includes borderColor when border is solid, defaults to primary", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      border: "solid",
    });
    assert.equal(result.borderColor, "primary");
  });

  it("does not include borderColor when border is none", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      border: "none",
      borderColor: "secondary",
    });
    assert.equal(result.borderColor, undefined);
  });

  it("includes textCustom only when textColor is custom", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "custom",
      textCustom: "#123456",
    });
    assert.equal(result.textCustom, "#123456");
    const noCustom = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
    });
    assert.equal(noCustom.textCustom, undefined);
  });

  it("includes borderCustom only when borderColor is custom", () => {
    const result = normalizeCtaStyle({
      bgColor: "primary",
      textColor: "background",
      border: "solid",
      borderColor: "custom",
      borderCustom: "#abcdef",
    });
    assert.equal(result.borderColor, "custom");
    assert.equal(result.borderCustom, "#abcdef");
  });

  it("produces identical JSON.stringify for same logical input", () => {
    const a = normalizeCtaStyle({
      bgColor: "secondary",
      textColor: "foreground",
      border: "solid",
      borderColor: "secondary",
    });
    const b = normalizeCtaStyle({
      bgColor: "secondary",
      textColor: "foreground",
      border: "solid",
      borderColor: "secondary",
    });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});
