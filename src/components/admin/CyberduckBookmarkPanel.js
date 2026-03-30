"use client";

import { t } from "@/lib/i18n";
import { downloadCyberduckBookmark } from "@/lib/mediaLibraryHelpers";

function resolveBackendMode(uploadBackend, uploadInfo, uploadInfoDetails) {
  const s3Enabled = Boolean(uploadInfo?.s3Enabled || uploadInfoDetails?.s3Enabled);
  if (uploadBackend === "r2") return "r2";
  if (uploadBackend === "s3" && s3Enabled) return "s3";
  if (uploadInfoDetails?.isR2) return "r2";
  if (uploadInfo?.r2) return "r2";
  if (s3Enabled && uploadInfo?.s3) return "s3";
  return null;
}

function hasBookmarkPrereqs(details) {
  return Boolean(details?.endpoint && details?.bucket && details?.accessKeyId);
}

export default function CyberduckBookmarkPanel({
  uploadBackend,
  uploadInfo,
  uploadInfoDetails,
  className = "",
}) {
  const backendMode = resolveBackendMode(uploadBackend, uploadInfo, uploadInfoDetails);
  const details = uploadInfoDetails || {};
  if (!backendMode) return null;

  const canDownloadBookmark = hasBookmarkPrereqs(details);
  const rootClass = `rounded-lg border border-amber-200 bg-amber-50 ${className}`.trim();

  return (
    <details className={rootClass}>
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-amber-900">
        {t("admin.cyberduckTitle")} · {t("admin.cyberduckDownloadProfile")}
      </summary>
      <div className="space-y-2 border-t border-amber-200 px-3 py-2 text-[11px] text-amber-900">
        <p>{t("admin.cyberduckSummary")}</p>
        <div className="grid gap-1 sm:grid-cols-2">
          <p>
            {t("admin.clientProtocol")}: S3
          </p>
          <p className="break-all">
            {t("admin.clientHost")}: {details.endpoint || "—"}
          </p>
          <p>
            {t("admin.clientRegion")}: {details.region || "auto"}
          </p>
          <p>
            {t("admin.clientBucket")}: {details.bucket || "—"}
          </p>
          <p className="break-all sm:col-span-2">
            {t("admin.clientPublicUrl")}: {details.publicUrl || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCyberduckBookmark(details)}
          disabled={!canDownloadBookmark}
          className="inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("admin.cyberduckDownloadProfile")}
        </button>
      </div>
    </details>
  );
}
