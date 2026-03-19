"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";

export default function AdminStorageTab({
  storage,
  uploadInfo,
  uploadBackend,
  setUploadBackend,
  uploadInfoDetails,
}) {
  const [showSecret, setShowSecret] = useState(false);
  const isCloudflare =
    Boolean(process.env.CF_ACCOUNT_ID) ||
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) ||
    Boolean(process.env.CF_API_TOKEN);
  const showR2Docs = isCloudflare || uploadInfo?.r2;
  const showS3Docs = !isCloudflare && uploadInfo?.s3;

  const storageOptions = [
    {
      id: "cloudflare-kv",
      name: "Cloudflare KV",
      desc: "Fast, edge-distributed key-value store. Best for production on Cloudflare Workers. Requires CLOUDFLARE_ACCOUNT_ID, CF_API_TOKEN, and CF_KV_NAMESPACE_ID.",
      active: storage?.provider === "cloudflare-kv",
    },
    {
      id: "wordpress-graphql-user-meta",
      name: "WordPress GraphQL",
      desc: "Stores access data in WordPress user meta via WPGraphQL mutations. Requires COURSE_ACCESS_BACKEND=wordpress and the accompanying plugin.",
      active: storage?.provider === "wordpress-graphql-user-meta",
    },
    {
      id: "local-file",
      name: "Local file",
      desc: "Stores data in .data/course-access.json on the server filesystem. Suitable for local development only — data is lost on redeploy.",
      active: storage?.provider === "local-file",
    },
  ];

  const uploadTargets = [
    { id: "wordpress", label: "WordPress media", enabled: true },
    { id: "r2", label: "Cloudflare R2", enabled: uploadInfo?.r2 },
    { id: "s3", label: "S3 / Spaces", enabled: uploadInfo?.s3 },
  ];

  return (
    <div className="space-y-6">
      <div className="border rounded p-5 bg-white space-y-8">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("admin.storageBackend")}
          </h2>
          <p className="text-sm text-gray-500">
            Controls where course access rules, pricing, and permissions are stored. Adjust the <code className="bg-gray-100 px-1 rounded">COURSE_ACCESS_BACKEND</code> environment variable to switch providers.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {storageOptions.map((opt) => (
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

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Upload destination</h3>
          <p className="text-xs text-gray-500">
            Choose where product files and images are stored. WordPress media works out of the box, while R2/S3 requires credentials.
          </p>
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
            <p className="text-[11px] text-gray-500">
              Configure S3/R2 credentials (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_PUBLIC_URL, plus S3_ENDPOINT or CLOUDFLARE_ACCOUNT_ID) to unlock uplinks.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-400">
            {showR2Docs && (
              <a
                href="https://developers.cloudflare.com/r2/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full border border-gray-700/60 px-3 py-1 transition hover:border-gray-400"
              >
                <span className="w-4 h-4">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                    <circle cx="12" cy="12" r="10" fill="#fbbf24" />
                    <path d="M12 4v16M4 12h16" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <span>Cloudflare R2 docs</span>
              </a>
            )}
            {showS3Docs && (
              <a
                href="https://aws.amazon.com/s3/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full border border-gray-700/60 px-3 py-1 transition hover:border-gray-400"
              >
                <span className="w-4 h-4">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                    <rect x="3" y="7" width="18" height="10" rx="2" fill="#f5af19" />
                    <path d="M6 16 4 9h4l2 7h4l2-7h4l-2 7" stroke="#1f2937" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>AWS S3 docs</span>
              </a>
            )}
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
                  <div className="text-[11px] text-gray-500">{t("admin.clientHost")}</div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.endpoint || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">{t("admin.clientBucket")}</div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.bucket || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">{t("admin.clientAccessKey")}</div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.accessKeyId || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">{t("admin.clientRegion")}</div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {uploadInfoDetails.region || "auto"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">{t("admin.clientPublicUrl")}</div>
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
                      <span className="flex-1 text-gray-300 tracking-widest">••••••••••••••••</span>
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
              <p className="text-[11px] text-gray-500">{t("admin.uploadAltLarge")}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-2 text-[12px] text-gray-500">
        <a
          href="https://winscp.net/eng/docs/start"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white/80 px-3 py-3 shadow-sm transition hover:border-gray-400"
        >
          <svg viewBox="0 0 32 32" className="h-7 w-7 flex-shrink-0">
            <rect x="2" y="7" width="28" height="18" rx="4" fill="#1c3f94" />
            <path d="M8 12h16" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M8 18h12" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="24" cy="23" r="2" fill="#fcd34d" />
          </svg>
          <div>
            <p className="font-semibold text-gray-900">WinSCP</p>
            <p className="text-[11px] text-gray-500">
              Use the free WinSCP SFTP client to drag files straight into R2 or S3 uploads.
            </p>
          </div>
        </a>
        <a
          href="https://cyberduck.io"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white/80 px-3 py-3 shadow-sm transition hover:border-gray-400"
        >
          <svg viewBox="0 0 32 32" className="h-7 w-7 flex-shrink-0">
            <path d="M4 18c0-6 6-10 12-10s12 4 12 10c0 5-6 10-12 10S4 23 4 18" fill="#f59e0b" />
            <path d="M10 16c0-2 2-4 5-4s5 2 5 4-2 4-5 4-5-2-5-4z" fill="#fff" />
          </svg>
          <div>
            <p className="font-semibold text-gray-900">Cyberduck</p>
            <p className="text-[11px] text-gray-500">
              Map your R2/S3 bucket as a remote and sync manuals/document uploads in seconds.
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
