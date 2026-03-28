"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { downloadCyberduckBookmark } from "@/lib/mediaLibraryHelpers";

export default function R2ConnectionPanel({ uploadBackend, uploadInfo, uploadInfoDetails }) {
  const [showSecret, setShowSecret] = useState(false);
  const [copiedField, setCopiedField] = useState("");

  const clientDetails = uploadInfoDetails || {};
  const s3Enabled = Boolean(uploadInfo?.s3Enabled || clientDetails.s3Enabled);
  const backendMode = (() => {
    if (uploadBackend === "r2") return "r2";
    if (uploadBackend === "s3" && s3Enabled) return "s3";
    if (clientDetails.isR2) return "r2";
    if (uploadInfo?.r2) return "r2";
    if (s3Enabled && uploadInfo?.s3) return "s3";
    return null;
  })();
  const showR2Docs = backendMode === "r2";
  const showS3Docs = backendMode === "s3";
  const remotePath = clientDetails.bucket ? `/${clientDetails.bucket}` : "";
  const pathStyleValue =
    typeof clientDetails.pathStyle === "boolean"
      ? clientDetails.pathStyle
        ? t("admin.pathStyleEnabled")
        : t("admin.pathStyleDisabled")
      : t("common.noDetails");

  const checklistRows = [
    { id: "protocol", label: t("admin.clientProtocol"), value: "S3" },
    { id: "host", label: t("admin.clientHost"), value: clientDetails.endpoint || t("common.noDetails") },
    { id: "region", label: t("admin.clientRegion"), value: clientDetails.region || t("admin.clientRegionAuto") },
    { id: "bucket", label: t("admin.clientBucket"), value: clientDetails.bucket || t("common.noDetails") },
    { id: "remotePath", label: t("admin.clientRemotePath"), value: remotePath || t("common.noDetails") },
    { id: "pathStyle", label: t("admin.clientPathStyle"), value: pathStyleValue },
    { id: "accessKey", label: t("admin.clientAccessKey"), value: clientDetails.accessKeyId || t("common.noDetails") },
    { id: "secretKey", label: t("admin.clientSecretKey"), value: clientDetails.secretKey || t("common.noDetails"), secret: true },
    { id: "publicUrl", label: t("admin.clientPublicUrl"), value: clientDetails.publicUrl || t("common.noDetails") },
  ];

  async function copyValue(fieldId, value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text === t("common.noDetails")) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(""), 1200);
    } catch { /* ignore */ }
  }

  return (
    <>
      {/* ── S3/R2 connection details ── */}
      {backendMode && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            {t("admin.clientChecklistTitle")}
          </h3>
          <p className="text-[11px] text-gray-500">{t("admin.clientChecklistHint")}</p>
          <div className="border rounded-xl p-3 bg-slate-50/70 border-slate-200 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                {backendMode === "r2" ? t("admin.uploadClientModeR2") : t("admin.uploadClientModeS3")}
              </span>
            </div>
            <div className="space-y-1.5">
              {checklistRows.map((row) => {
                const rawValue = row.value || t("common.noDetails");
                const isNoDetails = rawValue === t("common.noDetails");
                const displayValue =
                  row.secret && !showSecret && !isNoDetails ? "••••••••••••••••" : rawValue;
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] gap-2 items-center bg-white border rounded px-2 py-1.5"
                  >
                    <span className="text-[11px] font-medium text-gray-500">{row.label}</span>
                    <span
                      className={`font-mono text-[12px] break-all ${
                        row.secret && !showSecret && !isNoDetails
                          ? "text-gray-300 tracking-widest"
                          : "text-gray-700"
                      }`}
                    >
                      {displayValue}
                    </span>
                    <div className="flex items-center gap-1">
                      {row.secret && !isNoDetails && (
                        <button
                          type="button"
                          onClick={() => setShowSecret((prev) => !prev)}
                          className="text-[10px] text-slate-700 hover:underline"
                        >
                          {showSecret ? t("admin.hideSecret") : t("admin.showSecret")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => copyValue(row.id, rawValue)}
                        disabled={isNoDetails}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {copiedField === row.id ? t("admin.clientCopied") : t("common.copy")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── GUI client guides ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {t("admin.manualClientsTitle")}
        </h3>
        <p className="text-xs text-gray-500">{t("admin.manualClientsHint")}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-400">
          {showR2Docs && (
            <a
              href="https://developers.cloudflare.com/r2/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-full border border-gray-700/60 px-3 py-1 transition hover:border-gray-400"
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                <circle cx="12" cy="12" r="10" fill="#fbbf24" />
                <path d="M12 4v16M4 12h16" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
              </svg>
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
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                <rect x="3" y="7" width="18" height="10" rx="2" fill="#f5af19" />
                <path d="M6 16 4 9h4l2 7h4l2-7h4l-2 7" stroke="#1f2937" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t("admin.s3Docs")}</span>
            </a>
          )}
        </div>

        <details className="rounded-xl border border-gray-200 bg-white/90 p-3 open:border-slate-300 open:bg-slate-50/30">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="h-7 w-7 flex-shrink-0">
                <svg viewBox="0 0 32 32" className="h-7 w-7">
                  <rect x="2" y="7" width="28" height="18" rx="4" fill="#1c3f94" />
                  <path d="M8 12h16" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M8 18h12" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="24" cy="23" r="2" fill="#fcd34d" />
                </svg>
              </span>
              <span>
                <span className="block font-semibold text-gray-900">{t("admin.winscpTitle")}</span>
                <span className="block text-[11px] text-gray-500">{t("admin.winscpSummary")}</span>
              </span>
            </span>
            <a
              href="https://winscp.net/eng/docs/start"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-700 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {t("admin.clientDocs")}
            </a>
          </summary>
          <div className="mt-3 space-y-2 text-[12px] text-gray-600">
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
                  <path d="M4 18c0-6 6-10 12-10s12 4 12 10c0 5-6 10-12 10S4 23 4 18" fill="#f59e0b" />
                  <path d="M10 16c0-2 2-4 5-4s5 2 5 4-2 4-5 4-5-2-5-4z" fill="#fff" />
                </svg>
              </span>
              <span>
                <span className="block font-semibold text-gray-900">{t("admin.cyberduckTitle")}</span>
                <span className="block text-[11px] text-gray-500">{t("admin.cyberduckSummary")}</span>
              </span>
            </span>
            <a
              href="https://cyberduck.io"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-700 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {t("admin.clientWebsite")}
            </a>
          </summary>
          <div className="mt-3 space-y-2 text-[12px] text-gray-600">
            <p>{t("admin.cyberduckStepProtocol")}</p>
            <p>{t("admin.cyberduckStepServer")}</p>
            <p>{t("admin.cyberduckStepAuth")}</p>
            <p>{t("admin.cyberduckStepPath")}</p>
          </div>
          {clientDetails.endpoint && (
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-[11px] text-gray-500 mb-2">
                {t("admin.cyberduckProfileHint", "Download a pre-filled bookmark file. Double-click it to open directly in CyberDuck. You will be prompted for the secret key on first connect.")}
              </p>
              <button
                type="button"
                onClick={() => downloadCyberduckBookmark(clientDetails)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber-600 text-white hover:bg-amber-700"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M8 12l-5-5h3V2h4v5h3L8 12z" />
                  <rect x="2" y="13" width="12" height="1.5" rx=".75" />
                </svg>
                {t("admin.cyberduckDownloadProfile", "Download .duck bookmark")}
              </button>
            </div>
          )}
        </details>
      </div>
    </>
  );
}
