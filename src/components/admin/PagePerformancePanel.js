"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

const API = "/api/admin/page-performance";

function getVals(log, key) {
  return log.map((d) => d[key]).filter((v) => v != null && !isNaN(v));
}

function stats(vals) {
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = Math.round(vals.reduce((s, v) => s + v, 0) / n);
  const mid = n % 2 === 0
    ? Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
    : sorted[Math.floor(n / 2)];
  return { min, avg: mean, median: mid, max };
}

function colorCls(ms) {
  if (ms == null) return "text-gray-400";
  if (ms < 200) return "text-emerald-600";
  if (ms < 500) return "text-yellow-600";
  return "text-red-600";
}

const METRICS = [
  { key: "ttfb", label: "TTFB" },
  { key: "domComplete", label: "DOM complete" },
  { key: "lcp", label: "LCP" },
  { key: "fcp", label: "FCP" },
];

function ms(v) {
  return v != null ? `${v} ms` : "—";
}

export default function PagePerformancePanel() {
  const [loading, setLoading] = useState(true);
  const [kvConfigured, setKvConfigured] = useState(false);
  const [log, setLog] = useState([]);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(API);
      const data = await res.json();
      setKvConfigured(data.kvConfigured ?? false);
      setLog(Array.isArray(data.log) ? data.log : []);
    } catch (e) {
      setError(`Failed to load: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClear() {
    if (!window.confirm("Clear all page performance data?")) return;
    setClearing(true);
    setError("");
    try {
      await adminFetch(API, { method: "DELETE" });
      setLog([]);
    } catch (e) {
      setError(`Failed to clear: ${e.message}`);
    } finally {
      setClearing(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-4">Loading performance data…</div>;
  }

  const metricStats = METRICS.map(({ key, label }) => ({
    label,
    key,
    s: stats(getVals(log, key)),
  }));

  const recent = log.slice(0, 50);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Page load performance</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Recorded from browser after each page load (TTFB, DOM, LCP, FCP).
            {!kvConfigured && (
              <span className="ml-1 text-orange-600">
                Requires Cloudflare KV (
                <code className="font-mono text-xs">CF_KV_NAMESPACE_ID</code>{" "}
                not configured).
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
          {log.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing}
              className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {clearing ? "Clearing…" : "Clear log"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {log.length === 0 && !error && (
        <p className="text-sm text-gray-400">
          No page performance data recorded yet. Data is collected automatically when
          GraphQL availability logging is enabled.
        </p>
      )}

      {log.length > 0 && (
        <>
          {/* Summary: min / avg / median / max per metric */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Summary — {log.length} samples
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Metric</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Min</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Avg</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Median</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {metricStats.map(({ label, s }) => (
                    <tr key={label} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700">{label}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">
                        {s ? ms(s.min) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${s ? colorCls(s.avg) : "text-gray-400"}`}>
                        {s ? ms(s.avg) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {s ? ms(s.median) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right ${s ? colorCls(s.max) : "text-gray-400"}`}>
                        {s ? ms(s.max) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent page loads */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Recent page loads
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Date &amp; time</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">URL</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">TTFB</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">DOM</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">LCP</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">FCP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent.map((d, i) => {
                    const date = new Date(d.ts);
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {date.toLocaleDateString()} {date.toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2 text-gray-700 font-mono truncate max-w-[180px]">
                          {d.url || "—"}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.ttfb)}`}>
                          {d.ttfb != null ? `${d.ttfb} ms` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.domComplete)}`}>
                          {d.domComplete != null ? `${d.domComplete} ms` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.lcp)}`}>
                          {d.lcp != null ? `${d.lcp} ms` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.fcp)}`}>
                          {d.fcp != null ? `${d.fcp} ms` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
