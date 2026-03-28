import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldSkipPipeline,
  buildVariantDefs,
  buildVariantFilename,
} from "../src/lib/uploadPipeline.js";

describe("shouldSkipPipeline", () => {
  it("skips non-image MIME types", () => {
    assert.equal(shouldSkipPipeline("application/pdf", 800, 600), true);
  });

  it("skips GIF images", () => {
    assert.equal(shouldSkipPipeline("image/gif", 800, 600), true);
  });

  it("does not skip JPEG", () => {
    assert.equal(shouldSkipPipeline("image/jpeg", 800, 600), false);
  });

  it("does not skip PNG", () => {
    assert.equal(shouldSkipPipeline("image/png", 800, 600), false);
  });

  it("skips images smaller than 320px in width", () => {
    assert.equal(shouldSkipPipeline("image/jpeg", 200, 600), true);
  });

  it("skips images smaller than 320px in height", () => {
    assert.equal(shouldSkipPipeline("image/jpeg", 800, 200), true);
  });

  it("does not skip WebP (still generates responsive sizes)", () => {
    assert.equal(shouldSkipPipeline("image/webp", 800, 600), false);
  });

  it("does not skip AVIF (still generates responsive sizes)", () => {
    assert.equal(shouldSkipPipeline("image/avif", 800, 600), false);
  });
});

describe("buildVariantDefs", () => {
  it("generates compressed + 3 responsive variants for JPEG", () => {
    const defs = buildVariantDefs("image/jpeg", 1000, 800);
    const kinds = defs.map((d) => d.variantKind);
    assert.deepEqual(kinds, [
      "compressed",
      "responsive-sm",
      "responsive-md",
      "responsive-lg",
    ]);
  });

  it("skips compressed variant for already-WebP source", () => {
    const defs = buildVariantDefs("image/webp", 1000, 800);
    const kinds = defs.map((d) => d.variantKind);
    assert.ok(!kinds.includes("compressed"), "should not include compressed for WebP");
    assert.ok(kinds.includes("responsive-sm"));
    assert.ok(kinds.includes("responsive-md"));
    assert.ok(kinds.includes("responsive-lg"));
  });

  it("skips compressed variant for already-AVIF source", () => {
    const defs = buildVariantDefs("image/avif", 1000, 800);
    const kinds = defs.map((d) => d.variantKind);
    assert.ok(!kinds.includes("compressed"), "should not include compressed for AVIF");
  });

  it("responsive-sm is 50% width, md is 100%, lg is 150%", () => {
    const defs = buildVariantDefs("image/jpeg", 1000, 800);
    const sm = defs.find((d) => d.variantKind === "responsive-sm");
    const md = defs.find((d) => d.variantKind === "responsive-md");
    const lg = defs.find((d) => d.variantKind === "responsive-lg");
    assert.equal(sm.width, 500);
    assert.equal(sm.height, 400);
    assert.equal(md.width, 1000);
    assert.equal(md.height, 800);
    assert.equal(lg.width, 1500);
    assert.equal(lg.height, 1200);
  });
});

describe("buildVariantFilename", () => {
  it("compressed variant replaces extension with .webp", () => {
    assert.equal(
      buildVariantFilename("uploads/1711612800000-photo.jpg", "compressed"),
      "uploads/1711612800000-photo.webp",
    );
  });

  it("responsive-sm adds -sm suffix", () => {
    assert.equal(
      buildVariantFilename("uploads/1711612800000-photo.jpg", "responsive-sm"),
      "uploads/1711612800000-photo-sm.webp",
    );
  });

  it("responsive-md adds -md suffix", () => {
    assert.equal(
      buildVariantFilename("uploads/1711612800000-photo.jpg", "responsive-md"),
      "uploads/1711612800000-photo-md.webp",
    );
  });

  it("responsive-lg adds -lg suffix", () => {
    assert.equal(
      buildVariantFilename("uploads/1711612800000-photo.jpg", "responsive-lg"),
      "uploads/1711612800000-photo-lg.webp",
    );
  });

  it("handles URLs with paths", () => {
    assert.equal(
      buildVariantFilename("https://cdn.example.com/uploads/photo.png", "responsive-sm"),
      "https://cdn.example.com/uploads/photo-sm.webp",
    );
  });
});
