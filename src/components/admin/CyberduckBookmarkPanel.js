"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import {
  downloadCyberduckBookmarkFromServer,
  resolveBucketRemotePath,
  resolveStorageServerHost,
} from "@/lib/mediaLibraryHelpers";

function hasR2Available(uploadBackend, uploadInfo, uploadInfoDetails) {
  if (uploadBackend === "r2") return true;
  if (uploadInfoDetails?.isR2) return true;
  if (uploadInfo?.r2) return true;
  return false;
}

function hasBookmarkPrereqs(details, serverHost) {
  return Boolean(serverHost && details?.bucket && details?.accessKeyId);
}

function safeValue(value, fallback = "—") {
  const text = String(value || "").trim();
  return text || fallback;
}

export default function CyberduckBookmarkPanel({
  uploadBackend,
  uploadInfo,
  uploadInfoDetails,
  className = "",
}) {
  const r2Available = hasR2Available(uploadBackend, uploadInfo, uploadInfoDetails);
  const [details, setDetails] = useState(uploadInfoDetails || null);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedField, setCopiedField] = useState("");
  const [downloadingBookmark, setDownloadingBookmark] = useState(false);
  const [bookmarkError, setBookmarkError] = useState("");

  useEffect(() => {
    if (!uploadInfoDetails || typeof uploadInfoDetails !== "object") return;
    setDetails(uploadInfoDetails);
  }, [uploadInfoDetails]);

  useEffect(() => {
    if (!r2Available) return;
    const serverHost = resolveStorageServerHost(details || {});
    if (serverHost && details?.bucket && details?.accessKeyId) return;
    let cancelled = false;
    fetch("/api/admin/upload-info?backend=r2", { cache: "no-store" })
      .then((response) => response.json().catch(() => ({})))
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok) return;
        setDetails(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [details, r2Available]);

  if (!r2Available) return null;

  const serverHost = resolveStorageServerHost(details || {});
  const canDownloadBookmark = hasBookmarkPrereqs(details || {}, serverHost);
  const bucketPath = resolveBucketRemotePath(details || {});
  const rows = [
    {
      id: "connectionType",
      label: t("admin.clientProtocol", "Protocol"),
      value: "Amazon S3",
    },
    {
      id: "server",
      label: t("admin.clientHost", "Host / server"),
      value: safeValue(serverHost),
    },
    {
      id: "port",
      label: t("admin.clientPort", "Port"),
      value: "443",
    },
    {
      id: "accessKey",
      label: t("admin.clientAccessKey", "Access key"),
      value: safeValue(details?.accessKeyId),
    },
    {
      id: "secretKey",
      label: t("admin.clientSecretKey", "Secret key"),
      value: safeValue(details?.secretKey),
      secret: true,
    },
    {
      id: "bucketPath",
      label: t("admin.clientBucketPath", "Bucket / path"),
      value:
        details?.bucket || bucketPath
          ? `${safeValue(details?.bucket)} / ${safeValue(bucketPath)}`
          : safeValue(""),
    },
  ];
  const rootClass = `rounded-lg border border-slate-300 bg-slate-50 p-3 ${className}`.trim();

  async function copyValue(fieldId, value) {
    const text = String(value || "").trim();
    if (!text || text === "—") return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(""), 1200);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleDownloadBookmark() {
    if (!canDownloadBookmark) return;
    setBookmarkError("");
    setDownloadingBookmark(true);
    try {
      await downloadCyberduckBookmarkFromServer({
        backend: "r2",
        fileNameHint: `${(details?.bucket || "r2-bucket").replace(/[^a-z0-9._-]/gi, "-")}.duck`,
      });
    } catch (error) {
      setBookmarkError(
        error instanceof Error
          ? error.message
          : t("common.downloadFailed", "Download failed. Please try again soon."),
      );
    } finally {
      setDownloadingBookmark(false);
    }
  }

  return (
    <div className={rootClass}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-900">{t("admin.cyberduckTitle")}</p>
        <button
          type="button"
          onClick={handleDownloadBookmark}
          disabled={!canDownloadBookmark || downloadingBookmark}
          className="inline-flex items-center gap-1 rounded border border-slate-400 bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloadingBookmark
            ? t("common.loading", "Loading…")
            : t("admin.cyberduckDownloadProfile")}
        </button>
      </div>
      {bookmarkError && (
        <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {bookmarkError}
        </p>
      )}
      <div className="space-y-1.5">
        {rows.map((row) => {
          const isHidden = row.secret && !showSecret && row.value !== "—";
          const shownValue = isHidden ? "••••••••••••••••" : row.value;
          return (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-2 rounded border border-slate-300 bg-slate-100 px-2 py-1.5 font-sans"
            >
              <span className="text-[11px] text-slate-600">{row.label}</span>
              <code
                className={`min-w-0 break-all text-[11px] ${
                  isHidden ? "tracking-widest text-slate-300" : "text-slate-800"
                }`}
              >
                {shownValue}
              </code>
              <div className="flex items-center gap-1">
                {row.secret && row.value !== "—" && (
                  <button
                    type="button"
                    onClick={() => setShowSecret((current) => !current)}
                    className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50"
                  >
                    {showSecret ? t("admin.hideSecret", "Hide") : t("admin.showSecret", "Show")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyValue(row.id, row.value)}
                  disabled={row.value === "—"}
                  className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copiedField === row.id
                    ? t("admin.clientCopied", "Copied")
                    : t("common.copy", "Copy")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
