"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getLocale, t } from "@/lib/i18n";
import { buildRagbazDocsUrl, normalizeDocsLanguage } from "@/lib/ragbazDocs";
import { tenantConfig } from "@/lib/tenantConfig";
import AdminConnectorsTab from "./AdminConnectorsTab";
import AdminSandboxTab from "./AdminSandboxTab";
import AdminStatsTab from "./AdminStatsTab";
import GraphqlAvailabilityPanel from "./GraphqlAvailabilityPanel";
import PagePerformancePanel from "./PagePerformancePanel";
import AdminDocsContextLinks from "./AdminDocsContextLinks";
import AdminFieldHelpLink from "./AdminFieldHelpLink";
import AdminSettingsPanel from "./AdminSettingsPanel";
import AdminSecretsPanel from "./AdminSecretsPanel";
import TorusBanner from "./TorusBanner";

function normalizeSection(value) {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "settings" || safe === "setting") return "settings";
  if (safe === "health") return "health";
  if (safe === "stats" || safe === "statistics") return "stats";
  if (safe === "links" || safe === "dead-links" || safe === "deadlinks") return "beta";
  if (safe === "storage" || safe === "infrastructure") return "storage";
  if (safe === "secret" || safe === "secrets") return "secret";
  if (safe === "docs" || safe === "documentation") return "docs";
  if (safe === "beta" || safe === "beta-features" || safe === "monitoring") return "beta";
  return "overview";
}

function sectionFromHash(hashValue) {
  const normalized = String(hashValue || "")
    .replace(/^#\/?/, "")
    .trim()
    .toLowerCase();
  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] === "health") return "health";
  if (parts[0] === "settings") return "settings";
  if (parts[0] === "stats") return "stats";
  if (parts[0] === "links" || parts[0] === "dead-links") return "beta";
  if (parts[0] === "storage") return "storage";
  if (parts[0] === "secret" || parts[0] === "secrets") return "secret";
  if (parts[0] === "docs" || parts[0] === "documentation") return "docs";
  if (parts[0] === "beta") return "beta";
  if (parts[0] !== "info") return "overview";
  const sub = parts[1] || "overview";
  return normalizeSection(sub);
}

