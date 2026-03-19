import { t } from "@/lib/i18n";
import { maxOf, barHeight, formatHour } from "./StatsChart.helpers";

export default function StatsChart({ analytics, analyticsMode }) {
  const hourly = Array.isArray(analytics?.hourly) ? analytics.hourly : [];
  const referrers = Array.isArray(analytics?.referrers) ? analytics.referrers : [];
  const maxReq = maxOf(hourly, "requests");
  const maxCount = maxOf(referrers, "count");

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {hourly.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">{t("stats.requestsPerHour")}</h3>
          <div className="flex items-end gap-px h-24 bg-gray-50 rounded p-2">
            {hourly.map((h, i) => (
              <div
                key={`${h.time}-${i}`}
                className="flex-1 bg-blue-400 rounded-t min-h-[2px]"
                style={{ height: `${barHeight(h.requests, maxReq)}%` }}
                title={`${formatHour(h.time)} — ${h.requests} requests`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 px-2">
            <span>{formatHour(hourly[0]?.time)}</span>
            <span>{t("stats.now")}</span>
          </div>
        </div>
      )}

      {analyticsMode === "zone" && referrers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">{t("stats.topReferrers")}</h3>
          <div className="space-y-1">
            {referrers.slice(0, 10).map((r, i) => (
              <div key={`${r.host}-${i}`} className="flex items-center gap-2 text-xs">
                <div className="w-24 truncate text-gray-600" title={r.host}>
                  {r.host}
                </div>
                <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-green-400 rounded"
                    style={{ width: `${barHeight(r.count, maxCount)}%` }}
                  />
                </div>
                <span className="text-gray-500 w-12 text-right">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analyticsMode === "workers" && (
        <div className="flex items-center text-xs text-gray-400 p-4">
          <p>{t("stats.workersHint")}</p>
        </div>
      )}
    </div>
  );
}
