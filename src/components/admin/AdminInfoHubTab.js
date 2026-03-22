"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import AdminConnectorsTab from "./AdminConnectorsTab";
import AdminSandboxTab from "./AdminSandboxTab";
import AdminStatsTab from "./AdminStatsTab";

function normalizeSection(value) {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "health") return "health";
  if (safe === "stats" || safe === "statistics") return "stats";
  if (safe === "docs" || safe === "documentation") return "docs";
  return "overview";
}

function sectionFromHash(hashValue) {
  const normalized = String(hashValue || "")
    .replace(/^#\/?/, "")
    .trim()
    .toLowerCase();
  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] === "health") return "health";
  if (parts[0] === "stats") return "stats";
  if (parts[0] === "docs" || parts[0] === "documentation") return "docs";
  if (parts[0] !== "info") return "overview";
  return normalizeSection(parts[1] || "overview");
}

function hashForSection(section) {
  if (section === "health") return "#/info/health";
  if (section === "stats") return "#/info/stats";
  if (section === "docs") return "#/info/docs";
  return "#/info";
}

function boolLabel(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "—";
}

function statusClass(ok) {
  return ok
    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : "bg-red-100 text-red-800 border-red-300";
}

function RagbazRuntimePanel({ healthChecks, healthLoading, runHealthCheck }) {
  const ragbaz = healthChecks?.ragbaz || null;
  const runtimeCheck = healthChecks?.ragbazWpRuntime || null;
  const details = runtimeCheck?.details || ragbaz?.details || null;
  const runtime = details?.runtime || null;
  const availability = details?.availability || null;
  const pluginVersion =
    details?.pluginVersion || details?.version || runtime?.pluginVersion || "—";

  const criticalItems = runtime
    ? [
        { label: "WP_DEBUG", ok: runtime.wpDebug === false, value: runtime.wpDebug },
        {
          label: "WP_DEBUG_LOG",
          ok: runtime.wpDebugLog === false,
          value: runtime.wpDebugLog,
        },
        {
          label: "SCRIPT_DEBUG",
          ok: runtime.scriptDebug === false,
          value: runtime.scriptDebug,
        },
        {
          label: "SAVEQUERIES",
          ok: runtime.saveQueries === false,
          value: runtime.saveQueries,
        },
        {
          label: "GRAPHQL_DEBUG",
          ok: runtime.graphqlDebug === false,
          value: runtime.graphqlDebug,
        },
        {
          label: "Query Monitor",
          ok: runtime.queryMonitorActive === false,
          value: runtime.queryMonitorActive,
        },
        {
          label: "Xdebug",
          ok: runtime.xdebugActive === false,
          value: runtime.xdebugActive,
        },
      ]
    : [];

  const cacheItems = runtime
    ? [
        {
          label: "Persistent object cache",
          ok: runtime.objectCacheEnabled === true,
          value: runtime.objectCacheEnabled,
        },
        {
          label: "Object-cache drop-in",
          ok: runtime.objectCacheDropInPresent === true,
          value: runtime.objectCacheDropInPresent,
        },
        {
          label: "Redis plugin",
          ok: runtime.redisPluginActive === true,
          value: runtime.redisPluginActive,
        },
        {
          label: "Memcached plugin",
          ok: runtime.memcachedPluginActive === true,
          value: runtime.memcachedPluginActive,
        },
        {
          label: "OPcache",
          ok: runtime.opcacheEnabled === true,
          value: runtime.opcacheEnabled,
        },
      ]
    : [];

  const criticalOkCount = criticalItems.filter((item) => item.ok).length;
  const cacheOkCount = cacheItems.filter((item) => item.ok).length;

  const measures = [];
  if (runtime) {
    if (runtime.wpDebug || runtime.wpDebugLog || runtime.scriptDebug) {
      measures.push(
        "Disable WP_DEBUG, WP_DEBUG_LOG and SCRIPT_DEBUG in production to reduce overhead and avoid noisy responses.",
      );
    }
    if (runtime.saveQueries || runtime.graphqlDebug) {
      measures.push(
        "Disable SAVEQUERIES and GRAPHQL_DEBUG in production unless actively troubleshooting.",
      );
    }
    if (runtime.queryMonitorActive || runtime.xdebugActive) {
      measures.push(
        "Turn off Query Monitor and Xdebug in production to lower request latency.",
      );
    }
    if (!runtime.opcacheEnabled) {
      measures.push(
        "Enable OPcache in PHP runtime for faster repeated requests.",
      );
    }
    if (!runtime.objectCacheEnabled) {
      measures.push(
        "Enable persistent object cache (Redis/Memcached) for improved WordPress query performance under load.",
      );
    }
    if (runtime.objectCacheDropInPresent && !runtime.objectCacheEnabled) {
      measures.push(
        "Object-cache drop-in is present but not active. Verify cache backend configuration.",
      );
    }
    if (runtime.debugFlagsOk && runtime.debugToolsOk && runtime.cacheReadinessOk) {
      measures.push(
        "Current posture is healthy. Keep monitoring TTFB and GraphQL response time in the Info/Stats views.",
      );
    }
  }

  return (
    <div className="border rounded p-5 bg-white space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {t("admin.infoWpRuntimeTitle", "WordPress runtime posture")}
        </h2>
        <button
          type="button"
          onClick={runHealthCheck}
          className="px-3 py-1.5 rounded border hover:bg-gray-50 disabled:opacity-50 text-sm"
          disabled={healthLoading}
        >
          {healthLoading ? t("admin.running", "Running…") : t("admin.runCheck", "Run check")}
        </button>
      </div>

      {!runtime ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
          <p>
            {runtimeCheck?.message ||
              ragbaz?.message ||
              "Runtime details are not available yet."}
          </p>
          <p className="text-xs text-amber-800">
            {t(
              "admin.infoWpRuntimeHint",
              "If the plugin is older, only basic ragbazInfo may be available.",
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Plugin version
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {pluginVersion}
              </p>
            </div>
            <div className="rounded border bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Runtime safety
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {criticalOkCount}/{criticalItems.length} safe
              </p>
            </div>
            <div className="rounded border bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Cache readiness
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {cacheOkCount}/{cacheItems.length} signals
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border p-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Runtime safety flags
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs">
                {criticalItems.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-gray-700">{item.label}</span>
                    <span
                      className={`rounded border px-2 py-0.5 font-semibold ${statusClass(item.ok)}`}
                    >
                      {item.ok ? "ok" : "action"} ({boolLabel(item.value)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded border p-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Cache readiness
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs">
                {cacheItems.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-gray-700">{item.label}</span>
                    <span
                      className={`rounded border px-2 py-0.5 font-semibold ${statusClass(item.ok)}`}
                    >
                      {item.ok ? "yes" : "no"} ({boolLabel(item.value)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded border border-blue-200 bg-blue-50 p-3">
            <h3 className="text-sm font-semibold text-blue-900">
              Measures and next actions
            </h3>
            {measures.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-xs text-blue-900">
                {measures.map((measure, index) => (
                  <li key={`${measure}-${index}`}>{measure}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-blue-900">
                No immediate actions suggested from current readings.
              </p>
            )}
          </div>
        </>
      )}

      <div className="rounded border bg-gray-50 p-3 text-xs text-gray-700">
        <p className="font-semibold text-gray-900">Availability</p>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          <p>
            `ragbazInfo`: {availability?.ragbazInfo ? "yes" : "no"}
          </p>
          <p>
            `ragbazPluginVersion`: {availability?.ragbazPluginVersion ? "yes" : "no"}
          </p>
          <p>
            `ragbazWpRuntime`: {availability?.ragbazWpRuntime ? "yes" : "no"}
          </p>
          <p>
            `ragbazInfo.wpRuntime`: {availability?.ragbazInfoWpRuntime ? "yes" : "no"}
          </p>
        </div>
      </div>
    </div>
  );
}

function DocsPanel() {
  return (
    <div className="border rounded p-5 bg-white space-y-4">
      <h2 className="text-xl font-semibold">
        {t("admin.documentation", "Documentation")}
      </h2>
      <p className="text-sm text-gray-600">
        {t(
          "admin.docsInfoSummary",
          "Browse operator guides and architecture notes directly from this section.",
        )}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Link
          href="/admin/docs"
          className="rounded border bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-colors"
        >
          <p className="font-semibold text-gray-900">
            {t("admin.documentation", "Documentation")}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {t(
              "admin.docsHubHint",
              "Open the admin docs index and choose a guide.",
            )}
          </p>
        </Link>
        <Link
          href="/admin/docs/architecture"
          className="rounded border bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-colors"
        >
          <p className="font-semibold text-gray-900">Architecture</p>
          <p className="text-xs text-gray-600 mt-1">
            {t(
              "admin.docsArchitectureHint",
              "Review system design, data flow, and deployment notes.",
            )}
          </p>
        </Link>
      </div>
    </div>
  );
}

export default function AdminInfoHubTab({
  healthChecks,
  healthLoading,
  webhookUrl,
  ragbazDownloadUrl,
  runHealthCheck,
  wcProducts,
  wpCourses,
  wpEvents,
  products,
  users,
  analytics,
  analyticsMode,
  analyticsConfigured,
  ...sandboxProps
}) {
  const [section, setSection] = useState(() => {
    if (typeof window === "undefined") return "overview";
    return sectionFromHash(window.location.hash);
  });

  const sections = [
    { id: "overview", label: t("admin.infoOverview", "Overview") },
    { id: "stats", label: t("admin.navStats", "Stats") },
    { id: "health", label: t("admin.healthCheck", "Health check") },
    { id: "docs", label: t("admin.documentation", "Documentation") },
  ];

  const setSectionAndHash = useCallback((nextSection) => {
    const normalized = normalizeSection(nextSection);
    setSection(normalized);
    if (typeof window === "undefined") return;
    const nextHash = hashForSection(normalized);
    if (window.location.hash === nextHash) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onHashChange() {
      setSection(sectionFromHash(window.location.hash));
    }
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (section !== "health" && section !== "overview") return;
    if (healthChecks) return;
    runHealthCheck?.();
  }, [section, healthChecks, runHealthCheck]);

  return (
    <div className="space-y-4">
      <div className="border rounded bg-white p-2 flex flex-wrap gap-2">
        {sections.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSectionAndHash(entry.id)}
            className={`px-3 py-1.5 rounded text-sm border transition-colors ${
              section === entry.id
                ? "bg-purple-700 text-white border-purple-700"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="space-y-4">
          <RagbazRuntimePanel
            healthChecks={healthChecks}
            healthLoading={healthLoading}
            runHealthCheck={runHealthCheck}
          />
          <AdminSandboxTab {...sandboxProps} />
        </div>
      )}

      {section === "stats" && (
        <div className="border rounded p-5 bg-white">
          <AdminStatsTab
            wcProducts={wcProducts}
            wpCourses={wpCourses}
            wpEvents={wpEvents}
            products={products}
            users={users}
            analytics={analytics}
            analyticsMode={analyticsMode}
            analyticsConfigured={analyticsConfigured}
          />
        </div>
      )}

      {section === "health" && (
        <div className="border rounded p-5 bg-white">
          <AdminConnectorsTab
            healthChecks={healthChecks}
            healthLoading={healthLoading}
            webhookUrl={webhookUrl}
            ragbazDownloadUrl={ragbazDownloadUrl}
            runHealthCheck={runHealthCheck}
          />
        </div>
      )}

      {section === "docs" && <DocsPanel />}
    </div>
  );
}
