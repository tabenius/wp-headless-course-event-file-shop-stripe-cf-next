"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { t } from "@/lib/i18n";
import {
  normalizeEditorValue,
  normalizeOwnerUri,
  normalizeAssetSlug,
  defaultR2ObjectKey,
  formatBytes,
  formatResolution,
} from "@/lib/mediaLibraryHelpers";

export default function R2ManualIngestPanel({
  uploadInfoDetails,
  onRefresh,
  onCopyUrl,
  onOpenUrl,
}) {
  const [r2ManualInfo, setR2ManualInfo] = useState(
    uploadInfoDetails?.isR2 ? uploadInfoDetails : null,
  );
  const [showManualTools, setShowManualTools] = useState(false);
  const [r2ManualKey, setR2ManualKey] = useState(defaultR2ObjectKey);
  const [r2ManualTitle, setR2ManualTitle] = useState("");
  const [r2ManualAssetId, setR2ManualAssetId] = useState("");
  const [r2ManualOwnerUri, setR2ManualOwnerUri] = useState("/");
  const [r2ManualAssetSlug, setR2ManualAssetSlug] = useState("");
  const [r2ManualRightsHolder, setR2ManualRightsHolder] = useState("");
  const [r2ManualLicense, setR2ManualLicense] = useState("");
  const [r2ManualPreview, setR2ManualPreview] = useState(null);
  const [r2ManualRegistry, setR2ManualRegistry] = useState([]);
  const [r2ManualStorage, setR2ManualStorage] = useState(null);
  const [r2ManualLoading, setR2ManualLoading] = useState(false);
  const [r2ManualPending, setR2ManualPending] = useState(false);
  const [r2ManualError, setR2ManualError] = useState("");
  const [r2ManualStatus, setR2ManualStatus] = useState("");

  const r2ManualPublicUrl = useMemo(
    () =>
      normalizeEditorValue(
        r2ManualInfo?.publicUrl ||
          (uploadInfoDetails?.isR2 ? uploadInfoDetails?.publicUrl : ""),
        1200,
      ),
    [r2ManualInfo, uploadInfoDetails],
  );

  const r2ManualObjectUrl = useMemo(() => {
    const base = String(r2ManualPublicUrl || "").replace(/\/+$/, "");
    const key = String(r2ManualKey || "")
      .trim()
      .replace(/^\/+/, "");
    if (!base || !key) return "";
    return `${base}/${key
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
  }, [r2ManualPublicUrl, r2ManualKey]);

  const r2ManualStorageLabel = useMemo(() => {
    if (r2ManualStorage?.provider === "cloudflare-kv") {
      return `KV (${r2ManualStorage.key || "media-asset-registry"})`;
    }
    if (r2ManualStorage?.provider) return r2ManualStorage.provider;
    return "memory";
  }, [r2ManualStorage]);

  const r2ManualSuggestedAssetId = useMemo(() => {
    const safeKey = String(r2ManualKey || "")
      .trim()
      .replace(/^\/+/, "");
    if (!safeKey) return "";
    const normalized = safeKey
      .toLowerCase()
      .replace(/[^a-z0-9._:/-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/:]+|[-/:]+$/g, "")
      .slice(0, 96);
    return normalized;
  }, [r2ManualKey]);

  const loadR2ManualRegistry = useCallback(async () => {
    setR2ManualLoading(true);
    setR2ManualError("");
    try {
      const [infoResponse, registryResponse] = await Promise.all([
        fetch("/api/admin/upload-info?backend=r2"),
        fetch("/api/admin/media-library/cyberduck-r2"),
      ]);
      const infoJson = await infoResponse.json().catch(() => ({}));
      const registryJson = await registryResponse.json().catch(() => ({}));
      if (infoJson?.ok) {
        setR2ManualInfo(infoJson);
      }
      if (!registryResponse.ok || !registryJson?.ok) {
        throw new Error(
          registryJson?.error ||
            t(
              "admin.mediaR2ManualLoadFailed",
              "Could not load the R2 manual-ingest panel.",
            ),
        );
      }
      setR2ManualRegistry(
        Array.isArray(registryJson.assets) ? registryJson.assets : [],
      );
      setR2ManualStorage(registryJson.storage || null);
    } catch (loadError) {
      setR2ManualRegistry([]);
      setR2ManualStorage(null);
      setR2ManualError(
        loadError instanceof Error
          ? loadError.message
          : t(
              "admin.mediaR2ManualLoadFailed",
              "Could not load the R2 manual-ingest panel.",
            ),
      );
    } finally {
      setR2ManualLoading(false);
    }
  }, []);

  useEffect(() => {
    loadR2ManualRegistry();
  }, [loadR2ManualRegistry]);

  async function runR2ManualAction({ persist }) {
    const key = normalizeEditorValue(r2ManualKey, 512).replace(/^\/+/, "");
    if (!key) {
      setR2ManualError(
        t(
          "admin.mediaR2ManualKeyRequired",
          "Enter an R2 object key before previewing or saving.",
        ),
      );
      return;
    }
    setR2ManualPending(true);
    setR2ManualError("");
    setR2ManualStatus("");
    try {
      const response = await fetch("/api/admin/media-library/cyberduck-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          persist: Boolean(persist),
          title: normalizeEditorValue(r2ManualTitle, 200),
          assetId: normalizeEditorValue(r2ManualAssetId, 96),
          ownerUri: normalizeOwnerUri(r2ManualOwnerUri),
          assetSlug: normalizeAssetSlug(r2ManualAssetSlug, 120),
          rights: {
            copyrightHolder: normalizeEditorValue(r2ManualRightsHolder, 180),
            license: normalizeEditorValue(r2ManualLicense, 180),
          },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            t(
              "admin.mediaR2ManualSaveFailed",
              "Could not preview or save the R2 object.",
            ),
        );
      }
      const preview = json.preview || null;
      setR2ManualPreview(preview);
      setR2ManualStorage(json.storage || null);
      if (!r2ManualTitle && preview?.title) {
        setR2ManualTitle(preview.title);
      }
      if (!r2ManualAssetId && r2ManualSuggestedAssetId) {
        setR2ManualAssetId(r2ManualSuggestedAssetId);
      }
      if (json.persisted) {
        setR2ManualStatus(
          t(
            "admin.mediaR2ManualSaved",
            "Asset metadata saved to R2 and registry record saved to KV.",
          ),
        );
        await loadR2ManualRegistry();
        onRefresh?.();
      } else {
        setR2ManualStatus(
          t(
            "admin.mediaR2ManualPreviewReady",
            "Preview loaded. Save when metadata looks correct.",
          ),
        );
      }
    } catch (saveError) {
      setR2ManualError(
        saveError instanceof Error
          ? saveError.message
          : t(
              "admin.mediaR2ManualSaveFailed",
              "Could not preview or save the R2 object.",
            ),
      );
    } finally {
      setR2ManualPending(false);
    }
  }

  return (
    <div className="border-t pt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-700">
            {t(
              "admin.mediaR2ManualTitle",
              "Optional object-key mapping (advanced)",
            )}
          </p>
          <p className="text-[11px] text-gray-500">
            {t(
              "admin.mediaR2ManualHint",
              "Not required for normal uploads. Open this only when a pre-uploaded object needs metadata or annotation mapping.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadR2ManualRegistry}
            disabled={r2ManualLoading || r2ManualPending}
            className="px-2 py-1 rounded border text-[11px] hover:bg-gray-100 disabled:opacity-50"
          >
            {r2ManualLoading
              ? t("common.loading", "Loading…")
              : t("admin.mediaRefresh", "Refresh")}
          </button>
          <button
            type="button"
            onClick={() => setShowManualTools((current) => !current)}
            disabled={!r2ManualInfo?.ok}
            className="px-2 py-1 rounded border text-[11px] bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50"
          >
            {showManualTools
              ? t("admin.mediaR2ManualCloseTools", "Hide mapping tools")
              : t("admin.mediaR2ManualOpenTools", "Open mapping tools")}
          </button>
        </div>
      </div>

      {!r2ManualInfo?.ok ? (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {t(
            "admin.mediaR2ManualNotConfigured",
            "R2 is not configured. Configure endpoint, bucket, keys, and public URL first.",
          )}
        </p>
      ) : null}

      {showManualTools && r2ManualInfo?.ok && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] text-gray-700 sm:col-span-2">
              <span>{t("admin.mediaR2ManualKey", "R2 object key")}</span>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  className="flex-1 min-w-0 border rounded px-2 py-1 text-xs"
                  value={r2ManualKey}
                  onChange={(event) => setR2ManualKey(event.target.value)}
                  placeholder="uploads/manual/your-asset.png"
                  disabled={r2ManualPending}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded border text-[11px] hover:bg-gray-100"
                  onClick={() => setR2ManualKey(defaultR2ObjectKey())}
                  disabled={r2ManualPending}
                >
                  {t("admin.mediaR2ManualNewKey", "New key")}
                </button>
              </div>
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaTitle", "Title")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualTitle}
                onChange={(event) => setR2ManualTitle(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaAssetId", "Asset ID")}</span>
              <div className="flex gap-1">
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1 text-xs"
                  value={r2ManualAssetId}
                  onChange={(event) => setR2ManualAssetId(event.target.value)}
                  disabled={r2ManualPending}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded border text-[11px] hover:bg-gray-100"
                  onClick={() => setR2ManualAssetId(r2ManualSuggestedAssetId)}
                  disabled={!r2ManualSuggestedAssetId || r2ManualPending}
                >
                  {t("admin.mediaR2ManualSuggest", "Suggest")}
                </button>
              </div>
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaOwnerUri", "Owner URI")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualOwnerUri}
                onChange={(event) => setR2ManualOwnerUri(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaAssetSlug", "Asset slug (optional)")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualAssetSlug}
                onChange={(event) => setR2ManualAssetSlug(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaCopyrightHolder", "Copyright holder")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualRightsHolder}
                onChange={(event) =>
                  setR2ManualRightsHolder(event.target.value)
                }
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700">
              <span>{t("admin.mediaLicense", "License")}</span>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-xs"
                value={r2ManualLicense}
                onChange={(event) => setR2ManualLicense(event.target.value)}
                disabled={r2ManualPending}
              />
            </label>
            <label className="space-y-1 text-[11px] text-gray-700 sm:col-span-2">
              <span>{t("admin.mediaR2ManualUrl", "Resolved R2 URL")}</span>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  readOnly
                  value={r2ManualObjectUrl}
                  className="flex-1 min-w-0 border rounded px-2 py-1 text-xs bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => onCopyUrl?.(r2ManualObjectUrl)}
                  disabled={!r2ManualObjectUrl}
                  className="px-2 py-1 rounded border text-[11px] hover:bg-gray-100 disabled:opacity-50"
                >
                  {t("admin.bucketCopyUrl", "Copy URL")}
                </button>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runR2ManualAction({ persist: false })}
              disabled={!r2ManualKey.trim() || r2ManualPending}
              className="px-3 py-1 rounded border text-xs hover:bg-gray-100 disabled:opacity-50"
            >
              {r2ManualPending
                ? t("common.loading", "Loading…")
                : t("admin.mediaR2ManualPreview", "Preview object")}
            </button>
            <button
              type="button"
              onClick={() => runR2ManualAction({ persist: true })}
              disabled={!r2ManualKey.trim() || r2ManualPending}
              className="px-3 py-1 rounded border text-xs bg-slate-600 text-white border-slate-700 hover:bg-slate-700 disabled:opacity-50"
            >
              {r2ManualPending
                ? t("common.loading", "Loading…")
                : t("admin.mediaR2ManualSave", "Save asset to KV")}
            </button>
            <span className="text-[11px] text-gray-500">
              {t("admin.mediaR2ManualStorage", "Registry storage")}:{" "}
              <code>{r2ManualStorageLabel}</code>
            </span>
          </div>

          {r2ManualError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {r2ManualError}
            </p>
          )}
          {r2ManualStatus && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
              {r2ManualStatus}
            </p>
          )}
          {r2ManualPreview && (
            <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs space-y-2">
              <p className="font-semibold text-slate-800">
                {t("admin.mediaR2ManualPreviewTitle", "Preview")}
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                <p className="text-slate-900 break-all">
                  {t("admin.mediaR2ManualObject", "Object")}:{" "}
                  {r2ManualPreview.key}
                </p>
                <p className="text-slate-900">
                  {t("admin.mediaTypeLabel", "Type")}:{" "}
                  {r2ManualPreview.mimeType || "—"}
                </p>
                <p className="text-slate-900">
                  {t("admin.bucketSize", "Size")}:{" "}
                  {formatBytes(r2ManualPreview.sizeBytes)}
                </p>
                <p className="text-slate-900">
                  {t("admin.resolution", "Resolution")}:{" "}
                  {formatResolution(
                    r2ManualPreview.width,
                    r2ManualPreview.height,
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={r2ManualPreview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-slate-700 hover:underline break-all"
                >
                  {r2ManualPreview.url}
                </a>
                <button
                  type="button"
                  onClick={() => onCopyUrl?.(r2ManualPreview.url)}
                  disabled={!r2ManualPreview.url}
                  className="px-2 py-0.5 rounded border text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  {t("admin.bucketCopyUrl", "Copy URL")}
                </button>
              </div>
              {r2ManualPreview.isImage && r2ManualPreview.url && (
                <div className="rounded border border-slate-200 bg-white p-2 inline-block max-w-full">
                  <Image
                    src={r2ManualPreview.url}
                    alt={
                      r2ManualPreview.title ||
                      r2ManualPreview.key ||
                      "R2 preview"
                    }
                    width={Math.max(1, Number(r2ManualPreview.width) || 640)}
                    height={Math.max(1, Number(r2ManualPreview.height) || 360)}
                    unoptimized
                    className="max-h-44 h-auto w-auto rounded"
                  />
                </div>
              )}
            </div>
          )}

          {r2ManualRegistry.length > 0 && (
            <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs space-y-1">
              <p className="font-semibold text-gray-700">
                {t("admin.mediaR2ManualSavedList", "Recently saved KV records")}
              </p>
              {r2ManualRegistry.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-800 break-all">
                      {item.title || item.key}
                    </p>
                    <p className="text-[10px] text-gray-500 break-all">
                      {item.key}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {item.url && (
                      <button
                        type="button"
                        onClick={() => onCopyUrl?.(item.url)}
                        className="px-2 py-0.5 rounded border text-[10px] hover:bg-gray-100"
                      >
                        {t("admin.bucketCopyUrl", "Copy URL")}
                      </button>
                    )}
                    {item.url && (
                      <button
                        type="button"
                        onClick={() => onOpenUrl?.(item.url)}
                        className="px-2 py-0.5 rounded border text-[10px] hover:bg-gray-100"
                      >
                        {t("admin.mediaHistoryView", "Open")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
