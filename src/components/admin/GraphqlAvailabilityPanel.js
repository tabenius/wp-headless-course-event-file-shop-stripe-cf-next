"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

const API = "/api/admin/graphql-availability";

function computeStats(log) {
  if (!log.length) return { total: 0, ok: 0, fail: 0, pct: null };
  const ok = log.filter((d) => d.ok).length;
  const fail = log.length - ok;
  const pct = Math.round((ok / log.length) * 100);
  return { total: log.length, ok, fail, pct };
}

function pctColor(pct) {
  if (pct === null) return "text-gray-400";
  if (pct >= 99) return "text-emerald-600";
  if (pct >= 95) return "text-yellow-600";
  return "text-red-600";
}

function dotColor(d) {
  if (!d.ok) {
    if (d.status === 429 || d.status === 503) return "bg-orange-400";
    return "bg-red-500";
  }
  return "bg-emerald-500";
}

function dotTitle(d) {
  const dt = new Date(d.ts).toLocaleString();
  const lat = d.latencyMs != null ? ` · ${d.latencyMs} ms` : "";
  return `${dt}  HTTP ${d.status}${lat}`;
}

/** Groups log entries into N buckets and picks the worst status per bucket. */
function bucketize(log, buckets = 120) {
  if (!log.length) return [];
  const sorted = [...log].sort((a, b) => a.ts - b.ts);
  const oldest = sorted[0].ts;
  const newest = sorted[sorted.length - 1].ts;
  const span = Math.max(newest - oldest, 1);
  const result = Array.from({ length: buckets }, () => null);
  for (const d of sorted) {
    const idx = Math.min(
      Math.floor(((d.ts - oldest) / span) * buckets),
      buckets - 1,
    );
    const cur = result[idx];
    // worst status wins: fail beats ok, rate-limit beats generic fail
    if (!cur) {
      result[idx] = d;
    } else if (cur.ok && !d.ok) {
      result[idx] = d;
    } else if (!cur.ok && !d.ok && (d.status === 429 || d.status === 503)) {
      result[idx] = d;
    }
  }
  return result;
}

export default function GraphqlAvailabilityPanel() {
  const [loading, setLoading] = useState(true);
  const [kvConfigured, setKvConfigured] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [log, setLog] = useState([]);
  const [toggling, setToggling] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(API);
      const data = await res.json();
      setKvConfigured(data.kvConfigured ?? false);
      setEnabled(data.settings?.enabled ?? false);
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

  async function handleToggle() {
    setToggling(true);
    setError("");
    try {
      await adminFetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabled((v) => !v);
    } catch (e) {
      setError(`Failed to update setting: ${e.message}`);
    } finally {
      setToggling(false);
    }
  }

  async function handleClear() {
    if (!window.confirm("Clear all availability log data?")) return;
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

  const stats = computeStats(log);
  const dots = bucketize(log, 120);

  if (loading) {
    return (
      <div className="text-sm text-gray-400 py-4">Loading availability data…</div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">
            GraphQL availability logging
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Records a datapoint on every GraphQL request.
            {!kvConfigured && (
              <span className="ml-1 text-orange-600">
                Requires Cloudflare KV (
                <code className="font-mono text-xs">CF_KV_NAMESPACE_ID</code>{" "}
                not configured).
              </span>
            )}
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-sm text-gray-600">
            {enabled ? "Enabled" : "Disabled"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={toggling || !kvConfigured}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-40 ${
              enabled ? "bg-purple-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Summary stats */}
      {log.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Availability",
              value:
                stats.pct !== null ? `${stats.pct}%` : "—",
              cls: pctColor(stats.pct),
            },
            { label: "Total requests", value: stats.total, cls: "text-gray-800" },
            { label: "Successful", value: stats.ok, cls: "text-emerald-700" },
            { label: "Failed", value: stats.fail, cls: stats.fail ? "text-red-600" : "text-gray-400" },
          ].map(({ label, value, cls }) => (
            <div
              key={label}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center"
            >
              <div className={`text-xl font-bold ${cls}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timeseries dots */}
      {log.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Timeseries (oldest → newest)
            </span>
            <span className="text-xs text-gray-400">{log.length} datapoints</span>
          </div>
          <div
            className="flex flex-wrap gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-3"
            aria-label="GraphQL request timeseries"
          >
            {dots.map((d, i) =>
              d ? (
                <span
                  key={i}
                  title={dotTitle(d)}
                  className={`inline-block w-2.5 h-2.5 rounded-sm ${dotColor(d)} cursor-default`}
                />
              ) : (
                <span
                  key={i}
                  className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-200"
                />
              ),
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              Success
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-400" />
              Rate-limited (429/503)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500" />
              Error
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-200" />
              No data
            </span>
          </div>
        </div>
      )}

      {/* Recent request log */}
      {log.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Recent requests
          </h4>
          <div className="rounded-lg border border-gray-200 overflow-hidden text-xs font-mono">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Date / Time</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">
                    Latency
                  </th>
                  <th className="px-3 py-2 font-medium hidden lg:table-cell">
                    Endpoint
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {log.slice(0, 50).map((entry, i) => {
                  const d = new Date(entry.ts);
                  const dateStr = d.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  });
                  const timeStr = d.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  const isRateLimit =
                    entry.status === 429 || entry.status === 503;
                  return (
                    <tr
                      key={i}
                      className={
                        !entry.ok
                          ? isRateLimit
                            ? "bg-orange-50"
                            : "bg-red-50"
                          : ""
                      }
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">
                        {dateStr}{" "}
                        <span className="text-gray-500">{timeStr}</span>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span
                          className={
                            isRateLimit
                              ? "text-orange-600 font-semibold"
                              : entry.ok
                                ? "text-emerald-700"
                                : "text-red-600 font-semibold"
                          }
                        >
                          {String(entry.status)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 hidden sm:table-cell">
                        {entry.latencyMs != null ? `${entry.latencyMs} ms` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-gray-400 truncate max-w-xs hidden lg:table-cell">
                        {entry.endpoint}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {log.length === 0 && enabled && (
        <p className="text-sm text-gray-500 py-4 text-center">
          No data yet. Availability datapoints will appear here as requests are
          made to the WordPress GraphQL endpoint.
        </p>
      )}

      {log.length === 0 && !enabled && kvConfigured && (
        <p className="text-sm text-gray-400 py-4 text-center">
          Enable logging above to start recording GraphQL availability data.
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
        {log.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="px-3 py-1.5 text-sm rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {clearing ? "Clearing…" : "Clear log"}
          </button>
        )}
      </div>
    </div>
  );
}
