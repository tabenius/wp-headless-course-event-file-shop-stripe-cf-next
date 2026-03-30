"use client";

import { t } from "@/lib/i18n";
import {
  canOpenDataViewer,
  canPreviewImage,
  formatBytes,
  formatResolution,
  formatUpdatedAt,
  resolveAssetType,
  sourceLabel,
} from "@/lib/mediaLibraryHelpers";

export default function SelectedAssetPanel({
  focusedItem,
  focusedAssetLineage,
  focusedAssetSupportsDerivations,
  availableDerivations,
  activeAssetFlow,
  onActivateDetailsFlow,
  onOpenDerivationFlow,
  onClearFocus,
  onFocusItemById,
  onCopyUrl,
  onOpenViewer,
  onOpenEditor,
}) {
  if (!focusedItem) return null;

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4 text-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-800">
            {t("admin.mediaSelectedAsset", "Selected asset")}
          </p>
          <p className="text-[11px] text-slate-700 break-all">
            {focusedItem.title || focusedItem.key || focusedItem.url}
          </p>
          {focusedAssetSupportsDerivations && availableDerivations.length > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 rounded border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={onActivateDetailsFlow}
                className={`rounded px-2 py-1 text-[11px] ${
                  activeAssetFlow === "details"
                    ? "admin-pill-active"
                    : "admin-pill"
                }`}
              >
                {t("admin.mediaAssetDetailsFlow", "Asset details")}
              </button>
              <button
                type="button"
                onClick={onOpenDerivationFlow}
                className={`rounded px-2 py-1 text-[11px] ${
                  activeAssetFlow === "derivation"
                    ? "admin-pill-active"
                    : "admin-pill"
                }`}
              >
                {t("admin.mediaApplyDerivation", "Apply derivation")}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClearFocus}
          className="px-3 py-1 rounded border text-[11px] hover:bg-slate-100 text-slate-700"
        >
          {t("common.clear", "Clear")}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <p className="text-slate-700">
          {t("admin.mediaTypeLabel", "Type")}: {resolveAssetType(focusedItem)}
        </p>
        <p className="text-slate-700">
          {t("admin.source", "Source")}: {sourceLabel(focusedItem.source)}
        </p>
        <p className="text-slate-700">
          {t("admin.bucketSize", "Size")}: {formatBytes(focusedItem.sizeBytes)}
        </p>
        <p className="text-slate-700">
          {t("admin.resolution", "Resolution")}:{" "}
          {formatResolution(focusedItem.width, focusedItem.height)}
        </p>
        <p className="text-slate-700">
          {t("admin.bucketLastModified", "Updated")}: {formatUpdatedAt(focusedItem.updatedAt)}
        </p>
        {focusedItem.source === "wordpress" && focusedItem.sourceId && (
          <p className="text-slate-700">
            {t("admin.mediaWordPressId", "WordPress ID")}: {focusedItem.sourceId}
          </p>
        )}
      </div>
      {focusedAssetLineage.hasLineage && (
        <div className="rounded border border-slate-200 bg-white/70 p-2 space-y-2">
          <div>
            <p className="text-[11px] font-semibold text-slate-800">
              {t("admin.mediaAssetLineageTitle", "Asset lineage")}
            </p>
            <p className="text-[11px] text-slate-700">
              {t(
                "admin.mediaAssetLineageHint",
                "Jump between original and variant attachments that share the same asset ID.",
              )}
            </p>
          </div>
          {(focusedAssetLineage.original?.item ||
            focusedAssetLineage.original?.url) && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-slate-800">
                {t("admin.mediaAssetOriginal", "Original")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {focusedAssetLineage.original.item ? (
                  <button
                    type="button"
                    onClick={() =>
                      onFocusItemById(focusedAssetLineage.original.item.id)
                    }
                    className="admin-pill px-2 py-1 rounded border text-[11px]"
                  >
                    {focusedAssetLineage.original.item.title ||
                      `${t("admin.mediaWordPressId", "WordPress ID")} #${focusedAssetLineage.original.item.sourceId}`}
                  </button>
                ) : (
                  <a
                    href={focusedAssetLineage.original.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-slate-700 hover:underline break-all"
                  >
                    {focusedAssetLineage.original.url}
                  </a>
                )}
              </div>
            </div>
          )}
          {focusedAssetLineage.variants.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-slate-800">
                {t("admin.mediaAssetVariants", "Variants")} (
                {focusedAssetLineage.variants.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {focusedAssetLineage.variants.map((variant) => {
                  const isCurrent =
                    variant.sourceId != null &&
                    Number(variant.sourceId) === Number(focusedItem.sourceId);
                  const labelParts = [
                    variant.variantKind || t("admin.mediaVariant", "Variant"),
                    variant.format || "",
                    variant.sourceId != null
                      ? `#${variant.sourceId}`
                      : "",
                    isCurrent ? t("admin.mediaCurrent", "current") : "",
                  ].filter(Boolean);
                  const label = labelParts.join(" · ");
                  if (variant.linkedItem) {
                    return (
                      <button
                        key={variant.key}
                        type="button"
                        onClick={() => onFocusItemById(variant.linkedItem.id)}
                        className={`px-2 py-1 rounded border text-[11px] ${
                          isCurrent
                            ? "admin-pill-active"
                            : "admin-pill"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  }
                  if (variant.url) {
                    return (
                      <a
                        key={variant.key}
                        href={variant.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`px-2 py-1 rounded border text-[11px] ${
                          isCurrent
                            ? "admin-pill-active"
                            : "admin-pill"
                        }`}
                      >
                        {label}
                      </a>
                    );
                  }
                  return (
                    <span
                      key={variant.key}
                      className={`px-2 py-1 rounded border text-[11px] ${
                        isCurrent
                          ? "admin-pill-active"
                          : "admin-pill"
                      }`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCopyUrl(focusedItem.url)}
          className="px-3 py-1.5 rounded border text-[11px] hover:bg-slate-100 text-slate-700"
        >
          {t("admin.bucketCopyUrl", "Copy URL")}
        </button>
        {(canOpenDataViewer(focusedItem) || canPreviewImage(focusedItem)) && (
          <button
            type="button"
            onClick={() => onOpenViewer(focusedItem)}
            className="px-3 py-1.5 rounded border text-[11px] hover:bg-slate-100 text-slate-700"
          >
            {t("admin.mediaViewFile", "View")}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenEditor(focusedItem)}
          className="px-3 py-1.5 rounded border text-[11px] hover:bg-slate-100 text-slate-700"
        >
          {t("admin.mediaAnnotate", "Annotate")}
        </button>
      </div>
    </div>
  );
}
