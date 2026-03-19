import assert from "node:assert/strict";
import test from "node:test";
import {
  maxOf,
  barHeight,
  formatHour,
} from "../src/components/admin/StatsChart.helpers.js";

test("maxOf returns the highest numeric value", () => {
  const data = [{ r: 5 }, { r: 3 }, { r: 8 }];
  assert.equal(maxOf(data, "r"), 8);
});

test("maxOf returns 1 for an empty array", () => {
  assert.equal(maxOf([], "r"), 1);
});

test("barHeight converts value/max to percent", () => {
  assert.equal(barHeight(50, 100), 50);
  assert.equal(barHeight(0, 100), 0);
  assert.equal(barHeight(5, 5), 100);
});

test("formatHour produces HH:00 strings", () => {
  // Timestamps are UTC — getUTCHours() keeps the labels aligned with Cloudflare data.
  assert.equal(formatHour("2026-03-19T14:30:00Z"), "14:00");
  assert.equal(formatHour("2026-03-19T00:00:00Z"), "0:00");
});
