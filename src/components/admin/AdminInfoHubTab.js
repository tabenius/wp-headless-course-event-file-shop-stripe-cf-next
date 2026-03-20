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
    if (section !== "health") return;
    runHealthCheck?.();
  }, [section, runHealthCheck]);

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

      {section === "overview" && <AdminSandboxTab {...sandboxProps} />}

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
