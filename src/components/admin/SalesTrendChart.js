"use client";

import { useMemo } from "react";
import { t } from "@/lib/i18n";
import {
  dominantCurrency,
  aggregateDailyRevenue,
  computeSMA,
  computeRSI,
} from "./salesTrendHelpers";

// ─── SVG helpers ─────────────────────────────────────────────────────────────

const CHART_WIDTH = 600;
const MAIN_HEIGHT = 120;
const OSC_HEIGHT = 40;
const GAP = 8;
const PAD = { left: 0, right: 0, top: 4, bottom: 14 };

function scaleX(index, total) {
  return (
    PAD.left +
    (index / Math.max(total - 1, 1)) * (CHART_WIDTH - PAD.left - PAD.right)
  );
}

function scaleY(value, min, max, height, top) {
  const range = max - min || 1;
  return top + height - ((value - min) / range) * height;
}

function polyline(points) {
  return points
    .filter(([, y]) => y !== null)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

function quarterMarkers(dailyData) {
  const markers = [];
  const seen = new Set();
  for (let i = 0; i < dailyData.length; i++) {
    const d = new Date(dailyData[i].date);
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    const year = d.getUTCFullYear();
    const key = `${year}-Q${q}`;
    if (!seen.has(key) && d.getUTCDate() <= 7) {
      seen.add(key);
      markers.push({ index: i, label: `Q${q}` });
    }
  }
  // If we didn't catch quarters via first-week heuristic, use month boundaries
  if (markers.length === 0) {
    for (let i = 0; i < dailyData.length; i++) {
      const d = new Date(dailyData[i].date);
      const m = d.getUTCMonth();
      if (m % 3 === 0 && d.getUTCDate() === 1) {
        const q = Math.floor(m / 3) + 1;
        markers.push({ index: i, label: `Q${q}` });
      }
    }
  }
  return markers;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SalesTrendChart({ payments }) {
  const data = useMemo(() => {
    if (!Array.isArray(payments) || payments.length === 0) return null;

    const currency = dominantCurrency(payments);
    if (!currency) return null;

    const daily = aggregateDailyRevenue(payments, currency, 365);
    if (daily.length < 2) return null;

    const amounts = daily.map((d) => d.amount);
    const ma20 = computeSMA(amounts, 20);
    const ma200 = computeSMA(amounts, 200);
    const rsi = computeRSI(amounts, 14);
    const hasRSI = rsi.some((v) => v !== null);
    const quarters = quarterMarkers(daily);

    return { daily, amounts, ma20, ma200, rsi, hasRSI, currency, quarters };
  }, [payments]);

  if (!data) return null;

  const { daily, amounts, ma20, ma200, rsi, hasRSI, currency, quarters } = data;
  const n = daily.length;

  // Main chart scales
  const maxAmt = Math.max(...amounts, 1);
  const minAmt = 0;

  const totalHeight =
    MAIN_HEIGHT + (hasRSI ? GAP + OSC_HEIGHT : 0) + PAD.top + PAD.bottom;

  // Build polyline paths
  const revPoints = amounts.map((v, i) => [
    scaleX(i, n),
    scaleY(v, minAmt, maxAmt, MAIN_HEIGHT, PAD.top),
  ]);
  const revPath = polyline(revPoints);
  const areaPath =
    revPath +
    ` L${scaleX(n - 1, n).toFixed(1)},${(PAD.top + MAIN_HEIGHT).toFixed(1)}` +
    ` L${scaleX(0, n).toFixed(1)},${(PAD.top + MAIN_HEIGHT).toFixed(1)} Z`;

  const ma20Points = ma20.map((v, i) => [
    scaleX(i, n),
    v !== null ? scaleY(v, minAmt, maxAmt, MAIN_HEIGHT, PAD.top) : null,
  ]);
  const ma20Path = polyline(ma20Points);

  const ma200Points = ma200.map((v, i) => [
    scaleX(i, n),
    v !== null ? scaleY(v, minAmt, maxAmt, MAIN_HEIGHT, PAD.top) : null,
  ]);
  const ma200Path = polyline(ma200Points);

  // RSI oscillator
  const oscTop = PAD.top + MAIN_HEIGHT + GAP;
  const rsiPoints = hasRSI
    ? rsi.map((v, i) => [
        scaleX(i, n),
        v !== null ? scaleY(v, 0, 100, OSC_HEIGHT, oscTop) : null,
      ])
    : [];
  const rsiPath = polyline(rsiPoints);

  // RSI area fills (above/below 50)
  const rsiAbove50 = [];
  const rsiBelow50 = [];
  if (hasRSI) {
    const mid = scaleY(50, 0, 100, OSC_HEIGHT, oscTop);
    for (let i = 0; i < rsi.length; i++) {
      if (rsi[i] === null) continue;
      const x = scaleX(i, n);
      const y = scaleY(rsi[i], 0, 100, OSC_HEIGHT, oscTop);
      if (rsi[i] >= 50) rsiAbove50.push([x, y, mid]);
      else rsiBelow50.push([x, y, mid]);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          {t("admin.salesTrend", "Sales Trend")}
        </h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-slate-500 rounded" />{" "}
            MA20
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-gray-400 rounded border-dashed" />{" "}
            MA200
          </span>
          <span className="font-mono">{currency}</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${totalHeight}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={t("admin.salesTrendChartLabel", "Sales trend chart")}
      >
        {/* Main chart area fill */}
        <path d={areaPath} fill="rgb(224 231 255 / 0.5)" />

        {/* Revenue line */}
        <path
          d={revPath}
          fill="none"
          stroke="#4f46e5"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* MA20 */}
        {ma20Path && (
          <path
            d={ma20Path}
            fill="none"
            stroke="#6366f1"
            strokeWidth="1.5"
            strokeLinejoin="round"
            opacity="0.7"
          />
        )}

        {/* MA200 */}
        {ma200Path && (
          <path
            d={ma200Path}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1"
            strokeDasharray="4 3"
            strokeLinejoin="round"
            opacity="0.6"
          />
        )}

        {/* Quarter markers */}
        {quarters.map(({ index, label }) => {
          const x = scaleX(index, n);
          return (
            <g key={`q-${index}`}>
              <line
                x1={x}
                y1={PAD.top}
                x2={x}
                y2={PAD.top + MAIN_HEIGHT}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <text
                x={x}
                y={PAD.top + MAIN_HEIGHT + 11}
                textAnchor="middle"
                className="text-[9px] fill-gray-400"
                style={{ fontSize: 9 }}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Separator */}
        {hasRSI && (
          <line
            x1={0}
            y1={oscTop - GAP / 2}
            x2={CHART_WIDTH}
            y2={oscTop - GAP / 2}
            stroke="#e5e7eb"
            strokeWidth="0.5"
          />
        )}

        {/* RSI oscillator */}
        {hasRSI && (
          <>
            {/* Reference lines */}
            <line
              x1={0}
              y1={scaleY(75, 0, 100, OSC_HEIGHT, oscTop)}
              x2={CHART_WIDTH}
              y2={scaleY(75, 0, 100, OSC_HEIGHT, oscTop)}
              stroke="#d1d5db"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
            <line
              x1={0}
              y1={scaleY(25, 0, 100, OSC_HEIGHT, oscTop)}
              x2={CHART_WIDTH}
              y2={scaleY(25, 0, 100, OSC_HEIGHT, oscTop)}
              stroke="#d1d5db"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
            <line
              x1={0}
              y1={scaleY(50, 0, 100, OSC_HEIGHT, oscTop)}
              x2={CHART_WIDTH}
              y2={scaleY(50, 0, 100, OSC_HEIGHT, oscTop)}
              stroke="#e5e7eb"
              strokeWidth="0.5"
            />

            {/* RSI line */}
            <path
              d={rsiPath}
              fill="none"
              stroke="#6b7280"
              strokeWidth="1"
              strokeLinejoin="round"
            />

            {/* Labels */}
            <text
              x={CHART_WIDTH - 2}
              y={scaleY(75, 0, 100, OSC_HEIGHT, oscTop) - 2}
              textAnchor="end"
              className="fill-gray-300"
              style={{ fontSize: 7 }}
            >
              75
            </text>
            <text
              x={CHART_WIDTH - 2}
              y={scaleY(25, 0, 100, OSC_HEIGHT, oscTop) + 8}
              textAnchor="end"
              className="fill-gray-300"
              style={{ fontSize: 7 }}
            >
              25
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
