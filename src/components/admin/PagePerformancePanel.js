"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

const API = "/api/admin/page-performance";

function getVals(log, key) {
  return log.map((d) => d[key]).filter((v) => v != null && !isNaN(v));
}

function percentile(sortedVals, p) {
  if (!sortedVals.length) return null;
  if (sortedVals.length === 1) return sortedVals[0];
  const idx = (sortedVals.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedVals[lo];
  const weight = idx - lo;
  return sortedVals[lo] * (1 - weight) + sortedVals[hi] * weight;
}

function stats(vals) {
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const mid = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  return {
    min,
    avg: mean,
    median: mid,
    p75: percentile(sorted, 0.75),
    max,
  };
}

function colorCls(value, metric) {
  if (value == null || !metric) return "text-gray-400";
  const { good, warn } = metric;
  if (value <= good) return "text-emerald-600";
  if (value <= warn) return "text-yellow-600";
  return "text-red-600";
}

const METRICS = [
  { key: "ttfb", label: "TTFB", unit: "ms", good: 200, warn: 500, decimals: 0 },
  { key: "domComplete", label: "DOM complete", unit: "ms", good: 1500, warn: 3000, decimals: 0 },
  { key: "lcp", label: "LCP", unit: "ms", good: 2500, warn: 4000, decimals: 0 },
  { key: "fcp", label: "FCP", unit: "ms", good: 1800, warn: 3000, decimals: 0 },
  { key: "inp", label: "INP", unit: "ms", good: 200, warn: 500, decimals: 0 },
  { key: "cls", label: "CLS", unit: "", good: 0.1, warn: 0.25, decimals: 3 },
];

function formatMetricValue(value, metric) {
  if (value == null || !metric) return "—";
  if (metric.decimals > 0) {
    return Number(value).toFixed(metric.decimals);
  }
  const rounded = Math.round(Number(value));
  return metric.unit ? `${rounded} ${metric.unit}` : String(rounded);
}

function formatRelayReason(reason, status) {
  const safe = String(reason || "").trim().toLowerCase();
  if (safe === "home_connection_missing") {
    return "Relay skipped: RAGBAZ home connection missing (account/passkey not available).";
  }
  if (safe === "home_events_failed") {
    if (Number(status) === 401) {
      return "Relay rejected by RAGBAZ.xyz: unauthorized (invalid or outdated passkey).";
    }
    return "Relay failed while sending event to RAGBAZ.xyz.";
  }
  if (safe === "relay_exception") {
    return "Relay exception while posting vitals to RAGBAZ.xyz.";
  }
  if (safe) return `Relay status: ${safe}`;
  return "Relay status unavailable.";
}

function shortSession(sid) {
  if (!sid) return "—";
  return sid.slice(0, 8);
}

export default function PagePerformancePanel() {
  const [loading, setLoading] = useState(true);
  const [log, setLog] = useState([]);
  const [relayStatus, setRelayStatus] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { json: data } = await adminFetch(API);
      setLog(Array.isArray(data.log) ? data.log : []);
      setRelayStatus(data.relayStatus && typeof data.relayStatus === "object" ? data.relayStatus : null);
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
    metric: METRICS.find((m) => m.key === key),
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
            Recorded automatically from browser after each page load (TTFB, DOM, LCP, FCP, INP, CLS).
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

      <div
        className={`rounded border px-3 py-2 text-sm ${
          relayStatus?.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : relayStatus
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-gray-200 bg-gray-50 text-gray-500"
        }`}
      >
        <div className="font-semibold">RAGBAZ relay status</div>
        {!relayStatus && <div>No relay attempts recorded yet.</div>}
        {relayStatus && (
          <div className="space-y-0.5">
            <div>
              {relayStatus.ok
                ? "Last relay to RAGBAZ.xyz succeeded."
                : formatRelayReason(relayStatus.reason, relayStatus.status)}
            </div>
            <div className="text-xs">
              {relayStatus.ts
                ? `Last attempt: ${new Date(relayStatus.ts).toLocaleString()}`
                : "Last attempt time unavailable."}
              {relayStatus.status ? ` · HTTP ${relayStatus.status}` : ""}
            </div>
          </div>
        )}
      </div>

      {log.length === 0 && !error && (
        <p className="text-sm text-gray-400">
          No page performance data recorded yet. Vitals are captured automatically on every page load.
        </p>
      )}

      {log.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {metricStats.map(({ key, label, metric, s }) => (
              <div key={`kpi-${key}`} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{label} p75</div>
                <div className={`text-lg font-semibold ${colorCls(s?.p75, metric)}`}>
                  {formatMetricValue(s?.p75, metric)}
                </div>
                <div className="text-[11px] text-gray-500">
                  Good ≤ {formatMetricValue(metric.good, metric)} · Warn ≤ {formatMetricValue(metric.warn, metric)}
                </div>
              </div>
            ))}
          </div>

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
                    <th className="px-3 py-2 text-right font-medium text-gray-500">p75</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {metricStats.map(({ key, label, metric, s }) => (
                    <tr key={label} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700">{label}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">
                        {s ? formatMetricValue(s.min, metric) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${s ? colorCls(s.avg, metric) : "text-gray-400"}`}>
                        {s ? formatMetricValue(s.avg, metric) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {s ? formatMetricValue(s.median, metric) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${s ? colorCls(s.p75, metric) : "text-gray-400"}`}>
                        {s ? formatMetricValue(s.p75, metric) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right ${s ? colorCls(s.max, metric) : "text-gray-400"}`}>
                        {s ? formatMetricValue(s.max, metric) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Session breadcrumb drill-down */}
          {selectedSession && (() => {
            const sessionLog = log
              .filter((d) => d.sessionId === selectedSession)
              .sort((a, b) => a.ts - b.ts);
            return (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">
                    Session {shortSession(selectedSession)}
                    {sessionLog.find((d) => d.userEmail) && (
                      <span className="ml-2 font-normal text-indigo-600">
                        {sessionLog.find((d) => d.userEmail).userEmail}
                      </span>
                    )}
                    {" — "}{sessionLog.length} page{sessionLog.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedSession(null)}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    Close
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {sessionLog.map((d, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-indigo-400">&rarr;</span>}
                      <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 rounded px-2 py-0.5">
                        <span className="font-mono text-indigo-900">{d.url || "/"}</span>
                        <span className="text-gray-400">
                          {new Date(d.ts).toLocaleTimeString()}
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
                {sessionLog[0]?.referrer && (
                  <div className="text-xs text-indigo-600 mt-1.5">
                    Entry referrer: <span className="font-mono">{sessionLog[0].referrer}</span>
                  </div>
                )}
              </div>
            );
          })()}

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
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Session</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">URL</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">TTFB</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">DOM</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">LCP</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">FCP</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">INP</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">CLS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent.map((d, i) => {
                    const date = new Date(d.ts);
                    return (
                      <tr key={i} className={`hover:bg-gray-50 ${selectedSession && d.sessionId === selectedSession ? "bg-indigo-50" : ""}`}>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {date.toLocaleDateString()} {date.toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2">
                          {d.sessionId ? (
                            <button
                              type="button"
                              onClick={() => setSelectedSession(d.sessionId === selectedSession ? null : d.sessionId)}
                              className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline"
                              title={d.sessionId}
                            >
                              {shortSession(d.sessionId)}
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700 font-mono truncate max-w-[180px]">
                          {d.url || "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {d.navigationType || "navigate"}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.ttfb, METRICS[0])}`}>
                          {formatMetricValue(d.ttfb, METRICS[0])}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.domComplete, METRICS[1])}`}>
                          {formatMetricValue(d.domComplete, METRICS[1])}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.lcp, METRICS[2])}`}>
                          {formatMetricValue(d.lcp, METRICS[2])}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.fcp, METRICS[3])}`}>
                          {formatMetricValue(d.fcp, METRICS[3])}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.inp, METRICS[4])}`}>
                          {formatMetricValue(d.inp, METRICS[4])}
                        </td>
                        <td className={`px-3 py-2 text-right ${colorCls(d.cls, METRICS[5])}`}>
                          {formatMetricValue(d.cls, METRICS[5])}
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
