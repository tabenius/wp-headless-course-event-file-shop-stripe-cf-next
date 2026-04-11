import { t } from "@/lib/i18n";
import {
  MAX_IMAGE_MB,
  MAX_DATA_MB,
  canPreviewImage,
  sourceLabel,
} from "@/lib/mediaLibraryHelpers";
import R2ConnectionPanel from "@/components/admin/R2ConnectionPanel";
import FilePreviewTile from "@/components/admin/media-library/FilePreviewTile";

function CopyIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M5 15V7a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

export default function MediaUploadPanel({
  uploadInputRef,
  handleUploadInputChange,
  enabledUploadOptions,
  selectedUploadBackend,
  setSelectedUploadBackend,
  uploading,
  uploadCount,
  uploadStatus,
  uploadBackend,
  uploadInfo,
  uploadInfoDetails,
  openUploadPicker,
  handleDropZonePaste,
  handleDropZoneDragEnter,
  handleDropZoneDragLeave,
  handleDropZoneDragOver,
  handleDropZoneDrop,
  isDragActive,
  uploadError,
  uploadHistory,
  setUploadHistory,
  setFlashFocusedItemId,
  focusItemById,
  historyStatusLabel,
  formatHistoryTimestamp,
  copyUrl,
  openHistoryUrl,
}) {
  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        onChange={handleUploadInputChange}
        className="absolute -left-[10000px] top-auto h-px w-px opacity-0"
      />

      <div className="space-y-2 font-sans">
        <div className="flex flex-wrap items-center gap-2">
          {enabledUploadOptions.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <span>
                {t("admin.uploadDestinationTitle", "Upload destination")}
              </span>
              <select
                value={selectedUploadBackend}
                onChange={(event) =>
                  setSelectedUploadBackend(event.target.value)
                }
                className="border rounded px-2 py-1 text-xs bg-white"
              >
                {enabledUploadOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {uploading && (
            <span className="text-xs text-gray-600">
              {t("admin.mediaUploadUploading", { n: uploadCount || 1 })}
            </span>
          )}
          {uploadStatus && !uploading && (
            <span className="text-xs text-emerald-700">{uploadStatus}</span>
          )}
        </div>

        <details className="rounded border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-800">
            {t(
              "admin.mediaExternalUploadToggle",
              "Upload using external software",
            )}
          </summary>
          <div className="border-t border-slate-200 px-3 py-3">
            <R2ConnectionPanel
              uploadBackend={uploadBackend}
              uploadInfo={uploadInfo}
              uploadInfoDetails={uploadInfoDetails}
            />
          </div>
        </details>

        <div
          role="button"
          tabIndex={0}
          onClick={openUploadPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openUploadPicker();
            }
          }}
          onPaste={handleDropZonePaste}
          onDragEnter={handleDropZoneDragEnter}
          onDragLeave={handleDropZoneDragLeave}
          onDragOver={handleDropZoneDragOver}
          onDrop={handleDropZoneDrop}
          className={`rounded border-2 border-dashed p-4 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-500 ${
            isDragActive
              ? "border-slate-500 bg-slate-50"
              : "border-gray-300 bg-gray-50 hover:bg-gray-100"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-800">
                {t("admin.mediaDropzoneTitle", "Upload media assets")}
              </p>
              <p className="text-xs text-gray-600">
                {isDragActive
                  ? t("admin.mediaDropzoneActive", "Drop files to upload now.")
                  : t(
                      "admin.mediaDropzoneHint",
                      "Drag and drop files here, or click to select files.",
                    )}
              </p>
              <p className="text-xs text-gray-500">
                {t(
                  "admin.mediaDropzonePasteHint",
                  "Paste also works for images: click this area and press Ctrl/Cmd+V.",
                )}
              </p>
              <p className="text-[11px] text-gray-500">
                {t("admin.mediaUploadLimits", {
                  imageMb: MAX_IMAGE_MB,
                  dataMb: MAX_DATA_MB,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openUploadPicker();
              }}
              disabled={uploading}
              className="px-3 py-1.5 rounded border text-xs hover:bg-gray-100 disabled:opacity-50"
            >
              {t("admin.mediaChooseFiles", "Choose files")}
            </button>
          </div>
        </div>

        {uploadError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {uploadError}
          </p>
        )}

        {uploadHistory.length > 0 && (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">
                {t("admin.mediaRecentUploads", "Recent uploads")}
              </p>
              <button
                type="button"
                onClick={() => setUploadHistory([])}
                className="text-[11px] text-gray-500 hover:text-gray-700"
              >
                {t("admin.mediaRecentUploadsClear", "Clear")}
              </button>
            </div>
            <div className="space-y-1">
              {uploadHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex items-start gap-2">
                    {entry.status === "uploaded" && entry.url ? (
                      canPreviewImage(entry) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.url}
                          alt=""
                          className="h-10 w-10 rounded border object-cover bg-gray-100 shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <FilePreviewTile item={entry} compact />
                      )
                    ) : null}
                    <div className="min-w-0">
                      {entry.itemId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setFlashFocusedItemId(entry.itemId);
                            focusItemById(entry.itemId);
                          }}
                          className="text-xs font-medium text-slate-800 break-all hover:underline text-left"
                        >
                          {entry.name}
                        </button>
                      ) : (
                        <p className="text-xs font-medium text-gray-800 break-all">
                          {entry.name}
                        </p>
                      )}
                      <p className="text-[11px] text-gray-500">
                        <span className="font-semibold">
                          {historyStatusLabel(entry.status)}
                        </span>
                        {entry.detail && ` · ${entry.detail}`}
                        {entry.backend && ` · ${sourceLabel(entry.backend)}`}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {formatHistoryTimestamp(entry.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {entry.itemId && (
                      <button
                        type="button"
                        onClick={() => {
                          setFlashFocusedItemId(entry.itemId);
                          focusItemById(entry.itemId);
                        }}
                        className="px-2 py-0.5 rounded border text-[11px] text-gray-600 hover:bg-gray-100"
                      >
                        {t("admin.mediaLocate", "Locate")}
                      </button>
                    )}
                    {entry.url && (
                      <button
                        type="button"
                        onClick={() => copyUrl(entry.url)}
                        className="inline-flex items-center justify-center px-1.5 py-1 rounded border text-[11px] text-gray-600 hover:bg-gray-100"
                        aria-label={t("admin.bucketCopyUrl", "Copy URL")}
                        title={t("admin.bucketCopyUrl", "Copy URL")}
                      >
                        <CopyIcon className="h-3.5 w-3.5" />
                        <span className="sr-only">
                          {t("admin.bucketCopyUrl", "Copy URL")}
                        </span>
                      </button>
                    )}
                    {entry.url && (
                      <button
                        type="button"
                        onClick={() => openHistoryUrl(entry.url)}
                        className="px-2 py-0.5 rounded border text-[11px] text-gray-600 hover:bg-gray-100"
                      >
                        {t("admin.mediaHistoryView", "Open")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
