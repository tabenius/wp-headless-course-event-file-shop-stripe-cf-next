# Sales Trend Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact SVG sales trend chart with MA20, MA200, and RSI-14 oscillator to the admin Sales tab.

**Architecture:** Pure client-side SVG component consuming the existing `payments` prop. Data processing helpers are exported for testability. No external dependencies.

**Tech Stack:** React, SVG, `node:test`

---

## File Structure

| File | Role |
|------|------|
| `src/components/admin/SalesTrendChart.js` | **New** — SVG chart component with data processing helpers |
| `src/components/admin/AdminSalesTab.js` | Render SalesTrendChart between metrics and table |
| `tests/sales-trend-chart.test.js` | **New** — unit tests for data helpers |

---

### Task 1: Data Processing Helpers + Tests

**Files:**
- Create: `src/components/admin/SalesTrendChart.js` (helpers only first)
- Create: `tests/sales-trend-chart.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/sales-trend-chart.test.js`:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateDailyRevenue,
  computeSMA,
  computeRSI,
  dominantCurrency,
} from "../src/components/admin/SalesTrendChart.js";

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
});

describe("aggregateDailyRevenue", () => {
  it("groups payments by day and sums amounts", () => {
    const base = new Date("2025-06-15T12:00:00Z").getTime();
    const payments = [
      { created: base, amount: 1000, currency: "sek", status: "succeeded" },
      { created: base + 3600000, amount: 500, currency: "sek", status: "succeeded" },
      { created: base + 86400000, amount: 2000, currency: "sek", status: "succeeded" },
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
      { created: base + 86400000 * 3, amount: 2000, currency: "sek", status: "succeeded" },
    ];
    const result = aggregateDailyRevenue(payments, "SEK", 365);
    assert.ok(result.length >= 4);
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
});
```

- [ ] **Step 2: Create the helpers module**

Create `src/components/admin/SalesTrendChart.js` with exported helper functions:

```javascript
export function dominantCurrency(payments) { ... }
export function aggregateDailyRevenue(payments, currency, days) { ... }
export function computeSMA(values, period) { ... }
export function computeRSI(values, period) { ... }
```

- [ ] **Step 3: Run tests**

Run: `node --test tests/sales-trend-chart.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/SalesTrendChart.js tests/sales-trend-chart.test.js
git commit -m "feat(admin): add sales trend chart data helpers with tests"
```

---

### Task 2: SVG Chart Rendering

**Files:**
- Modify: `src/components/admin/SalesTrendChart.js`

- [ ] **Step 1: Add the SVG rendering**

Add the default export `SalesTrendChart` component that:
- Calls `dominantCurrency` to pick currency
- Calls `aggregateDailyRevenue` to get daily series
- Computes MA20, MA200, RSI-14
- Renders SVG with main chart area + oscillator area
- Quarter markers on x-axis

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/SalesTrendChart.js
git commit -m "feat(admin): add SVG sales trend chart with MA20/MA200 and RSI oscillator"
```

---

### Task 3: Integrate into AdminSalesTab

**Files:**
- Modify: `src/components/admin/AdminSalesTab.js`

- [ ] **Step 1: Import and render**

Add import and render `<SalesTrendChart payments={payments} />` after the metric cards section, before the loading/empty/table section.

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AdminSalesTab.js
git commit -m "feat(admin): integrate sales trend chart into Sales tab"
```
