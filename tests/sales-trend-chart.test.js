import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateDailyRevenue,
  computeSMA,
  computeRSI,
  dominantCurrency,
} from "../src/components/admin/salesTrendHelpers.js";

describe("dominantCurrency", () => {
  it("returns the most common currency", () => {
    const payments = [
      { currency: "sek", status: "succeeded" },
      { currency: "sek", status: "succeeded" },
      { currency: "usd", status: "succeeded" },
    ];
    assert.equal(dominantCurrency(payments), "SEK");
  });

  it("returns null for empty array", () => {
    assert.equal(dominantCurrency([]), null);
  });

  it("ignores non-succeeded payments", () => {
    const payments = [
      { currency: "usd", status: "failed" },
      { currency: "usd", status: "failed" },
      { currency: "sek", status: "succeeded" },
    ];
    assert.equal(dominantCurrency(payments), "SEK");
  });
});

describe("aggregateDailyRevenue", () => {
  it("groups payments by day and sums amounts", () => {
    const base = new Date("2025-06-15T12:00:00Z").getTime();
    const payments = [
      { created: base, amount: 1000, currency: "sek", status: "succeeded" },
      {
        created: base + 3600000,
        amount: 500,
        currency: "sek",
        status: "succeeded",
      },
      {
        created: base + 86400000,
        amount: 2000,
        currency: "sek",
        status: "succeeded",
      },
    ];
    const result = aggregateDailyRevenue(payments, "SEK", 365);
    const nonZero = result.filter((d) => d.amount > 0);
    assert.equal(nonZero.length, 2);
    assert.equal(nonZero[0].amount, 1500);
    assert.equal(nonZero[1].amount, 2000);
  });

  it("fills missing days with zero", () => {
    const base = new Date("2025-06-15T12:00:00Z").getTime();
    const payments = [
      { created: base, amount: 1000, currency: "sek", status: "succeeded" },
      {
        created: base + 86400000 * 3,
        amount: 2000,
        currency: "sek",
        status: "succeeded",
      },
    ];
    const result = aggregateDailyRevenue(payments, "SEK", 365);
    assert.ok(result.length >= 4);
  });

  it("filters by currency", () => {
    const base = new Date("2025-06-15T12:00:00Z").getTime();
    const payments = [
      { created: base, amount: 1000, currency: "sek", status: "succeeded" },
      { created: base, amount: 5000, currency: "usd", status: "succeeded" },
    ];
    const result = aggregateDailyRevenue(payments, "SEK", 365);
    const nonZero = result.filter((d) => d.amount > 0);
    assert.equal(nonZero.length, 1);
    assert.equal(nonZero[0].amount, 1000);
  });
});

describe("computeSMA", () => {
  it("computes simple moving average", () => {
    const values = [1, 2, 3, 4, 5];
    const sma = computeSMA(values, 3);
    assert.equal(sma.length, 5);
    assert.equal(sma[0], null);
    assert.equal(sma[1], null);
    assert.equal(sma[2], 2); // (1+2+3)/3
    assert.equal(sma[3], 3); // (2+3+4)/3
    assert.equal(sma[4], 4); // (3+4+5)/3
  });

  it("returns all nulls if period > length", () => {
    const sma = computeSMA([1, 2], 5);
    assert.deepEqual(sma, [null, null]);
  });

  it("handles single-element period", () => {
    const sma = computeSMA([10, 20, 30], 1);
    assert.deepEqual(sma, [10, 20, 30]);
  });
});

describe("computeRSI", () => {
  it("returns values between 0 and 100", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 20);
    const rsi = computeRSI(values, 14);
    const valid = rsi.filter((v) => v !== null);
    assert.ok(valid.length > 0);
    for (const v of valid) {
      assert.ok(v >= 0 && v <= 100, `RSI ${v} out of range`);
    }
  });

  it("returns all nulls if not enough data", () => {
    const rsi = computeRSI([1, 2, 3], 14);
    assert.deepEqual(rsi, [null, null, null]);
  });

  it("returns 100 for monotonically increasing values", () => {
    const values = Array.from({ length: 20 }, (_, i) => i * 10);
    const rsi = computeRSI(values, 14);
    const valid = rsi.filter((v) => v !== null);
    for (const v of valid) {
      assert.equal(v, 100);
    }
  });

  it("returns 0 for monotonically decreasing values", () => {
    const values = Array.from({ length: 20 }, (_, i) => 200 - i * 10);
    const rsi = computeRSI(values, 14);
    const valid = rsi.filter((v) => v !== null);
    for (const v of valid) {
      assert.equal(v, 0);
    }
  });

  it("first valid RSI is at index equal to period", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 20);
    const rsi = computeRSI(values, 14);
    for (let i = 0; i < 14; i++) {
      assert.equal(rsi[i], null);
    }
    assert.notEqual(rsi[14], null);
  });
});
