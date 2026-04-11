import { t } from "@/lib/i18n";
import {
  canOpenDataViewer,
  canPreviewImage,
  formatBytes,
  formatResolution,
  formatUpdatedAt,
  isNewAsset,
  normalizeEditorValue,
  sourceBadgeClass,
  sourceLabel,
} from "@/lib/mediaLibraryHelpers";
import FilePreviewTile from "@/components/admin/media-library/FilePreviewTile";

function CopyIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function MediaLibraryTable({
  rows,
  focusedItemId,
  setFocusedItemId,
  handleMediaTableKeyDown,
  resolveAssetLineageRole,
  hasDerivationsForItem,
  registerMediaRowRef,
  flashFocusedItemId,
  lastOpenedAt,
  openViewer,
  productAssetIds,
  creatingProductFromAsset,
  createProductFromAsset,
  openEditor,
  openDerivationFlow,
  focusedAssetLineage,
  focusItemById,
  setShowFocusedLineageOnly,
  showFocusedLineageOnly,
  copyUrl,
  copiedUrl,
}) {
  if (rows.length === 0) return null;

  return (
    <div
      className="overflow-auto border rounded focus:outline-none focus:ring-2 focus:ring-slate-500"
      tabIndex={0}
      onFocus={() => {
        if (!focusedItemId && rows.length > 0) {
          setFocusedItemId(rows[0].id);
        }
      }}
      onKeyDown={handleMediaTableKeyDown}
      aria-label={t(
        "admin.mediaTableAriaLabel",
        "Asset table. Use arrow keys to move, Enter to open, A to annotate, C to copy URL.",
      )}
    >
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
          <tr>
            <th className="text-left px-3 py-2">
              <span className="sr-only">{t("admin.preview", "Preview")}</span>
            </th>
            <th className="text-left px-3 py-2">{t("common.name", "Name")}</th>
            <th className="text-left px-3 py-2">{t("admin.source", "Source")}</th>
            <th className="text-left px-3 py-2">{t("admin.fileType", "File type")}</th>
            <th className="text-left px-3 py-2">{t("admin.bucketSize", "Size")}</th>
            <th className="text-left px-3 py-2">{t("admin.resolution", "Resolution")}</th>
            <th className="text-left px-3 py-2">{t("admin.bucketLastModified", "Updated")}</th>
            <th className="text-left px-3 py-2">{t("admin.mediaMetadata", "Metadata")}</th>
            <th className="text-left px-3 py-2">{t("admin.fileUrl", "URL")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const isFocusedRow = focusedItemId === item.id;
            const rowLineageRole = resolveAssetLineageRole(item);
            const rowVariantKind = normalizeEditorValue(
              item?.asset?.variantKind || "",
              80,
            );
            const rowCanOpenDerivation = hasDerivationsForItem(item);
            return (
              <tr
                key={item.id}
                ref={(node) => registerMediaRowRef(item.id, node)}
                onClick={() => setFocusedItemId(item.id)}
                className={`border-t align-top cursor-pointer transition-colors ${
                  isFocusedRow
                    ? "bg-blue-700 text-white [&_p]:!text-blue-100 [&_td]:!text-blue-100 ring-1 ring-inset ring-blue-300"
                    : flashFocusedItemId === item.id
                      ? "bg-emerald-50"
                      : "hover:bg-gray-50"
                }`}
              >
                <td className="px-3 py-2">
                  {canPreviewImage(item) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt=""
                      className="h-12 w-12 rounded border object-cover bg-gray-100"
                      loading="lazy"
                    />
                  ) : (
                    <FilePreviewTile item={item} />
                  )}
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-800 break-all flex flex-wrap items-baseline gap-1.5">
                    <span>{item.title || "—"}</span>
                    {isNewAsset(item.updatedAt, lastOpenedAt) && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 leading-none">
                        {t("admin.mediaNewBadge", "New")}
                      </span>
                    )}
                  </p>
                  {item.key && (
                    <p className="text-xs text-gray-500 break-all">{item.key}</p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${sourceBadgeClass(item.source)}`}
                  >
                    {sourceLabel(item.source)}
                  </span>
                </td>
                <td className="px-3 py-2 text-[11px] text-gray-600 font-medium">
                  {item.fileType || "—"}
                </td>
                <td className="px-3 py-2 text-[11px] text-gray-600 font-medium tabular-nums whitespace-nowrap">
                  {formatBytes(item.sizeBytes)}
                </td>
                <td className="px-3 py-2 text-[11px] text-gray-600 font-medium tabular-nums whitespace-nowrap">
                  {formatResolution(item.width, item.height)}
                </td>
                <td className="px-3 py-2">
                  <span className="whitespace-nowrap tabular-nums text-[11px] uppercase font-medium text-gray-600 tracking-wide">
                    {formatUpdatedAt(item.updatedAt)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="space-y-1 text-xs">
                    {rowLineageRole !== "untracked" && (
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-700">
                        {rowLineageRole === "derived"
                          ? t("admin.mediaLineageDerived", "Derived")
                          : t("admin.mediaLineageOriginal", "Original")}
                        {rowLineageRole === "derived" &&
                          rowVariantKind &&
                          rowVariantKind.toLowerCase() !== "original" && (
                            <span className="ml-1 normal-case font-medium">
                              {rowVariantKind}
                            </span>
                          )}
                      </span>
                    )}
                    {(item.metadata?.altText || item.metadata?.caption) && (
                      <p className="text-gray-700 line-clamp-2">
                        {item.metadata?.altText || item.metadata?.caption}
                      </p>
                    )}
                    {(item.rights?.copyrightHolder || item.rights?.license) && (
                      <p className="text-gray-500 line-clamp-2">
                        {[item.rights?.copyrightHolder, item.rights?.license]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {canOpenDataViewer(item) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openViewer(item);
                        }}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        {t("admin.mediaViewFile", "View")}
                      </button>
                    )}
                    {(() => {
                      const assetProduct = productAssetIds.get(item.asset?.assetId);
                      if (assetProduct) {
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.dispatchEvent(
                                new CustomEvent("admin:switchTab", {
                                  detail: "products",
                                }),
                              );
                              setTimeout(() => {
                                window.dispatchEvent(
                                  new CustomEvent("admin:selectProduct", {
                                    detail: { slug: assetProduct.slug },
                                  }),
                                );
                              }, 200);
                            }}
                            className="text-xs px-2 py-1 rounded border bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 font-medium"
                            title={`${assetProduct.name || assetProduct.slug}${assetProduct.active ? "" : ` (${t("common.inactive", "inactive")})`}`}
                          >
                            {t("admin.mediaGoToProduct", "Product")} ↗
                          </button>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            createProductFromAsset(item);
                          }}
                          disabled={creatingProductFromAsset}
                          className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creatingProductFromAsset
                            ? t("common.loading", "Loading…")
                            : t(
                                "admin.mediaCreateProductFromAsset",
                                "Create product",
                              )}
                        </button>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor(item);
                      }}
                      className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                    >
                      {t("admin.mediaAnnotate", "Annotate")}
                    </button>
                    {rowCanOpenDerivation && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDerivationFlow(item);
                        }}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        {t("admin.mediaApplyDerivation", "Apply derivation")}
                      </button>
                    )}
                    {isFocusedRow && focusedAssetLineage.hasLineage && (
                      <div className="rounded border border-slate-200 bg-slate-50 p-2 space-y-1">
                        <p className="text-[11px] font-semibold text-slate-700">
                          {t("admin.mediaAssetLineageTitle", "Asset lineage")}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {focusedAssetLineage.original?.item &&
                            focusedAssetLineage.original.item.id !== item.id && (
                              <button
                                type="button"
                                onClick={() =>
                                  focusItemById(
                                    focusedAssetLineage.original.item.id,
                                  )
                                }
                                className="admin-pill px-2 py-1 rounded border text-[11px]"
                              >
                                {t("admin.mediaAssetOriginal", "Original")}
                              </button>
                            )}
                          {focusedAssetLineage.variants
                            .filter(
                              (variant) =>
                                variant?.linkedItem?.id &&
                                variant.linkedItem.id !== item.id,
                            )
                            .map((variant) => (
                              <button
                                key={variant.key}
                                type="button"
                                onClick={() => focusItemById(variant.linkedItem.id)}
                                className="admin-pill px-2 py-1 rounded border text-[11px]"
                              >
                                {variant.variantKind ||
                                  t("admin.mediaVariant", "Variant")}
                              </button>
                            ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setShowFocusedLineageOnly((current) => !current)
                          }
                          className={`text-[11px] px-2 py-1 rounded border ${
                            showFocusedLineageOnly
                              ? "admin-pill-active"
                              : "admin-pill"
                          }`}
                        >
                          {showFocusedLineageOnly
                            ? t("admin.mediaLineageAllRows", "Show all assets")
                            : t("admin.mediaLineageOnly", "Show lineage only")}
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-start gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyUrl(item.url);
                      }}
                      className="inline-flex items-center justify-center shrink-0 text-xs px-1.5 py-1 rounded border hover:bg-gray-50 mt-px"
                      aria-label={
                        copiedUrl === item.url
                          ? t("admin.clientCopied", "Copied")
                          : t("admin.bucketCopyUrl", "Copy URL")
                      }
                      title={
                        copiedUrl === item.url
                          ? t("admin.clientCopied", "Copied")
                          : t("admin.bucketCopyUrl", "Copy URL")
                      }
                    >
                      <CopyIcon
                        className={`h-3.5 w-3.5 ${
                          copiedUrl === item.url ? "text-emerald-700" : ""
                        }`}
                      />
                      <span className="sr-only">
                        {copiedUrl === item.url
                          ? t("admin.clientCopied", "Copied")
                          : t("admin.bucketCopyUrl", "Copy URL")}
                      </span>
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-slate-600 hover:underline break-all leading-snug"
                    >
                      {item.url}
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
