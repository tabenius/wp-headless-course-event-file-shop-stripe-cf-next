"use client";

import { useState, useEffect } from "react";

const LEVEL_STYLE = {
  error: "text-red-400",
  warn: "text-yellow-400",
  info: "text-blue-300",
  log: "text-gray-300",
};

export default function DebugLogPanel({ clientLogs, setClientLogs }) {
  const [serverLogs, setServerLogs] = useState([]);
  const [serverError, setServerError] = useState("");
  const [tab, setTab] = useState("client");
  const [polling, setPolling] = useState(true);

  // Poll server logs every 5 s while this panel is mounted and polling is on
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    async function fetchServerLogs() {
      try {
        const res = await fetch("/api/admin/log-entries");
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setServerLogs(json.logs ?? []);
      } catch (e) {
        if (!cancelled) setServerError(String(e));
      }
    }
    fetchServerLogs();
    const id = setInterval(fetchServerLogs, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [polling]);

  async function clearServer() {
    await fetch("/api/admin/log-entries", { method: "DELETE" });
    setServerLogs([]);
  }

  const logs = tab === "client" ? clientLogs : serverLogs;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Debug logs</h3>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPolling((p) => !p)}
            className={`px-2 py-0.5 rounded border ${polling ? "admin-pill-live" : "admin-pill-subtle"}`}
          >
            {polling ? "● live" : "○ paused"}
          </button>
          {tab === "client" ? (
            <button
              type="button"
              onClick={() => setClientLogs([])}
              className="admin-pill-subtle admin-pill-danger-hover px-2 py-0.5 rounded border"
            >
              clear
            </button>
          ) : (
            <button
              type="button"
              onClick={clearServer}
              className="admin-pill-subtle admin-pill-danger-hover px-2 py-0.5 rounded border"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 text-xs">
        {["client", "server"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded border ${tab === t ? "admin-pill-active" : "admin-pill-subtle"}`}
          >
            {t === "client"
              ? `Browser (${clientLogs.length})`
              : `Server (${serverLogs.length})`}
          </button>
        ))}
      </div>

      {serverError && tab === "server" && (
        <p className="text-xs text-red-500">{serverError}</p>
      )}

      <div className="bg-gray-900 text-gray-200 rounded p-3 font-mono text-xs max-h-72 overflow-auto space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-gray-500 italic">No entries yet.</span>
        ) : (
          logs.map((entry, i) => {
            const ts =
              tab === "client"
                ? new Date(entry.ts).toLocaleTimeString()
                : new Date(entry.ts).toLocaleTimeString();
            return (
              <div key={i} className="flex gap-2 leading-snug">
                <span className="text-gray-500 shrink-0">{ts}</span>
                <span
                  className={`shrink-0 w-10 ${LEVEL_STYLE[entry.level] ?? "text-gray-300"}`}
                >
                  [{entry.level}]
                </span>
                {entry.reqId && (
                  <span className="text-slate-400 shrink-0">
                    {entry.reqId.slice(0, 8)}
                  </span>
                )}
                <span className="break-all whitespace-pre-wrap">
                  {entry.msg}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
