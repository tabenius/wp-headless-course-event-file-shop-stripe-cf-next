"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import DebugLogPanel from "./DebugLogPanel";
import TorusBanner from "./TorusBanner";

export default function AdminAdvancedTab({
  buildTimestamp,
  gitRevision,
  runtime,
  storage,
  uploadInfo,
  uploadBackend,
  setUploadBackend,
  uploadInfoDetails,
  resendConfigured,
  analyticsMode,
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
  const [showSecret, setShowSecret] = useState(false);
  return (
    <div className="space-y-6">
      <TorusBanner />
      <div className="border rounded p-5 space-y-6 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {t("admin.advancedSettings")}
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

        {/* Storage configuration */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            {t("admin.storageBackend")}
          </h3>
          <p className="text-xs text-gray-500">
            Controls where course access rules, pricing, and user permissions
            are stored. Set the{" "}
            <code className="bg-gray-100 px-1 rounded">
              COURSE_ACCESS_BACKEND
            </code>{" "}
            environment variable to change.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                id: "cloudflare-kv",
                name: "Cloudflare KV",
                desc: "Fast, edge-distributed key-value store. Best for production on Cloudflare Workers. Requires CLOUDFLARE_ACCOUNT_ID, CF_API_TOKEN, and CF_KV_NAMESPACE_ID.",
                active: storage?.provider === "cloudflare-kv",
              },
              {
                id: "wordpress-graphql-user-meta",
                name: "WordPress GraphQL",
                desc: "Stores access data in WordPress user meta via WPGraphQL mutations. Requires a custom WordPress plugin and COURSE_ACCESS_BACKEND=wordpress.",
                active: storage?.provider === "wordpress-graphql-user-meta",
              },
              {
                id: "local-file",
                name: "Local file",
                desc: "Stores data in .data/course-access.json on the server filesystem. Suitable for local development only \u2014 data is lost on redeploy.",
                active: storage?.provider === "local-file",
              },
            ].map((opt) => (
              <div
                key={opt.id}
                className={`border-2 rounded p-4 space-y-2 ${
                  opt.active
                    ? "border-green-400 bg-green-50"
                    : "border-gray-200 bg-white opacity-70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${opt.active ? "bg-green-600" : "bg-gray-300"}`}
                  />
                  <span className="font-medium text-sm">{opt.name}</span>
                </div>
                <p className="text-xs text-gray-500">{opt.desc}</p>
                {opt.active && (
                  <span className="inline-block text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">
                    Active
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Upload destination */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Upload destination
          </h3>
          <p className="text-xs text-gray-500">
            Choose where product files/images are stored. WordPress Media
            Library works without extra setup. S3/R2 requires credentials.
          </p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "wordpress", label: "WordPress media", enabled: true },
            { id: "r2", label: "Cloudflare R2", enabled: uploadInfo?.r2 },
            { id: "s3", label: "S3 / Spaces", enabled: uploadInfo?.s3 },
          ].map((opt) => (
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
          <p className="text-[11px] text-gray-500">
            Configure S3/R2 credentials to enable direct uploads
            (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME,
            S3_PUBLIC_URL, plus S3_ENDPOINT or CLOUDFLARE_ACCOUNT_ID).
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-400">
          <a
            href="https://developers.cloudflare.com/r2/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full border border-gray-700/60 px-3 py-1 transition hover:border-gray-400"
          >
            <span className="w-4 h-4">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                <circle cx="12" cy="12" r="10" fill="#fbbf24" />
                <path
                  d="M12 4v16M4 12h16"
                  stroke="#0f172a"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>Cloudflare R2 docs</span>
          </a>
          <a
            href="https://aws.amazon.com/s3/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full border border-gray-700/60 px-3 py-1 transition hover:border-gray-400"
          >
            <span className="w-4 h-4">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                <rect x="3" y="7" width="18" height="10" rx="2" fill="#f5af19" />
                <path
                  d="M6 16 4 9h4l2 7h4l2-7h4l-2 7"
                  stroke="#1f2937"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>AWS S3 docs</span>
          </a>
        </div>
        {uploadBackend !== "wordpress" && uploadInfoDetails && (
          <div className="mt-3 border rounded p-3 bg-gray-50 space-y-2 text-xs text-gray-700">
            <div className="font-semibold text-gray-800 flex items-center gap-2">
                {t("admin.uploadClientSettings")}
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                  {uploadBackend === "r2" ? "R2 (S3 API)" : "S3"}
                </span>
              </div>
              <p className="text-gray-600">{t("admin.uploadClientHint")}</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientHost")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.endpoint || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientBucket")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.bucket || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientAccessKey")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.accessKeyId || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientRegion")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.region || "auto"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientPublicUrl")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.publicUrl || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientSecretKey", "Secret Key")}
                  </div>
                  {showSecret ? (
                    <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all flex gap-1 items-start">
                      <span className="flex-1">
                        {uploadInfoDetails.secretKey || "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSecret(false)}
                        className="text-gray-400 hover:text-gray-600 shrink-0 text-[11px] mt-0.5"
                      >
                        {t("admin.hideSecret", "Hide")}
                      </button>
                    </div>
                  ) : (
                    <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 flex items-center gap-2">
                      <span className="flex-1 text-gray-300 tracking-widest">
                        ••••••••••••••••
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSecret(true)}
                        className="text-purple-600 hover:underline text-[11px] shrink-0"
                      >
                        {t("admin.showSecret", "Show")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                {t("admin.uploadAltLarge")}
              </p>
            </div>
          )}
        </div>

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
                ) : (
                  <span>Not configured &mdash; set CF_API_TOKEN</span>
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
