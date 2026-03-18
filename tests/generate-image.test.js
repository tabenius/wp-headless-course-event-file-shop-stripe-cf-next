import assert from "node:assert/strict";
import test from "node:test";
import {
  arrayBufferToBase64,
  resolveSize,
  clampCount,
  computeResetsAt,
  SIZE_PRESETS,
} from "../src/lib/imageQuota.js";

// arrayBufferToBase64
test("arrayBufferToBase64 produces correct data URL prefix", () => {
  const buf = new Uint8Array([137, 80, 78, 71]).buffer;
  assert.ok(arrayBufferToBase64(buf).startsWith("data:image/png;base64,"));
});

test("arrayBufferToBase64 round-trips through atob correctly", () => {
  const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
  const dataUrl = arrayBufferToBase64(original.buffer);
  const b64 = dataUrl.replace("data:image/png;base64,", "");
  const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  assert.deepEqual(Array.from(decoded), Array.from(original));
});

test("arrayBufferToBase64 handles empty buffer", () => {
  assert.equal(arrayBufferToBase64(new ArrayBuffer(0)), "data:image/png;base64,");
});

// resolveSize
test("resolveSize returns square dimensions", () => {
  assert.deepEqual(resolveSize("square"), { width: 512, height: 512 });
});
test("resolveSize returns landscape dimensions", () => {
  assert.deepEqual(resolveSize("landscape"), { width: 896, height: 512 });
});
test("resolveSize returns portrait dimensions", () => {
  assert.deepEqual(resolveSize("portrait"), { width: 512, height: 768 });
});
test("resolveSize returns a6-150dpi dimensions", () => {
  assert.deepEqual(resolveSize("a6-150dpi"), { width: 624, height: 880 });
});
test("resolveSize falls back to square for unknown key", () => {
  assert.deepEqual(resolveSize("unknown"), SIZE_PRESETS.square);
});
test("resolveSize falls back to square for undefined", () => {
  assert.deepEqual(resolveSize(undefined), SIZE_PRESETS.square);
});

// clampCount
test("clampCount clamps 0 to 1", () => assert.equal(clampCount(0), 1));
test("clampCount passes 2", () => assert.equal(clampCount(2), 2));
test("clampCount passes 3", () => assert.equal(clampCount(3), 3));
test("clampCount clamps 4 to 3", () => assert.equal(clampCount(4), 3));
test("clampCount handles string '2'", () => assert.equal(clampCount("2"), 2));
test("clampCount handles NaN → 1", () => assert.equal(clampCount("abc"), 1));
test("clampCount floors 2.9 to 2", () => assert.equal(clampCount(2.9), 2));

// computeResetsAt
test("computeResetsAt returns ISO string at UTC midnight", () => {
  const result = computeResetsAt();
  assert.ok(result.endsWith("T00:00:00.000Z"), `Expected midnight UTC, got ${result}`);
  assert.ok(new Date(result) > new Date(), "Expected future timestamp");
});
