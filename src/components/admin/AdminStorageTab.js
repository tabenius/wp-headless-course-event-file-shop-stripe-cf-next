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
  const [copiedField, setCopiedField] = useState("");
  const isCloudflare =
    Boolean(process.env.CF_ACCOUNT_ID) ||
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) ||
    Boolean(process.env.CF_API_TOKEN);
  const showR2Docs = isCloudflare || uploadInfo?.r2;
  const showS3Docs = !isCloudflare && uploadInfo?.s3;
  const clientDetails = uploadInfoDetails || {};
  const remotePath = clientDetails.bucket ? `/${clientDetails.bucket}` : "";
  const protocol = "S3";
  const pathStyleValue =
    typeof clientDetails.pathStyle === "boolean"
      ? clientDetails.pathStyle
        ? t("admin.pathStyleEnabled")
        : t("admin.pathStyleDisabled")
      : t("common.noDetails");

  async function copyValue(fieldId, value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text === t("common.noDetails")) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(""), 1200);
    } catch {
      // Ignore clipboard errors in restricted environments.
    }
  }

  const checklistRows = [
    {
      id: "protocol",
      label: t("admin.clientProtocol"),
      value: protocol,
    },
    {
      id: "host",
      label: t("admin.clientHost"),
      value: clientDetails.endpoint || t("common.noDetails"),
    },
    {
      id: "region",
      label: t("admin.clientRegion"),
      value: clientDetails.region || t("admin.clientRegionAuto"),
    },
    {
      id: "bucket",
      label: t("admin.clientBucket"),
      value: clientDetails.bucket || t("common.noDetails"),
    },
    {
      id: "remotePath",
      label: t("admin.clientRemotePath"),
      value: remotePath || t("common.noDetails"),
    },
    {
      id: "pathStyle",
      label: t("admin.clientPathStyle"),
      value: pathStyleValue,
    },
    {
      id: "accessKey",
      label: t("admin.clientAccessKey"),
      value: clientDetails.accessKeyId || t("common.noDetails"),
    },
    {
      id: "secretKey",
      label: t("admin.clientSecretKey"),
      value: clientDetails.secretKey || t("common.noDetails"),
      secret: true,
    },
    {
      id: "publicUrl",
      label: t("admin.clientPublicUrl"),
      value: clientDetails.publicUrl || t("common.noDetails"),
    },
  ];

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
    { id: "s3", label: t("admin.uploadTargetS3"), enabled: uploadInfo?.s3 },
  ];

  return (
    <div className="space-y-6 min-w-0">
      <div className="border rounded p-5 bg-white space-y-8">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("admin.storageBackend")}
          </h2>
          <p className="text-sm text-gray-500">
            {t("admin.storageBackendHelp")}{" "}
            <code className="bg-gray-100 px-1 rounded">COURSE_ACCESS_BACKEND</code>
            .
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
                    {t("admin.storageActive")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            {t("admin.uploadDestinationTitle")}
          </h3>
          <p className="text-xs text-gray-500">
            {t("admin.uploadDestinationHint")}
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
              {t("admin.uploadCredentialsHint")}
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
                    <path
                      d="M12 4v16M4 12h16"
                      stroke="#0f172a"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span>{t("admin.r2Docs")}</span>
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
                    <rect
                      x="3"
                      y="7"
                      width="18"
                      height="10"
                      rx="2"
                      fill="#f5af19"
                    />
                    <path
                      d="M6 16 4 9h4l2 7h4l2-7h4l-2 7"
                      stroke="#1f2937"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>{t("admin.s3Docs")}</span>
              </a>
            )}
          </div>
          {uploadBackend !== "wordpress" && (
            <div className="mt-3 space-y-3">
              <div className="border rounded-xl p-3 bg-indigo-50/70 border-indigo-200 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-indigo-900">
                      {t("admin.clientChecklistTitle")}
                    </p>
                    <p className="text-[11px] text-indigo-700">
                      {t("admin.clientChecklistHint")}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    {uploadBackend === "r2"
                      ? t("admin.uploadClientModeR2")
                      : t("admin.uploadClientModeS3")}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {checklistRows.map((row) => {
                    const rawValue = row.value || t("common.noDetails");
                    const isNoDetails = rawValue === t("common.noDetails");
                    const displayValue =
                      row.secret && !showSecret && !isNoDetails
                        ? "••••••••••••••••"
                        : rawValue;
                    return (
                      <div
                        key={row.id}
                        className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] gap-2 items-center bg-white border rounded px-2 py-1.5"
                      >
                        <span className="text-[11px] font-medium text-gray-500">
                          {row.label}
                        </span>
                        <span
                          className={`font-mono text-[12px] break-all ${row.secret && !showSecret && !isNoDetails ? "text-gray-300 tracking-widest" : "text-gray-700"}`}
                        >
                          {displayValue}
                        </span>
                        <div className="flex items-center gap-1">
                          {row.secret && !isNoDetails && (
                            <button
                              type="button"
                              onClick={() => setShowSecret((prev) => !prev)}
                              className="text-[10px] text-purple-700 hover:underline"
                            >
                              {showSecret
                                ? t("admin.hideSecret")
                                : t("admin.showSecret")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyValue(row.id, rawValue)}
                            disabled={isNoDetails}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {copiedField === row.id
                              ? t("admin.clientCopied")
                              : t("common.copy")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border rounded p-3 bg-gray-50 space-y-2 text-xs text-gray-700">
              <div className="font-semibold text-gray-800 flex items-center gap-2">
                {t("admin.uploadClientSettings")}
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                  {uploadBackend === "r2"
                    ? t("admin.uploadClientModeR2")
                    : t("admin.uploadClientModeS3")}
                </span>
              </div>
              <p className="text-gray-600">{t("admin.uploadClientHint")}</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientHost")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {clientDetails.endpoint || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientBucket")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {clientDetails.bucket || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientAccessKey")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {clientDetails.accessKeyId || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientRegion")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {clientDetails.region || t("admin.clientRegionAuto")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientPublicUrl")}
                  </div>
                  <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all">
                    {clientDetails.publicUrl || t("common.noDetails")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">
                    {t("admin.clientSecretKey")}
                  </div>
                  {showSecret ? (
                    <div className="font-mono text-[12px] bg-white border rounded px-2 py-1 break-all flex gap-1 items-start">
                      <span className="flex-1">
                        {clientDetails.secretKey || "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSecret(false)}
                        className="text-gray-400 hover:text-gray-600 shrink-0 text-[11px] mt-0.5"
                      >
                        {t("admin.hideSecret")}
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
                        {t("admin.showSecret")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                {t("admin.uploadAltLarge")}
              </p>
            </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {t("admin.manualClientsTitle")}
        </h3>
        <p className="text-xs text-gray-500">{t("admin.manualClientsHint")}</p>

        <details className="rounded-xl border border-gray-200 bg-white/90 p-3 open:border-indigo-300 open:bg-indigo-50/30">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="h-7 w-7 flex-shrink-0">
                <svg viewBox="0 0 32 32" className="h-7 w-7">
                  <rect x="2" y="7" width="28" height="18" rx="4" fill="#1c3f94" />
                  <path
                    d="M8 12h16"
                    stroke="#fff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 18h12"
                    stroke="#fff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="24" cy="23" r="2" fill="#fcd34d" />
                </svg>
              </span>
              <span>
                <span className="block font-semibold text-gray-900">
                  {t("admin.winscpTitle")}
                </span>
                <span className="block text-[11px] text-gray-500">
                  {t("admin.winscpSummary")}
                </span>
              </span>
            </span>
            <a
              href="https://winscp.net/eng/docs/start"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-700 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {t("admin.clientDocs")}
            </a>
          </summary>
          <div className="mt-3 space-y-2 text-[12px] text-gray-600">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientProtocol")}
                </div>
                <div className="font-mono text-[12px]">S3</div>
              </div>
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientHost")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.endpoint || t("common.noDetails")}
                </div>
              </div>
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientAccessKey")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.accessKeyId || t("common.noDetails")}
                </div>
              </div>
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientSecretKey")}
                </div>
                {showSecret ? (
                  <div className="font-mono text-[12px] break-all flex gap-2">
                    <span className="flex-1">{clientDetails.secretKey || "—"}</span>
                    <button
                      type="button"
                      onClick={() => setShowSecret(false)}
                      className="text-gray-400 hover:text-gray-600 shrink-0 text-[11px]"
                    >
                      {t("admin.hideSecret")}
                    </button>
                  </div>
                ) : (
                  <div className="font-mono text-[12px] flex items-center gap-2">
                    <span className="flex-1 text-gray-300 tracking-widest">
                      ••••••••••••••••
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSecret(true)}
                      className="text-purple-600 hover:underline text-[11px] shrink-0"
                    >
                      {t("admin.showSecret")}
                    </button>
                  </div>
                )}
              </div>
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientBucket")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.bucket || t("common.noDetails")}
                </div>
              </div>
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientRegion")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.region || t("admin.clientRegionAuto")}
                </div>
              </div>
              <div className="rounded border bg-white p-2 sm:col-span-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientRemotePath")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.bucket
                    ? `/${clientDetails.bucket}`
                    : t("common.noDetails")}
                </div>
              </div>
            </div>
            <p>{t("admin.winscpStepProtocol")}</p>
            <p>{t("admin.winscpStepHost")}</p>
            <p>{t("admin.winscpStepAuth")}</p>
            <p>{t("admin.winscpStepRemotePath")}</p>
          </div>
        </details>

        <details className="rounded-xl border border-gray-200 bg-white/90 p-3 open:border-amber-300 open:bg-amber-50/30">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="h-7 w-7 flex-shrink-0">
                <svg viewBox="0 0 32 32" className="h-7 w-7">
                  <path
                    d="M4 18c0-6 6-10 12-10s12 4 12 10c0 5-6 10-12 10S4 23 4 18"
                    fill="#f59e0b"
                  />
                  <path
                    d="M10 16c0-2 2-4 5-4s5 2 5 4-2 4-5 4-5-2-5-4z"
                    fill="#fff"
                  />
                </svg>
              </span>
              <span>
                <span className="block font-semibold text-gray-900">
                  {t("admin.cyberduckTitle")}
                </span>
                <span className="block text-[11px] text-gray-500">
                  {t("admin.cyberduckSummary")}
                </span>
              </span>
            </span>
            <a
              href="https://cyberduck.io"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-700 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {t("admin.clientWebsite")}
            </a>
          </summary>
          <div className="mt-3 space-y-2 text-[12px] text-gray-600">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientProtocol")}
                </div>
                <div className="font-mono text-[12px]">S3</div>
              </div>
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientHost")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.endpoint || t("common.noDetails")}
                </div>
              </div>
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientAccessKey")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.accessKeyId || t("common.noDetails")}
                </div>
              </div>
              <div className="rounded border bg-white p-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientBucket")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.bucket || t("common.noDetails")}
                </div>
              </div>
              <div className="rounded border bg-white p-2 sm:col-span-2">
                <div className="text-[11px] text-gray-500">
                  {t("admin.clientPublicUrl")}
                </div>
                <div className="font-mono text-[12px] break-all">
                  {clientDetails.publicUrl || t("common.noDetails")}
                </div>
              </div>
            </div>
            <p>{t("admin.cyberduckStepProtocol")}</p>
            <p>{t("admin.cyberduckStepServer")}</p>
            <p>{t("admin.cyberduckStepAuth")}</p>
            <p>{t("admin.cyberduckStepPath")}</p>
          </div>
        </details>
      </div>
    </div>
  );
}
