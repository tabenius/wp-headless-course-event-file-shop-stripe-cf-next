"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

const API = "/api/admin/graphql-availability";
const GRAPHQL_KEYWORDS = new Set([
  "query",
  "mutation",
  "subscription",
  "fragment",
  "on",
  "true",
  "false",
  "null",
]);

function formatFailureKind(kind) {
  const safe = String(kind || "").trim().toLowerCase();
  if (safe === "graphql-syntax") return "GraphQL syntax error";
  if (safe === "graphql-validation") return "GraphQL validation error";
  if (safe === "graphql-auth") return "GraphQL auth error";
  if (safe === "rate-limited") return "Rate limited";
  if (safe === "timeout") return "Timeout";
  if (safe === "network-error") return "Network error";
  if (safe === "invalid-content-type") return "Invalid upstream payload";
  if (safe === "upstream-5xx") return "Upstream server error";
  if (safe === "http-error") return "HTTP error";
  if (safe === "graphql-error") return "GraphQL execution error";
  return "Request failure";
}

function classifyGraphqlIssue(message) {
  const text = String(message || "").trim();
  if (!text) {
    return {
      label: "GraphQL error",
      shouldBe:
        "The query should parse and validate against the current WPGraphQL schema.",
      was: "No error message was returned by the upstream service.",
      recommendation:
        "Capture the full upstream response and retry with GraphQL debug enabled.",
    };
  }

  let match =
    text.match(/Cannot query field \"([^\"]+)\" on type \"([^\"]+)\"/i) ||
    text.match(/Cannot query field '([^']+)' on type '([^']+)'/i);
  if (match) {
    const field = match[1];
    const type = match[2];
    return {
      label: "Missing field",
      shouldBe: `Type ${type} should expose field ${field} in WPGraphQL.`,
      was: text,
      recommendation:
        `Verify WPGraphQL schema support for ${type}.${field}. Update the query to existing fields or register the field in the plugin schema.`,
    };
  }

  match = text.match(/Unknown fragment \"([^\"]+)\"/i);
  if (match) {
    return {
      label: "Unknown fragment",
      shouldBe: `Fragment ${match[1]} should be defined once and imported in the same document.`,
      was: text,
      recommendation:
        "Add or rename the fragment definition so every fragment spread resolves to an existing fragment.",
    };
  }

  match = text.match(/Fragment \"([^\"]+)\" cannot be spread here/i);
  if (match) {
    return {
      label: "Invalid fragment spread",
      shouldBe: `Fragment ${match[1]} should target a compatible GraphQL type.`,
      was: text,
      recommendation:
        "Align the fragment type condition with the receiving selection set or move the spread to a compatible type branch.",
    };
  }

  match =
    text.match(/Unknown argument \"([^\"]+)\" on field \"([^\"]+)\" of type \"([^\"]+)\"/i) ||
    text.match(/Unknown argument '([^']+)' on field '([^']+)' of type '([^']+)'/i);
  if (match) {
    return {
      label: "Unknown argument",
      shouldBe: `Field ${match[3]}.${match[2]} should accept argument ${match[1]}.`,
      was: text,
      recommendation:
        "Check schema introspection for valid arguments and update variable names/types to match.",
    };
  }

  match = text.match(/Variable \"(\$[^\"]+)\" of required type \"([^\"]+)\" was not provided/i);
  if (match) {
    return {
      label: "Missing variable",
      shouldBe: `Provide required variable ${match[1]} of type ${match[2]}.`,
      was: text,
      recommendation:
        "Populate the variable payload before fetchGraphQL call, or make the variable optional in the operation signature.",
    };
  }

  if (/syntax error|expected name|unexpected/i.test(text)) {
    return {
      label: "Syntax error",
      shouldBe: "The GraphQL document should be syntactically valid and parse cleanly.",
      was: text,
      recommendation:
        "Fix malformed braces, fragment syntax, commas, or argument punctuation in the operation shown below.",
    };
  }

  if (/without authentication|not authorized|forbidden/i.test(text)) {
    return {
      label: "Authorization error",
      shouldBe:
        "The GraphQL request should run under a principal with access to queried fields.",
      was: text,
      recommendation:
        "Verify application password/site token permissions and avoid querying admin-only fields without authentication.",
    };
  }

  return {
    label: "GraphQL execution error",
    shouldBe:
      "Query and variables should align with schema and resolver expectations.",
    was: text,
    recommendation:
      "Inspect query + variables + schema together, then update field names, variable types, or resolver/plugin implementation.",
  };
}

function tokenizeGraphql(query) {
  if (!query) return [{ text: "", type: "plain" }];
  const pattern =
    /(\.\.\.|"(?:\\.|[^"\\])*"|#[^\n]*|\$[A-Za-z_][A-Za-z0-9_]*|@[A-Za-z_][A-Za-z0-9_]*|\b[A-Za-z_][A-Za-z0-9_]*\b|[{}()[\]:!,=])/gm;
  const text = String(query);
  const tokens = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const index = match.index;
    if (index > lastIndex) tokens.push({ text: text.slice(lastIndex, index), type: "plain" });
    const token = match[0];
    let type = "identifier";
    if (token.startsWith("#")) type = "comment";
    else if (token.startsWith('"')) type = "string";
    else if (GRAPHQL_KEYWORDS.has(token)) type = "keyword";
    else if (token.startsWith("$")) type = "variable";
    else if (token.startsWith("@")) type = "directive";
    else if (/^[{}()[\]:!,=]$/.test(token) || token === "...") type = "punctuation";
    tokens.push({ text: token, type });
    lastIndex = index + token.length;
  }
  if (lastIndex < text.length) tokens.push({ text: text.slice(lastIndex), type: "plain" });
  return tokens;
}

function tokenClass(type) {
  if (type === "keyword") return "text-[#fe8019] font-semibold";
  if (type === "variable") return "text-[#8ec07c]";
  if (type === "directive") return "text-[#d3869b]";
  if (type === "string") return "text-[#fabd2f]";
  if (type === "comment") return "text-[#928374] italic";
  if (type === "punctuation") return "text-[#a89984]";
  if (type === "identifier") return "text-[#b8bb26]";
  return "text-[#ebdbb2]";
}

function GraphqlHighlightedCode({ query }) {
  const tokens = tokenizeGraphql(query);
  return (
    <pre className="overflow-auto rounded-md border border-[#3c3836] bg-[#282828] p-3 text-xs leading-relaxed shadow-inner">
      <code className="font-mono">
        {tokens.map((token, index) => (
          <span key={`${index}:${token.text.slice(0, 20)}`} className={tokenClass(token.type)}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
}

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
  const [expandedFailure, setExpandedFailure] = useState(null);

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
                  <th className="px-3 py-2 font-medium">Debug</th>
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
                  const entryId = `${entry.ts}:${entry.status}:${i}`;
                  const isExpanded = expandedFailure === entryId;
                  const issues = Array.isArray(entry.errors)
                    ? entry.errors.map((item) => classifyGraphqlIssue(item?.message))
                    : [];
                  return (
                    <Fragment key={entryId}>
                      <tr
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
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {!entry.ok ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedFailure((prev) => (prev === entryId ? null : entryId))
                              }
                              className="rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
                            >
                              {isExpanded ? "Hide" : "Inspect"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                      {!entry.ok && isExpanded && (
                        <tr className="bg-[#1d2021] text-[#ebdbb2]">
                          <td className="px-3 py-3" colSpan={5}>
                            <div className="space-y-3 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded border border-[#fb4934] bg-[#3c1f1f] px-2 py-0.5 font-semibold text-[#fb4934]">
                                  {formatFailureKind(entry.failureKind)}
                                </span>
                                {entry.operationName && (
                                  <span className="rounded border border-[#504945] bg-[#282828] px-2 py-0.5 text-[#83a598]">
                                    operation: {entry.operationName}
                                  </span>
                                )}
                                <span className="rounded border border-[#504945] bg-[#282828] px-2 py-0.5 text-[#fabd2f]">
                                  status: {String(entry.status)}
                                </span>
                              </div>

                              {entry.query && (
                                <div className="space-y-1">
                                  <div className="font-semibold text-[#d5c4a1]">GraphQL document</div>
                                  <GraphqlHighlightedCode query={entry.query} />
                                </div>
                              )}

                              {entry.variables && (
                                <div className="space-y-1">
                                  <div className="font-semibold text-[#d5c4a1]">Variables payload</div>
                                  <pre className="overflow-auto rounded-md border border-[#3c3836] bg-[#282828] p-3 text-xs text-[#ebdbb2]">
                                    <code>{entry.variables}</code>
                                  </pre>
                                </div>
                              )}

                              {entry.responsePreview && (
                                <div className="space-y-1">
                                  <div className="font-semibold text-[#d5c4a1]">Upstream response preview</div>
                                  <pre className="overflow-auto rounded-md border border-[#3c3836] bg-[#282828] p-3 text-xs text-[#fb4934]">
                                    <code>{entry.responsePreview}</code>
                                  </pre>
                                </div>
                              )}

                              {issues.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="font-semibold text-[#d5c4a1]">Diagnostic guidance</div>
                                  {issues.map((issue, issueIndex) => (
                                    <div
                                      key={`${entryId}:issue:${issueIndex}`}
                                      className="rounded border border-[#504945] bg-[#282828] p-3"
                                    >
                                      <div className="mb-2 font-semibold text-[#fabd2f]">
                                        {issue.label}
                                      </div>
                                      <div className="space-y-1 text-[#ebdbb2]">
                                        <p>
                                          <span className="font-semibold text-[#8ec07c]">Should be:</span>{" "}
                                          {issue.shouldBe}
                                        </p>
                                        <p>
                                          <span className="font-semibold text-[#fb4934]">Was:</span>{" "}
                                          {issue.was}
                                        </p>
                                        <p>
                                          <span className="font-semibold text-[#83a598]">Recommended:</span>{" "}
                                          {issue.recommendation}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded border border-[#504945] bg-[#282828] p-3">
                                  <p className="font-semibold text-[#fabd2f]">
                                    Diagnostic guidance
                                  </p>
                                  <p className="mt-1 text-[#ebdbb2]">
                                    Should be: request should return valid JSON GraphQL payload without errors.
                                  </p>
                                  <p className="text-[#ebdbb2]">
                                    Was: {String(entry.status)} ({formatFailureKind(entry.failureKind)}).
                                  </p>
                                  <p className="text-[#ebdbb2]">
                                    Recommended: inspect endpoint health, auth credentials, and query structure, then retry.
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
