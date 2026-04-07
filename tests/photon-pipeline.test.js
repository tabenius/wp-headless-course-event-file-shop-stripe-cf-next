import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOutputFormat,
  parsePresetCrop,
  guardSourceSize,
  clampSaturation,
  isAvifSource,
  computeTiltShiftBlendFactor,
} from "../src/lib/photonPipeline.js";

describe("resolveOutputFormat", () => {
  it("returns webp when no cropCircle operation", () => {
    const ops = [
      { type: "source" },
      { type: "resize", params: { width: 800, height: 600 } },
    ];
    assert.equal(resolveOutputFormat(ops), "webp");
  });

  it("returns png when cropCircle is present", () => {
    const ops = [
      { type: "source" },
      { type: "cropCircle", params: { diameter: 200 } },
    ];
    assert.equal(resolveOutputFormat(ops), "png");
  });

  it("returns webp for empty operations", () => {
    assert.equal(resolveOutputFormat([]), "webp");
  });

  it("returns webp when caller requests it explicitly", () => {
    assert.equal(resolveOutputFormat([], "webp"), "webp");
  });

  it("still returns png for cropCircle even if webp requested", () => {
    assert.equal(resolveOutputFormat([{ type: "cropCircle" }], "webp"), "png");
  });

  it("returns avif when caller requests it explicitly", () => {
    assert.equal(resolveOutputFormat([], "avif"), "avif");
  });

  it("falls back to webp when override is unknown", () => {
    assert.equal(resolveOutputFormat([], "heif"), "webp");
  });

  it("accepts explicit jpeg override", () => {
    assert.equal(resolveOutputFormat([], "jpeg"), "jpeg");
  });
});

describe("parsePresetCrop", () => {
  it("parses 1:1 from a landscape source and centers the crop", () => {
    const result = parsePresetCrop("1:1", 1.0, 1000, 500);
    assert.equal(result.x2 - result.x1, 500);
    assert.equal(result.y2 - result.y1, 500);
    assert.equal(result.x1, 250);
    assert.equal(result.y1, 0);
  });

  it("applies scale to output dimensions", () => {
    const result = parsePresetCrop("1:1", 0.5, 1000, 1000);
    assert.equal(result.x2 - result.x1, 500);
    assert.equal(result.y2 - result.y1, 500);
  });

  it("parses 16:9 from a portrait source", () => {
    const result = parsePresetCrop("16:9", 1.0, 900, 1600);
    assert.equal(result.x2 - result.x1, 900);
    assert.ok(result.y2 - result.y1 <= 1600);
  });

  it("returns null for invalid preset string", () => {
    assert.equal(parsePresetCrop("notaratio", 1.0, 800, 600), null);
  });

  it("returns null for missing preset", () => {
    assert.equal(parsePresetCrop("", 1.0, 800, 600), null);
  });
});

describe("guardSourceSize", () => {
  it("does not throw when bytes are within limit", () => {
    assert.doesNotThrow(() => guardSourceSize(1024, 20 * 1024 * 1024));
  });

  it("throws when bytes exceed limit", () => {
    assert.throws(
      () => guardSourceSize(25 * 1024 * 1024, 20 * 1024 * 1024),
      /too large/i,
    );
  });

  it("does not throw at exactly the limit", () => {
    const limit = 20 * 1024 * 1024;
    assert.doesNotThrow(() => guardSourceSize(limit, limit));
  });
});

describe("clampSaturation", () => {
  it("returns saturate_hsl for positive amount", () => {
    assert.deepEqual(clampSaturation(0.5), { fn: "saturate_hsl", amount: 0.5 });
  });

  it("returns desaturate_hsl with positive amount for negative input", () => {
    assert.deepEqual(clampSaturation(-0.3), {
      fn: "desaturate_hsl",
      amount: 0.3,
    });
  });

  it("clamps amount above 1 to 1", () => {
    assert.deepEqual(clampSaturation(2.5), { fn: "saturate_hsl", amount: 1 });
  });

  it("clamps amount below -1 to desaturate with 1", () => {
    assert.deepEqual(clampSaturation(-3), { fn: "desaturate_hsl", amount: 1 });
  });

  it("returns saturate for zero", () => {
    assert.deepEqual(clampSaturation(0), { fn: "saturate_hsl", amount: 0 });
  });
});

describe("isAvifSource", () => {
  it("returns true for image/avif content type", () => {
    assert.equal(isAvifSource("image/avif"), true);
  });

  it("returns true for image/avif with charset suffix", () => {
    assert.equal(isAvifSource("image/avif; charset=utf-8"), true);
  });

  it("returns false for image/jpeg", () => {
    assert.equal(isAvifSource("image/jpeg"), false);
  });

  it("returns false for image/webp", () => {
    assert.equal(isAvifSource("image/webp"), false);
  });

  it("returns false for empty string", () => {
    assert.equal(isAvifSource(""), false);
  });

  it("returns false for null/undefined", () => {
    assert.equal(isAvifSource(null), false);
    assert.equal(isAvifSource(undefined), false);
  });
});

describe("computeTiltShiftBlendFactor", () => {
  it("returns zero inside the focus radius", () => {
    assert.equal(computeTiltShiftBlendFactor(0.2, 0.3, 0.25, 0.8), 0);
  });

  it("returns full intensity beyond focus+variance", () => {
    assert.equal(computeTiltShiftBlendFactor(1.0, 0.2, 0.3, 0.75), 0.75);
  });

  it("returns a smooth intermediate blend in the transition band", () => {
    const blend = computeTiltShiftBlendFactor(0.35, 0.2, 0.3, 1.0);
    assert.ok(blend > 0);
    assert.ok(blend < 1);
  });

  it("clamps invalid inputs safely", () => {
    assert.equal(computeTiltShiftBlendFactor(-10, -1, 0, -1), 0);
    const blend = computeTiltShiftBlendFactor(10, 0.2, 0.001, 2);
    assert.equal(blend, 1);
  });
});
