"use client";

import { t } from "@/lib/i18n";
import DebugLogPanel from "./DebugLogPanel";
import TorusBanner from "./TorusBanner";

export default function AdminSandboxTab({
  buildTimestamp,
  gitRevision,
  uploadBackend,
  resendConfigured,
  analyticsMode,
  analyticsConfigured,
  purging,
  purgeMessage,
  deploying,
  deployMessage,
  lastDeployAt,
  commits,
  commitsError,
  commitsExpanded,
  setCommitsExpanded,
  purgeCache,
  triggerDeploy,
  clientLogs,
  setClientLogs,
  debugLogs,
}) {
  return (
    <div className="space-y-6">
      <TorusBanner />
      <div className="border rounded p-5 space-y-6 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {t("admin.sandboxSettings")}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={purgeCache}
              disabled={purging}
              className="px-3 py-1.5 rounded border hover:bg-gray-50 text-sm disabled:opacity-50"
              title={t("admin.purgeCacheTooltip")}
            >
              {purging ? t("admin.purgingCache") : t("admin.purgeCache")}
            </button>
            <button
              type="button"
              onClick={triggerDeploy}
              disabled={deploying}
              className="px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-gray-700 text-sm disabled:opacity-50"
              title={t("admin.deployTooltip")}
            >
              {deploying ? t("admin.deploying") : t("admin.deploy")}
            </button>
          </div>
        </div>
        {purgeMessage && (
          <p className="text-green-700 text-sm">{purgeMessage}</p>
        )}
        {deployMessage && (
          <p className="text-green-700 text-sm">{deployMessage}</p>
        )}
        {buildTimestamp && (
          <p className="text-xs text-gray-500">
            Build: {new Date(buildTimestamp).toLocaleString("sv-SE")}
          </p>
        )}
        {gitRevision && (
          <p className="text-xs text-gray-500">
            Revision:{" "}
            <code className="bg-gray-100 px-1 rounded">
              {gitRevision.slice(0, 12)}
            </code>
          </p>
        )}
        {lastDeployAt && (
          <p className="text-xs text-gray-500">
            Senaste deploy: {new Date(lastDeployAt).toLocaleString("sv-SE")}
          </p>
        )}

        {/* Environment info */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            {t("admin.environment")}
          </h3>
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 rounded p-3 space-y-1">
              <div className="font-medium text-gray-700">WordPress</div>
              <div className="text-gray-500 break-all">
                {process.env.NEXT_PUBLIC_WORDPRESS_URL || "Not configured"}
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3 space-y-1">
              <div className="font-medium text-gray-700">Stripe mode</div>
              <div className="text-gray-500">
                {process.env.NEXT_PUBLIC_STRIPE_MODE === "live"
                  ? "Live"
                  : "Test"}
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3 space-y-1">
              <div className="font-medium text-gray-700">File uploads</div>
              <div className="text-gray-500">
                {uploadBackend === "wordpress"
                  ? "WordPress Media Library"
                  : uploadBackend === "r2"
                    ? "Cloudflare R2"
                    : "S3 / Spaces"}
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3 space-y-1">
              <div className="font-medium text-gray-700">Email delivery</div>
              <div className="text-gray-500">
                {resendConfigured
                  ? "Resend API"
                  : "Not configured — set RESEND_API_KEY and RESEND_FROM_EMAIL"}
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3 space-y-1">
              <div className="font-medium text-gray-700">Analytics</div>
              <div className="text-gray-500">
                {analyticsMode === "zone" ? (
                  <span className="text-green-700">
                    Zone analytics (full) &mdash; CF_ZONE_ID set
                  </span>
                ) : analyticsMode === "workers" ? (
                  <span className="text-amber-700">
                    Workers analytics (basic) &mdash; no CF_ZONE_ID
                  </span>
                ) : analyticsConfigured ? (
                  <span className="text-amber-700">
                    Analytics env present, but no analytics data returned
                    &mdash; verify token scopes and CF GraphQL access
                  </span>
                ) : (
                  <span>
                    Not configured &mdash; set CF_API_TOKEN (or
                    CLOUDFLARE_API_TOKEN) and CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID
                  </span>
                )}
              </div>
              {analyticsMode === "workers" && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Add a custom domain (e.g. xtas.nu) to Cloudflare, route your
                  Worker through it, and set CF_ZONE_ID to unlock referrers,
                  page views, unique visitors, and bandwidth.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recent commits */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {t("admin.recentCommits")}
            </h3>
            {commits && (
              <button
                type="button"
                onClick={() => setCommitsExpanded(!commitsExpanded)}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                {commitsExpanded
                  ? t("admin.commitsCompact")
                  : t("admin.commitsFullMessages")}
              </button>
            )}
          </div>
          {commitsError && (
            <p className="text-xs text-gray-400">{commitsError}</p>
          )}
          {commits ? (
            <div className="bg-gray-900 text-gray-100 rounded p-4 font-mono text-xs max-h-96 overflow-auto">
              {commitsExpanded ? (
                <div className="space-y-3">
                  {commits.map((c) => (
                    <div key={c.sha}>
                      <div className="flex gap-2 items-baseline">
                        <span className="text-yellow-400 shrink-0">
                          {c.sha}
                        </span>
                        <span className="text-gray-400 text-[10px] shrink-0">
                          {c.date ? new Date(c.date).toLocaleDateString() : ""}
                        </span>
                        <span className="text-gray-500 text-[10px] truncate">
                          {c.author}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap text-gray-200 mt-1 pl-[4.5rem] leading-relaxed">
                        {c.fullMessage || c.message}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {commits.map((c) => (
                    <div key={c.sha} className="flex gap-2">
                      <span className="text-yellow-400 shrink-0">{c.sha}</span>
                      <span className="truncate">{c.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !commitsError ? (
            <p className="text-xs text-gray-400">{t("admin.commitsLoading")}</p>
          ) : null}
        </div>

        {/* ── Server request log ── */}
        {debugLogs?.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Recent requests
            </h3>
            <div className="bg-gray-900 text-gray-100 rounded p-3 font-mono text-xs space-y-1 max-h-48 overflow-auto">
              {debugLogs.map((logItem) => (
                <div
                  key={`${logItem.reqId}-${logItem.ts}`}
                  className="flex flex-wrap gap-2"
                >
                  <span className="text-gray-500">
                    {new Date(logItem.ts).toLocaleTimeString()}
                  </span>
                  <code className="text-yellow-400">{logItem.path}</code>
                  <span
                    className={
                      logItem.status >= 400 ? "text-red-400" : "text-green-400"
                    }
                  >
                    {logItem.status}
                  </span>
                  <span className="text-gray-400">{logItem.duration}ms</span>
                  <code className="text-gray-600">{logItem.reqId}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Debug log panel ── */}
        <DebugLogPanel clientLogs={clientLogs} setClientLogs={setClientLogs} />
      </div>
    </div>
  );
}
