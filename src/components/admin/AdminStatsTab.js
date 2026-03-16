"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n";

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
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {wcProducts.length + wpCourses.length + wpEvents.length + products.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Total items</div>
        </div>
        <div className="border rounded p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">{wcProducts.length}</div>
          <div className="text-xs text-gray-500 mt-1">WooCommerce</div>
        </div>
        <div className="border rounded p-4 text-center">
          <div className="text-2xl font-bold text-green-700">
            {wpCourses.length + wpEvents.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Courses &amp; Events</div>
        </div>
        <div className="border rounded p-4 text-center">
          <div className="text-2xl font-bold text-purple-700">{users.length}</div>
          <div className="text-xs text-gray-500 mt-1">Registered users</div>
        </div>
      </div>

      {/* Traffic analytics */}
      {analytics ? (
        <div className="border rounded p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Traffic (last 24h)</h2>
            <span className={`text-xs px-2 py-0.5 rounded ${
              analyticsMode === "zone"
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}>
              {analyticsMode === "zone" ? "Zone analytics (full)" : "Workers analytics (basic)"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
            <div className="bg-gray-50 rounded p-3">
              <div className="text-xl font-bold">{analytics.totals.requests.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Requests</div>
            </div>
            {analyticsMode === "zone" ? (
              <>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">{analytics.totals.pageViews.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Page views</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">{analytics.totals.uniques.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Unique visitors</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">{(analytics.totals.bytes / 1024 / 1024).toFixed(1)} MB</div>
                  <div className="text-xs text-gray-500">Bandwidth</div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">{(analytics.totals.subrequests || 0).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Subrequests</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-xl font-bold">{(analytics.totals.errors || 0).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Errors</div>
                </div>
                <div className="bg-gray-50 rounded p-3 opacity-40">
                  <div className="text-xl font-bold">&mdash;</div>
                  <div className="text-xs text-gray-500">Bandwidth</div>
                </div>
              </>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Hourly chart */}
            {analytics.hourly.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">Requests per hour</h3>
                <div className="flex items-end gap-px h-24 bg-gray-50 rounded p-2">
                  {(() => {
                    const maxReq = Math.max(...analytics.hourly.map((h) => h.requests), 1);
                    return analytics.hourly.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-blue-400 rounded-t min-h-[2px]"
                        style={{ height: `${(h.requests / maxReq) * 100}%` }}
                        title={`${new Date(h.time).getHours()}:00 \u2014 ${h.requests} requests`}
                      />
                    ));
                  })()}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 px-2">
                  <span>{analytics.hourly.length > 0 ? new Date(analytics.hourly[0].time).getHours() + ":00" : ""}</span>
                  <span>Now</span>
                </div>
              </div>
            )}

            {/* Top referrers (zone mode only) */}
            {analyticsMode === "zone" && analytics.referrers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">Top referrers</h3>
                <div className="space-y-1">
                  {analytics.referrers.slice(0, 10).map((r, i) => {
                    const maxCount = analytics.referrers[0]?.count || 1;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-24 truncate text-gray-600" title={r.host}>
                          {r.host}
                        </div>
                        <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-green-400 rounded"
                            style={{ width: `${(r.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-500 w-12 text-right">{r.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {analyticsMode === "workers" && (
              <div className="flex items-center text-xs text-gray-400 p-4">
                <p>
                  Referrers, page views, and bandwidth require zone-level analytics.
                  Route your Worker through a custom domain and set <code className="bg-gray-100 px-1 rounded">CF_ZONE_ID</code> to upgrade.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : !analyticsConfigured ? (
        <div className="border rounded p-4 text-sm text-gray-500">
          <strong>Traffic analytics:</strong> Set <code className="bg-gray-100 px-1 rounded">CF_API_TOKEN</code> and
          {" "}<code className="bg-gray-100 px-1 rounded">CLOUDFLARE_ACCOUNT_ID</code> for basic Workers analytics,
          or also add <code className="bg-gray-100 px-1 rounded">CF_ZONE_ID</code> for full zone analytics
          (referrers, page views, unique visitors).
        </div>
      ) : null}
    </div>
  );
}
