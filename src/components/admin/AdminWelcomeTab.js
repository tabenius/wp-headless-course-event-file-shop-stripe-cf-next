"use client";

import { t } from "@/lib/i18n";
import AdminDocsContextLinks from "./AdminDocsContextLinks";

function toSafeCount(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function deriveHealthSummary(healthChecks, healthLoading) {
  if (healthLoading) {
    return {
      state: "loading",
      label: t("common.loading", "Loading..."),
    };
  }
  if (!healthChecks || typeof healthChecks !== "object") {
    return {
      state: "unknown",
      label: t("admin.healthStatusUnknown", "Status unknown"),
    };
  }
  const checks = Object.values(healthChecks).filter(Boolean);
  if (checks.length === 0) {
    return {
      state: "unknown",
      label: t("admin.healthStatusUnknown", "Status unknown"),
    };
  }
  const failing = checks.filter((check) => check.ok === false).length;
  if (failing === 0) {
    return {
      state: "green",
      label: t("admin.healthStatusGreen", "All systems operational"),
    };
  }
  if (failing <= 2) {
    return {
      state: "amber",
      label: t("admin.healthStatusAmber", "Partial connectivity"),
    };
  }
  return {
    state: "red",
    label: t("admin.healthStatusRed", "Critical issues"),
  };
}

function quickActions() {
  return [
    {
      tab: "sales",
      title: t("admin.navSales", "Sales"),
      body: t(
        "admin.cardSalesBody",
        "Monitor payments, download Stripe receipts, and keep refunds close.",
      ),
    },
    {
      tab: "assets",
      title: t("admin.navMedia", "Asset library"),
      body: t(
        "admin.cardMediaBody",
        "Browse WordPress and R2 media assets in one combined library.",
      ),
    },
    {
      tab: "products",
      title: t("admin.navProducts", "Products"),
      body: t(
        "admin.cardShopBody",
        "Curate WooCommerce/LearnPress products, metadata, and prices.",
      ),
    },
    {
      tab: "support",
      title: t("admin.navSupport", "Support"),
      body: t(
        "admin.cardSupportBody",
        "Track issues, tickets, and updates in one place.",
      ),
    },
    {
      tab: "info/health",
      title: t("admin.healthStatus", "Health"),
      body: t(
        "admin.cardHealthBody",
        "Run integration checks and inspect connector readiness.",
      ),
    },
    {
      tab: "info/stats",
      title: t("admin.cardStats", "Analytics"),
      body: t(
        "admin.cardStatsBody",
        "Understand traffic, conversions, and Lighthouse lifts since the rebuild.",
      ),
    },
    {
      tab: "info/docs",
      title: t("admin.documentation", "Documentation"),
      body: t(
        "admin.cardDocsBody",
        "Open setup guides, architecture notes, and operator instructions.",
      ),
    },
    {
      tab: "style",
      title: t("admin.navStyle", "Style"),
      body: t(
        "admin.cardStyleBody",
        "Review active type, color, and button system tokens.",
      ),
    },
  ];
}

export default function AdminWelcomeTab({
  onSeenRevision,
  showRevisionBadge = false,
  healthChecks = null,
  healthLoading = false,
  wcProductsCount = 0,
  wpCoursesCount = 0,
  wpEventsCount = 0,
  digitalProductsCount = 0,
  usersCount = 0,
  ticketsCount = 0,
  ticketsLoading = false,
  uploadBackend = "wordpress",
}) {
  const cards = quickActions();
  const healthSummary = deriveHealthSummary(healthChecks, healthLoading);

  const snapshotRows = [
    {
      label: t("admin.welcomeWpProductsCount", "WP products discovered"),
      value: String(toSafeCount(wcProductsCount)),
    },
    {
      label: t("admin.welcomeWpCoursesCount", "WP courses discovered"),
      value: String(toSafeCount(wpCoursesCount)),
    },
    {
      label: t("admin.welcomeWpEventsCount", "WP events discovered"),
      value: String(toSafeCount(wpEventsCount)),
    },
    {
      label: t("admin.welcomeCatalogItemsCount", "Digital catalog items"),
      value: String(toSafeCount(digitalProductsCount)),
    },
    {
      label: t("admin.welcomeUsersCount", "Known users"),
      value: String(toSafeCount(usersCount)),
    },
    {
      label: t("admin.welcomeTicketsCount", "Support tickets"),
      value: ticketsLoading
        ? t("common.loading", "Loading...")
        : String(toSafeCount(ticketsCount)),
    },
    {
      label: t("admin.welcomeStorageBackend", "Upload backend"),
      value: String(uploadBackend || "wordpress"),
    },
    {
      label: t("admin.healthStatus", "Health"),
      value: healthSummary.label,
    },
  ];

  return (
    <div className="space-y-5 rounded-2xl border bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-slate-900">
            {t("admin.welcomeHeadline", "Welcome to your control panel")}
          </h2>
          <p className="text-sm text-slate-600">
            {t(
              "admin.welcomeRealityIntro",
              "This panel reflects current admin state and links directly to active tools.",
            )}
          </p>
          <AdminDocsContextLinks tab="welcome" compact />
        </div>
        {showRevisionBadge ? (
          <button
            type="button"
            onClick={() => onSeenRevision?.()}
            className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-gray-50"
          >
            {t("admin.welcomeBadgeNew", "New")} ·{" "}
            {t("admin.welcomeMarkSeen", "Mark update as seen")}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.tab}
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("admin:switchTab", { detail: card.tab }),
              )
            }
            className="rounded-lg border bg-white p-3 text-left shadow-sm transition hover:bg-gray-50"
          >
            <p className="text-sm font-semibold text-slate-900">{card.title}</p>
            <p className="mt-1 text-xs text-slate-600">{card.body}</p>
          </button>
        ))}
      </div>

      <section className="rounded-xl border bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          {t("admin.welcomeRealitySnapshot", "Reality snapshot")}
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {snapshotRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
            >
              <dt className="text-sm text-slate-600">{row.label}</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          {t(
            "admin.welcomeRealityHint",
            "Values update as each admin section loads its data.",
          )}
        </p>
      </section>
    </div>
  );
}