function hashForSection(section) {
  if (section === "settings") return "#/info/settings";
  if (section === "health") return "#/info/health";
  if (section === "stats") return "#/info/stats";
  if (section === "storage") return "#/info/storage";
  if (section === "secret") return "#/info/secret";
  if (section === "docs") return "#/info/docs";
  if (section === "beta") return "#/info/beta";
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
        <div className="inline-flex items-center gap-1">
          <h2 className="text-xl font-semibold">
            {t("admin.infoWpRuntimeTitle", "WordPress runtime posture")}
          </h2>
          <AdminFieldHelpLink slug="performance-explained" />
        </div>
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

          <div className="rounded border bg-gray-50 p-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Measures and next actions
            </h3>
            {measures.length > 0 ? (
              <ul className="mt-2 space-y-1.5 pl-4 text-xs text-gray-800 list-disc">
                {measures.map((measure, index) => (
                  <li key={`${measure}-${index}`}>{measure}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-gray-700">
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

function StorageConfigPanel({ storage, uploadInfo, uploadBackend, setUploadBackend, uploadInfoDetails }) {
  const [envGroups, setEnvGroups] = useState(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState("");
  const [revealedValues, setRevealedValues] = useState(new Set());
  const [copiedEnv, setCopiedEnv] = useState("");

  const loadEnvStatus = useCallback(() => {
    setEnvLoading(true);
    setEnvError("");
    fetch("/api/admin/env-status")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setEnvGroups(json.groups || []);
        else setEnvError(json?.error || "Failed to load env status.");
      })
      .catch(() => setEnvError("Failed to load env status."))
      .finally(() => setEnvLoading(false));
  }, []);

  useEffect(() => {
    loadEnvStatus();
  }, [loadEnvStatus]);

  async function copyEnvValue(key, value) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedEnv(key);
      setTimeout(() => setCopiedEnv(""), 1200);
    } catch { /* ignore */ }
  }

  const s3Enabled = Boolean(uploadInfo?.s3Enabled || uploadInfoDetails?.s3Enabled);

  const storageOptions = [
    {
      id: "cloudflare-kv",
      name: t("admin.storageProviderKvName"),
      desc: t("admin.storageProviderKvDesc"),
      active: storage?.provider === "cloudflare-kv",
    },
    {
      id: "wordpress-graphql-user-meta",
      name: t("admin.storageProviderWpName"),
      desc: t("admin.storageProviderWpDesc"),
      active: storage?.provider === "wordpress-graphql-user-meta",
    },
    {
      id: "local-file",
      name: t("admin.storageProviderLocalName"),
      desc: t("admin.storageProviderLocalDesc"),
      active: storage?.provider === "local-file",
    },
  ];

  const uploadTargets = [
    { id: "wordpress", label: t("admin.uploadTargetWordpress"), enabled: true },
    { id: "r2", label: t("admin.uploadTargetR2"), enabled: uploadInfo?.r2 },
    ...(s3Enabled ? [{ id: "s3", label: t("admin.uploadTargetS3"), enabled: uploadInfo?.s3 }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* ── Session storage backend ── */}
      <div className="border rounded p-5 bg-white space-y-3">
        <div className="inline-flex items-center gap-1">
          <h3 className="text-base font-semibold text-gray-900">
            {t("admin.storageBackend")}
          </h3>
          <AdminFieldHelpLink slug="technical-manual" />
        </div>
        <p className="text-sm text-gray-500">
          {t("admin.storageBackendHelp")}{" "}
          <code className="bg-gray-100 px-1 rounded">COURSE_ACCESS_BACKEND</code>.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {storageOptions.map((opt) => (
            <div
              key={opt.id}
              className={`border-2 rounded p-4 space-y-2 ${
                opt.active ? "border-green-400 bg-green-50" : "border-gray-200 bg-white opacity-70"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${opt.active ? "bg-green-600" : "bg-gray-300"}`} />
                <span className="font-medium text-sm">{opt.name}</span>
              </div>
              <p className="text-xs text-gray-500">{opt.desc}</p>
              {opt.active && (
                <span className="inline-block text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">
                  {t("admin.storageActive")}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Upload destination ── */}
      <div className="border rounded p-5 bg-white space-y-3">
        <div className="inline-flex items-center gap-1">
          <h3 className="text-base font-semibold text-gray-900">
            {t("admin.uploadDestinationTitle")}
          </h3>
          <AdminFieldHelpLink slug="quick-start" />
        </div>
        <p className="text-xs text-gray-500">{t("admin.uploadDestinationHint")}</p>
        <div className="flex flex-wrap gap-2">
          {uploadTargets.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={!opt.enabled}
              onClick={() => setUploadBackend(opt.id)}
              className={`px-3 py-1.5 rounded border text-sm ${
                uploadBackend === opt.id
                  ? "border-green-500 text-green-800 bg-green-50"
                  : "border-gray-200 text-gray-700"
              } ${!opt.enabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {!uploadInfo?.s3 && !uploadInfo?.r2 && (
          <p className="text-[11px] text-gray-500">{t("admin.uploadCredentialsHint")}</p>
        )}
      </div>

      {/* ── Environment variables ── */}
      <div className="border rounded p-5 bg-white space-y-3">
        <div className="inline-flex items-center gap-1">
          <h3 className="text-base font-semibold text-gray-900">
            {t("admin.envVarsTitle", "Environment variables")}
          </h3>
          <AdminFieldHelpLink slug="technical-manual" />
        </div>
        <p className="text-xs text-gray-500">
          {t("admin.envVarsHint", "All env vars the app reads, grouped by service. Secret values are masked.")}
        </p>
        {envLoading && <p className="text-xs text-gray-400">{t("common.loading", "Loading…")}</p>}
        {envError && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-red-600">{envError}</p>
            <button type="button" onClick={loadEnvStatus} className="text-xs text-slate-600 hover:underline">
              {t("common.retry", "Retry")}
            </button>
          </div>
        )}
        {envGroups && envGroups.map((group) => (
          <details
            key={group.id}
            className="rounded-xl border border-gray-200 bg-white p-3 open:border-slate-300 open:bg-gray-50"
          >
            <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
              <span className="font-medium text-sm text-gray-800">{group.label}</span>
              <span className="text-[11px] text-gray-400">
                {group.vars.filter((v) => v.set).length}/{group.vars.length} set
              </span>
            </summary>
            <div className="mt-3 space-y-1">
              {group.vars.map((v) => {
                const key = `${group.id}:${v.names[0]}`;
                const isRevealed = revealedValues.has(key);
                const hasValue = Boolean(v.set);
                const displayValue = !hasValue
                  ? t("admin.envVarNotSet", "not set")
                  : isRevealed
                    ? (v.value || "")
                    : "••••••••";
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] gap-2 items-center bg-white border rounded px-2 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className={`font-mono ${v.set ? "text-gray-700" : "text-gray-400"}`}>
                        {v.names[0]}
                      </span>
                      {v.names.length > 1 && (
                        <span className="block text-[10px] text-gray-400">
                          or {v.names.slice(1).join(", ")}
                        </span>
                      )}
                      {v.hint && <span className="block text-[10px] text-gray-400">{v.hint}</span>}
                    </div>
                    <span
                      className={`font-mono break-all ${
                        !v.set ? "text-red-400 italic"
                        : !isRevealed ? "text-gray-300 tracking-widest"
                        : "text-gray-700"
                      }`}
                    >
                      {displayValue}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {hasValue && (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedValues((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                          className="text-[10px] text-slate-700 hover:underline"
                        >
                          {isRevealed ? t("admin.hideSecret", "Hide") : t("admin.showSecret", "Show")}
                        </button>
                      )}
                      {hasValue && v.value && isRevealed && (
                        <button
                          type="button"
                          onClick={() => copyEnvValue(key, v.value)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                          {copiedEnv === key ? t("admin.clientCopied", "Copied") : t("common.copy", "Copy")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function DeadLinksPanel() {
  const [deadLinks, setDeadLinks] = useState([]);
  const [deadLinksTotals, setDeadLinksTotals] = useState(null);
  const [deadLinksLoading, setDeadLinksLoading] = useState(false);
  const [deadLinksHasScanned, setDeadLinksHasScanned] = useState(false);
  const [deadLinksError, setDeadLinksError] = useState("");
  const [deadLinksFilter, setDeadLinksFilter] = useState("all");
  const [deadLinksGeneratedAt, setDeadLinksGeneratedAt] = useState("");

  const loadDeadLinks = useCallback(async () => {
    setDeadLinksLoading(true);
    setDeadLinksError("");
    try {
      const res = await fetch("/api/admin/dead-links?limit=120");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "dead_links_scan_failed");
      }
      setDeadLinks(Array.isArray(json.links) ? json.links : []);
      setDeadLinksTotals(json.totals || null);
      setDeadLinksGeneratedAt(json.generatedAt || "");
      setDeadLinksHasScanned(true);
    } catch (error) {
      setDeadLinksError(
        error?.message || t("admin.deadLinksScanFailed", "Failed to scan links."),
      );
    } finally {
      setDeadLinksLoading(false);
    }
  }, []);

  const filteredDeadLinks = useMemo(() => {
    if (deadLinksFilter === "all") return deadLinks;
    if (deadLinksFilter === "broken") {
      return deadLinks.filter((link) => link.reachability === "broken");
    }
    return deadLinks.filter((link) => link.kind === deadLinksFilter);
  }, [deadLinks, deadLinksFilter]);

  function kindLabel(kind) {
    if (kind === "internal") return t("admin.deadLinksKindInternal", "Internal");
    if (kind === "pseudo-external") return t("admin.deadLinksKindPseudo", "Pseudo external");
    if (kind === "external") return t("admin.deadLinksKindExternal", "External");
    if (kind === "invalid") return t("admin.deadLinksKindInvalid", "Invalid");
    if (kind === "unsupported") return t("admin.deadLinksKindUnsupported", "Unsupported");
    return kind || "—";
  }

  return (
    <div className="border rounded p-4 space-y-3 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="inline-flex items-center gap-1">
            <h3 className="text-lg font-semibold text-gray-800">
              {t("admin.deadLinksTitle", "Dead-link finder")}
            </h3>
            <AdminFieldHelpLink slug="technical-manual" />
          </div>
          <p className="text-xs text-gray-500">
            {t(
              "admin.deadLinksHint",
              `Scans content anchor tags and classifies internal, pseudo-external (${tenantConfig.customDomainExample}) and external links.`,
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={deadLinksFilter}
            onChange={(event) => setDeadLinksFilter(event.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="all">{t("admin.deadLinksFilterAll", "All")}</option>
            <option value="broken">{t("admin.deadLinksFilterBroken", "Broken")}</option>
            <option value="internal">{t("admin.deadLinksFilterInternal", "Internal")}</option>
            <option value="pseudo-external">
              {t("admin.deadLinksFilterPseudo", "Pseudo external")}
            </option>
            <option value="external">{t("admin.deadLinksFilterExternal", "External")}</option>
          </select>
          <button
            type="button"
            onClick={() => loadDeadLinks()}
            disabled={deadLinksLoading}
            className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {deadLinksLoading
              ? t("admin.running", "Running…")
              : deadLinksHasScanned
                ? t("admin.deadLinksRescan", "Rescan")
                : t("admin.deadLinksScan", "Scan now")}
          </button>
        </div>
      </div>

      {deadLinksTotals && (
        <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
            {t("admin.deadLinksTotal", "Total")}:{" "}
            <span className="font-semibold">{deadLinksTotals.total ?? 0}</span>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
            {t("admin.deadLinksKindInternal", "Internal")}:{" "}
            <span className="font-semibold">{deadLinksTotals.internal ?? 0}</span>
          </div>
          <div className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1.5">
            {t("admin.deadLinksKindPseudo", "Pseudo external")}:{" "}
            <span className="font-semibold">{deadLinksTotals.pseudoExternal ?? 0}</span>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
            {t("admin.deadLinksKindExternal", "External")}:{" "}
            <span className="font-semibold">{deadLinksTotals.external ?? 0}</span>
          </div>
          <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5">
            {t("admin.deadLinksReachable", "Reachable")}:{" "}
            <span className="font-semibold">{deadLinksTotals.ok ?? 0}</span>
          </div>
          <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5">
            {t("admin.deadLinksBroken", "Broken")}:{" "}
            <span className="font-semibold">{deadLinksTotals.broken ?? 0}</span>
          </div>
        </div>
      )}

      {deadLinksGeneratedAt && (
        <p className="text-xs text-gray-500">
          {t("admin.deadLinksLastScan", "Last scan")}:{" "}
          {new Date(deadLinksGeneratedAt).toLocaleString("sv-SE")}
        </p>
      )}

      {deadLinksError && <p className="text-sm text-red-600">{deadLinksError}</p>}

      {!deadLinksError && !deadLinksHasScanned ? (
        <p className="text-sm text-gray-500">
          {t(
            "admin.deadLinksStartHint",
            "No scan has run yet. Click “Scan now” to start.",
          )}
        </p>
      ) : !deadLinksError && filteredDeadLinks.length === 0 ? (
        <p className="text-sm text-gray-500">
          {t("admin.deadLinksEmpty", "No links matched this filter.")}
        </p>
      ) : !deadLinksError ? (
        <div className="max-h-96 overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">
                  {t("admin.deadLinksColumnType", "Type")}
                </th>
                <th className="px-3 py-2 text-left">
                  {t("admin.deadLinksColumnLink", "Link")}
                </th>
                <th className="px-3 py-2 text-left">
                  {t("admin.deadLinksColumnStatus", "Status")}
                </th>
                <th className="px-3 py-2 text-left">
                  {t("admin.deadLinksColumnSources", "Sources")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredDeadLinks.map((link) => (
                <tr key={`${link.kind}:${link.href}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {kindLabel(link.kind)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-slate-700 underline"
                    >
                      {link.href}
                    </a>
                    {link.kind === "pseudo-external" && link.translatedPath && (
                      <div className="mt-1 text-xs text-cyan-700">
                        {t("admin.deadLinksTranslatedTo", "Translated to")}:{" "}
                        <code>{link.translatedPath}</code>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {link.reachability === "ok" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        {t("admin.deadLinksStatusOk", "Reachable")}
                      </span>
                    ) : link.reachability === "broken" ? (
                      <div className="space-y-1">
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                          {t("admin.deadLinksStatusBroken", "Broken")}
                        </span>
                        <div className="text-xs text-rose-700">
                          {link.statusCode || link.error || "error"}
                        </div>
                      </div>
                    ) : link.reachability === "unchecked" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        {t("admin.deadLinksStatusUnchecked", "Unchecked")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {t("admin.deadLinksStatusSkipped", "Skipped")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="space-y-1 text-xs text-gray-700">
                      <div>
                        {t("admin.deadLinksOccurrences", "Occurrences")}:{" "}
                        <span className="font-semibold">{link.occurrences || 0}</span>
                      </div>
                      {(link.sources || []).slice(0, 3).map((source) => (
                        <a
                          key={`${source.kind}:${source.uri}`}
                          href={source.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="block break-all text-gray-600 underline"
                          title={source.title}
                        >
                          {source.kind}: {source.title || source.uri}
                        </a>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function DocsPanel() {
  const docsLang = normalizeDocsLanguage(getLocale());
  const docsIndexUrl = buildRagbazDocsUrl({ lang: docsLang });
  const docsTechnicalUrl = buildRagbazDocsUrl({
    lang: docsLang,
    slug: "technical-manual",
  });

  return (
    <div className="border rounded p-5 bg-white space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {t("admin.documentation", "Documentation")}
        </h2>
        <AdminDocsContextLinks tab="info" compact />
      </div>
      <p className="text-sm text-gray-600">
        {t(
          "admin.docsInfoSummary",
          "Browse operator guides and architecture notes directly from this section.",
        )}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <a
          href={docsIndexUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border bg-sky-50 px-4 py-3 hover:bg-sky-100 transition-colors"
          title={t("admin.docsOpenGuideTooltip", "Open guide on RAGBAZ.xyz ({lang}).", {
            lang: docsLang.toUpperCase(),
          })}
        >
          <p className="font-semibold text-sky-900">
            {t("admin.docsExternalHub", "RAGBAZ.xyz docs")}
          </p>
          <p className="text-xs text-sky-700 mt-1">
            {t(
              "admin.docsExternalHubHint",
              "Open the multilingual public docs hub for operators and non-technical readers.",
            )}
          </p>
        </a>
        <a
          href={docsTechnicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border bg-sky-50 px-4 py-3 hover:bg-sky-100 transition-colors"
          title={t("admin.docsOpenGuideTooltip", "Open guide on RAGBAZ.xyz ({lang}).", {
            lang: docsLang.toUpperCase(),
          })}
        >
          <p className="font-semibold text-sky-900">
            {t("admin.docsExternalTechnical", "RAGBAZ.xyz technical manual")}
          </p>
          <p className="text-xs text-sky-700 mt-1">
            {t(
              "admin.docsExternalTechnicalHint",
              "Open implementation-level guidance aligned with AI-agent collaboration workflows.",
            )}
          </p>
        </a>
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
  purging,
  purgeCache,
  storage,
  uploadInfo,
  uploadBackend,
  setUploadBackend,
  uploadInfoDetails,
  wcProducts,
  wpCourses,
  wpEvents,
  products,
  users,
  analytics,
  analyticsMode,
  analyticsConfigured,
  chatBetaEnabled,
  setChatBetaEnabled,
  ...sandboxProps
}) {
  const [section, setSection] = useState(() => {
    if (typeof window === "undefined") return "overview";
    return sectionFromHash(window.location.hash);
  });

  const sections = [
    { id: "overview", label: t("admin.infoOverview", "Overview") },
    { id: "settings", label: t("admin.settings", "Settings") },
    { id: "stats", label: t("admin.navStats", "Stats") },
    { id: "health", label: t("admin.healthCheck", "Health check") },
    { id: "storage", label: t("admin.navStorage", "Storage") },
    { id: "secret", label: t("admin.navSecret", "Secret") },
    { id: "docs", label: t("admin.documentation", "Documentation") },
    { id: "beta", label: t("admin.betaFeatures", "Beta & monitoring") },
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

  const [cacheInfo, setCacheInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/cache-info")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.ok) setCacheInfo(json);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <TorusBanner />
      <div className="border rounded bg-white p-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {sections.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSectionAndHash(entry.id)}
              className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                section === entry.id
                  ? "bg-slate-700 text-white border-slate-700"
                  : "border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AdminDocsContextLinks tab="info" compact />
          <button
            type="button"
            onClick={purgeCache}
            disabled={purging}
            className="px-3 py-1.5 rounded border border-amber-700 bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-50 text-sm"
            title={t("admin.purgeCacheTooltip")}
          >
            {purging ? t("admin.purgingCache") : t("admin.purgeCache")}
          </button>
        </div>
      </div>

      {section === "overview" && (
        <div className="space-y-4">
          <RagbazRuntimePanel
            healthChecks={healthChecks}
            healthLoading={healthLoading}
            runHealthCheck={runHealthCheck}
          />
          <AdminSandboxTab
            {...sandboxProps}
            purging={purging}
            purgeCache={purgeCache}
          />
          {cacheInfo && (
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">
                {t("admin.cacheConfiguration", "Cache Configuration")}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="py-1.5 text-gray-600">ISR Revalidation</td>
                    <td className="py-1.5 font-mono text-right">{cacheInfo.isrRevalidation}s</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5 text-gray-600">Catalog Cache TTL</td>
                    <td className="py-1.5 font-mono text-right">{cacheInfo.catalogCacheTtl}s</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5 text-gray-600">GraphQL Edge Cache</td>
                    <td className="py-1.5 font-mono text-right">{cacheInfo.graphqlEdgeCache}s</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-gray-600">GraphQL Stale-While-Revalidate</td>
                    <td className="py-1.5 font-mono text-right">{cacheInfo.graphqlStaleWhileRevalidate}s</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === "settings" && <AdminSettingsPanel />}

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

      {section === "storage" && (
        <StorageConfigPanel
          storage={storage}
          uploadInfo={uploadInfo}
          uploadBackend={uploadBackend}
          setUploadBackend={setUploadBackend}
          uploadInfoDetails={uploadInfoDetails}
        />
      )}

      {section === "secret" && <AdminSecretsPanel />}

      {section === "docs" && <DocsPanel />}

      {section === "beta" && (
        <div className="space-y-6">
          {/* Chat beta toggle */}
          <div className="border rounded p-5 bg-white">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              {t("admin.betaFeaturesTitle", "Beta features")}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t(
                "admin.betaFeaturesHint",
                "These features are experimental and may change. Enable them here before they appear in the main navigation.",
              )}
            </p>
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {t("admin.chatFeatureLabel", "AI Chat assistant")}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t(
                    "admin.chatFeatureHint",
                    "Shows the Chat tab in the main navigation. Requires an AI API key to be configured.",
                  )}
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none ml-4 shrink-0">
                <span className="text-sm text-gray-600">
                  {chatBetaEnabled
                    ? t("admin.enabled", "Enabled")
                    : t("admin.disabled", "Disabled")}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(chatBetaEnabled)}
                  onClick={() => setChatBetaEnabled?.(!chatBetaEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 ${
                    chatBetaEnabled ? "bg-slate-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      chatBetaEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* GraphQL availability monitoring */}
          <div className="border rounded p-5 bg-white">
            <GraphqlAvailabilityPanel />
          </div>

          {/* Page performance monitoring */}
          <div className="border rounded p-5 bg-white">
            <PagePerformancePanel />
          </div>

          {/* Dead-link finder */}
          <DeadLinksPanel />
        </div>
      )}
    </div>
  );
}
