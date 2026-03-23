"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

const API = "/api/admin/page-performance";

function avg(arr, key) {
  const vals = arr.map((d) => d[key]).filter((v) => v != null && !isNaN(v));
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

function latencyLabel(ms) {
  if (ms == null) return "—";
  if (ms < 200) return { text: `${ms} ms`, cls: "text-emerald-600" };
  if (ms < 500) return { text: `${ms} ms`, cls: "text-yellow-600" };
  return { text: `${ms} ms`, cls: "text-red-600" };
}

function StatCard({ label, value, cls }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center">
      <div className={`text-xl font-bold ${cls || "text-gray-800"}`}>{value ?? "—"}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
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

  const avgTtfb = avg(log, "ttfb");
  const avgDomComplete = avg(log, "domComplete");
  const avgLcp = avg(log, "lcp");
  const avgFcp = avg(log, "fcp");

  const ttfbLbl = latencyLabel(avgTtfb);
  const domLbl = latencyLabel(avgDomComplete);
  const lcpLbl = latencyLabel(avgLcp);
  const fcpLbl = latencyLabel(avgFcp);

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Avg TTFB"
              value={typeof ttfbLbl === "object" ? ttfbLbl.text : ttfbLbl}
              cls={typeof ttfbLbl === "object" ? ttfbLbl.cls : undefined}
            />
            <StatCard
              label="Avg DOM complete"
              value={typeof domLbl === "object" ? domLbl.text : domLbl}
              cls={typeof domLbl === "object" ? domLbl.cls : undefined}
            />
            <StatCard
              label="Avg LCP"
              value={typeof lcpLbl === "object" ? lcpLbl.text : lcpLbl}
              cls={typeof lcpLbl === "object" ? lcpLbl.cls : undefined}
            />
            <StatCard
              label="Avg FCP"
              value={typeof fcpLbl === "object" ? fcpLbl.text : fcpLbl}
              cls={typeof fcpLbl === "object" ? fcpLbl.cls : undefined}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Recent page loads
              </span>
              <span className="text-xs text-gray-400">{log.length} recorded</span>
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
                    const dateStr = date.toLocaleDateString();
                    const timeStr = date.toLocaleTimeString();
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {dateStr} {timeStr}
                        </td>
                        <td className="px-3 py-2 text-gray-700 font-mono truncate max-w-[180px]">
                          {d.url || "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {d.ttfb != null ? `${d.ttfb} ms` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {d.domComplete != null ? `${d.domComplete} ms` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {d.lcp != null ? `${d.lcp} ms` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
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
