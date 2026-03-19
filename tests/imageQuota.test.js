import { it, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSize,
  clampCount,
  SIZE_PRESETS,
} from "../src/lib/imageQuota.js";

describe("resolveSize", () => {
  it("returns square preset by default", () => {
    assert.deepEqual(resolveSize("square"), { width: 512, height: 512 });
  });

  it("returns landscape preset", () => {
    assert.deepEqual(resolveSize("landscape"), { width: 896, height: 512 });
  });

  it("returns portrait preset", () => {
    assert.deepEqual(resolveSize("portrait"), { width: 512, height: 768 });
  });

  it("returns a6-150dpi preset", () => {
    assert.deepEqual(resolveSize("a6-150dpi"), { width: 624, height: 880 });
  });

  it("falls back to square for unknown key", () => {
    assert.deepEqual(resolveSize("unknown"), SIZE_PRESETS.square);
    assert.deepEqual(resolveSize(undefined), SIZE_PRESETS.square);
    assert.deepEqual(resolveSize(""), SIZE_PRESETS.square);
  });
});

describe("clampCount", () => {
  it("clamps to minimum 1", () => {
    assert.equal(clampCount(0), 1);
    assert.equal(clampCount(-5), 1);
  });

  it("clamps to maximum 3", () => {
    assert.equal(clampCount(4), 3);
    assert.equal(clampCount(100), 3);
  });

  it("accepts valid values 1–3", () => {
    assert.equal(clampCount(1), 1);
    assert.equal(clampCount(2), 2);
    assert.equal(clampCount(3), 3);
  });

  it("floors floats", () => {
    assert.equal(clampCount(1.9), 1);
    assert.equal(clampCount(2.5), 2);
  });

  it("handles NaN and non-numeric input by defaulting to 1", () => {
    assert.equal(clampCount(NaN), 1);
    assert.equal(clampCount("abc"), 1);
    assert.equal(clampCount(null), 1);
    assert.equal(clampCount(undefined), 1);
  });

  it("parses numeric strings", () => {
    assert.equal(clampCount("2"), 2);
    assert.equal(clampCount("3"), 3);
  });
});
