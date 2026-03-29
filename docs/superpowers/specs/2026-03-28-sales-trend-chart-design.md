# Sales Trend Chart — MA + RSI Oscillator in Payments Section

**Date:** 2026-03-28
**Status:** Approved
**Scope:** Add a compact SVG chart showing daily revenue trends with moving averages and RSI oscillator to the admin Sales tab.

---

## Context

The admin Sales tab (`AdminSalesTab.js`) shows metric cards and a payment table but has no visual trend data. The user wants a small chart showing sales trends over the last year with technical indicators (MA20, MA200, RSI).

## Changes

### 1. Sales Trend Chart Component

Create `SalesTrendChart.js` — a pure SVG chart component that receives the `payments` array prop.

**Main chart area (~120px tall):**
- Smooth polyline of daily revenue (succeeded payments aggregated by calendar day)
- MA20 overlay line (indigo-500, 1.5px)
- MA200 overlay line (gray-400, 1px dashed)
- X-axis: quarter boundaries labeled Q1, Q2, Q3, Q4
- Y-axis: implied by chart height, no explicit labels (tooltip on hover optional)
- Revenue line: indigo-600, 2px, with subtle area fill below (indigo-100/50)

**Oscillator area (~40px tall, below main chart):**
- RSI-14 line (gray-600, 1px)
- Horizontal reference lines at 75 (overbought) and 25 (oversold), dashed gray-300
- RSI fill: green-200/50 when above 50, red-200/50 when below 50
- Separated from main chart by a thin border

**Data processing (all client-side):**
- Filter payments to `status === "succeeded"` and last 365 days
- Determine dominant currency (most payments by count)
- Group by calendar day (UTC), sum amounts in cents
- Fill missing days with 0
- Compute simple moving averages: MA20 and MA200
- Compute RSI-14 using standard formula (average gain / average loss over 14 periods)

**Edge cases:**
- Fewer than 200 data points: MA200 line simply doesn't render (not enough data)
- Fewer than 20 data points: MA20 line doesn't render
- Fewer than 14 data points: RSI doesn't render, oscillator area hidden
- No succeeded payments: entire chart hidden
- Single currency only: chart shows dominant currency, label displayed

### 2. Integration in AdminSalesTab

Render `<SalesTrendChart payments={payments} />` between the metric cards section and the loading/empty/table section. Only shown when `payments.length > 0` and not in loading/error state.

## Files Changed

| File | Change |
|------|--------|
| `src/components/admin/SalesTrendChart.js` | **New** — pure SVG trend chart with MA + RSI |
| `src/components/admin/AdminSalesTab.js` | Import and render SalesTrendChart between metrics and table |
| `tests/sales-trend-chart.test.js` | **New** — unit tests for data processing helpers |

## Out of Scope

- Interactive tooltips or hover states
- Zoom/pan controls
- Multiple currency overlay
- External charting library
- Candlestick or OHLC visualization
- Configurable MA/RSI periods
