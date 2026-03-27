"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n";
import StatsChart from "./StatsChart";
import AdminDocsContextLinks from "./AdminDocsContextLinks";
import AdminFieldHelpLink from "./AdminFieldHelpLink";

export default function AdminStatsTab({
  wcProducts,
  wpCourses,
  wpEvents,
  products,
  users,
  analytics,
  analyticsMode,
  analyticsConfigured,
}) {
  useEffect(() => {
    console.log("[AdminStatsTab] mounted");
    return () => console.log("[AdminStatsTab] unmounted");
  }, []);

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t("admin.navStats", "Stats")}
          </h2>
          <p className="text-sm text-gray-500">
            {t(
              "admin.statsSubtitle",
              "Traffic, demand, and response signals from storefront and infrastructure.",
            )}
          </p>
        </div>
        <AdminDocsContextLinks tab="info" compact />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {wcProducts.length +
              wpCourses.length +
              wpEvents.length +
              products.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Total items</div>
        </div>
        <div className="border rounded p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">
            {wcProducts.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">WooCommerce</div>
        </div>
        <div className="border rounded p-4 text-center">
          <div className="text-2xl font-bold text-green-700">
            {wpCourses.length + wpEvents.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Courses &amp; Events</div>
        </div>
        <div className="border rounded p-4 text-center">
          <div className="text-2xl font-bold text-purple-700">
            {users.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Registered users</div>
        </div>
      </div>

      {/* Traffic analytics */}
      {analytics ? (
        <div className="border rounded p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1">
              <h2 className="text-lg font-semibold">Traffic (last 24h)</h2>
              <AdminFieldHelpLink slug="performance-explained" />
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                analyticsMode === "zone"
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {analyticsMode === "zone"
                ? "Zone analytics (full)"
                : "Workers analytics (basic)"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
            <div className="bg-gray-50 rounded p-3">
              <div className="text-xl font-bold">
                {analytics.totals.requests.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Requests</div>
            </div>
            {analyticsMode === "zone" ? (
              <>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">
                    {analytics.totals.pageViews.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Page views</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">
                    {analytics.totals.uniques.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Unique visitors</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">
                    {(analytics.totals.bytes / 1024 / 1024).toFixed(1)} MB
                  </div>
                  <div className="text-xs text-gray-500">Bandwidth</div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">
                    {(analytics.totals.subrequests || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Subrequests</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">
                    {(analytics.totals.errors || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Errors</div>
                </div>
                <div className="bg-gray-50 rounded p-3 opacity-40">
                  <div className="text-xl font-bold">&mdash;</div>
                  <div className="text-xs text-gray-500">Bandwidth</div>
                </div>
              </>
            )}
          </div>

          <StatsChart analytics={analytics} analyticsMode={analyticsMode} />
        </div>
      ) : !analyticsConfigured ? (
        <div className="border rounded p-4 text-sm text-gray-500">
          <strong>Traffic analytics:</strong> Set{" "}
          <code className="bg-gray-100 px-1 rounded">
            CF_API_TOKEN / CLOUDFLARE_API_TOKEN
          </code>{" "}
          and{" "}
          <code className="bg-gray-100 px-1 rounded">
            CLOUDFLARE_ACCOUNT_ID / CF_ACCOUNT_ID
          </code>{" "}
          for basic Workers analytics, or also add{" "}
          <code className="bg-gray-100 px-1 rounded">CF_ZONE_ID</code> for full
          zone analytics (referrers, page views, unique visitors).
        </div>
      ) : null}
    </div>
  );
}
