"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const scaled = value / (1024 ** exponent);
  const precision = scaled >= 100 || exponent === 0 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(precision)} ${units[exponent]}`;
}

function formatResolution(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return "—";
  }
  return `${w}×${h}`;
}

function formatUpdatedAt(iso) {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleString("sv-SE");
}

function sourceLabel(source) {
  return source === "wordpress" ? "WordPress" : source === "r2" ? "R2" : "—";
}

function sourceBadgeClass(source) {
  if (source === "wordpress") return "bg-blue-100 text-blue-800";
  if (source === "r2") return "bg-emerald-100 text-emerald-800";
  return "bg-gray-100 text-gray-700";
}

function canPreviewImage(item) {
  const mime = String(item?.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const url = String(item?.url || "");
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(url);
}

function isImageFile(file) {
  if (!(file instanceof File)) return false;
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(file.name || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name);
}

function normalizeEditorValue(value, max = 600) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function toEditorState(item) {
  const metadata = item?.metadata || {};
  const rights = item?.rights || {};
  return {
    title: normalizeEditorValue(metadata.title || item?.title || "", 200),
    caption: normalizeEditorValue(metadata.caption || "", 300),
    description: normalizeEditorValue(metadata.description || "", 600),
    altText: normalizeEditorValue(metadata.altText || "", 300),
    tooltip: normalizeEditorValue(metadata.tooltip || "", 300),
    copyrightHolder: normalizeEditorValue(rights.copyrightHolder || "", 180),
    license: normalizeEditorValue(rights.license || "", 180),
  };
}

export default function AdminMediaLibraryTab({
  uploadBackend = "wordpress",
  uploadInfo = null,
}) {
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedUploadBackend, setSelectedUploadBackend] = useState("wordpress");
  const uploadInputRef = useRef(null);
  const dragDepthRef = useRef(0);

  const imageUploadOptions = useMemo(
    () => [
      {
        id: "wordpress",
        label: t("admin.uploadTargetWordpress"),
        enabled: true,
      },
      {
        id: "r2",
        label: t("admin.uploadTargetR2"),
        enabled: Boolean(uploadInfo?.r2),
      },
      ...(uploadInfo?.s3Enabled
        ? [
            {
              id: "s3",
              label: t("admin.uploadTargetS3"),
              enabled: Boolean(uploadInfo?.s3),
            },
          ]
        : []),
    ],
    [uploadInfo],
  );

  const enabledUploadOptions = useMemo(
    () => imageUploadOptions.filter((option) => option.enabled !== false),
    [imageUploadOptions],
  );

  const preferredUploadBackend = useMemo(
    () =>
      enabledUploadOptions.find((option) => option.id === "wordpress")?.id ||
      enabledUploadOptions.find((option) => option.id === uploadBackend)?.id ||
      enabledUploadOptions[0]?.id ||
      "wordpress",
    [enabledUploadOptions, uploadBackend],
  );

  useEffect(() => {
    const backendExists = enabledUploadOptions.some(
      (option) => option.id === selectedUploadBackend,
    );
    if (!backendExists) {
      setSelectedUploadBackend(preferredUploadBackend);
    }
  }, [enabledUploadOptions, preferredUploadBackend, selectedUploadBackend]);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "60" });
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (searchTerm) params.set("search", searchTerm);
      const response = await fetch(`/api/admin/media-library?${params.toString()}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            t("admin.mediaLibraryLoadFailed", "Failed to load the media library."),
        );
      }
      setItems(Array.isArray(json.items) ? json.items : []);
      setSources(json.sources || null);
      setWarnings(Array.isArray(json.warnings) ? json.warnings : []);
    } catch (fetchError) {
      setItems([]);
      setSources(null);
      setWarnings([]);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : t("admin.mediaLibraryLoadFailed", "Failed to load the media library."),
      );
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, searchTerm]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary, refreshToken]);

  const rows = useMemo(() => items, [items]);
  const selectedItem = useMemo(
    () => rows.find((item) => item.id === selectedId) || null,
    [rows, selectedId],
  );

  useEffect(() => {
    if (!selectedItem) return;
    setEditor((current) => current || toEditorState(selectedItem));
  }, [selectedItem]);

  async function copyUrl(url) {
    if (!url || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl(""), 1100);
    } catch {
      // Ignore clipboard errors in restricted environments.
    }
  }

  function openEditor(item) {
    setSelectedId(item.id);
    setEditor(toEditorState(item));
    setSaveError("");
    setSaveSuccess("");
  }

  function closeEditor() {
    setSelectedId("");
    setEditor(null);
    setSaveError("");
    setSaveSuccess("");
  }

  function suggestAnnotations() {
    setEditor((current) => {
      if (!current) return current;
      const seed = normalizeEditorValue(
        current.caption ||
          current.description ||
          current.title ||
          selectedItem?.title ||
          "",
        300,
      );
      if (!seed) return current;
      return {
        ...current,
        altText: current.altText || seed,
        tooltip: current.tooltip || seed,
      };
    });
  }

  async function saveAnnotations() {
    if (!selectedItem || !editor || saveLoading) return;
    setSaveLoading(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const payload = {
        source: selectedItem.source,
        sourceId: selectedItem.sourceId,
        key: selectedItem.key,
        metadata: {
          title: normalizeEditorValue(editor.title, 200),
          caption: normalizeEditorValue(editor.caption, 300),
          description: normalizeEditorValue(editor.description, 600),
          altText: normalizeEditorValue(editor.altText, 300),
          tooltip: normalizeEditorValue(editor.tooltip, 300),
        },
        rights: {
          copyrightHolder: normalizeEditorValue(editor.copyrightHolder, 180),
          license: normalizeEditorValue(editor.license, 180),
        },
      };
      const response = await fetch("/api/admin/media-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error || t("admin.mediaMetaSaveFailed", "Failed to save media metadata."),
        );
      }
      setSaveSuccess(t("admin.mediaMetaSaved", "Metadata saved."));
      await loadLibrary();
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: t("admin.mediaMetaSaved", "Metadata saved.") },
        }),
      );
    } catch (saveMetadataError) {
      const message =
        saveMetadataError instanceof Error
          ? saveMetadataError.message
          : t("admin.mediaMetaSaveFailed", "Failed to save media metadata.");
      setSaveError(message);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "error", message },
        }),
      );
    } finally {
      setSaveLoading(false);
    }
  }

  function openUploadPicker() {
    const input = uploadInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  function extractImageFiles(sourceData) {
    if (!sourceData) return [];
    const fromFiles = Array.from(sourceData.files || []);
    if (fromFiles.length > 0) {
      return fromFiles.filter((file) => isImageFile(file));
    }
    const files = [];
    const items = Array.from(sourceData.items || []);
    for (const item of items) {
      if (!item || item.kind !== "file") continue;
      const file = item.getAsFile?.();
      if (!isImageFile(file)) continue;
      files.push(file);
    }
    return files;
  }

  async function uploadImageFiles(files) {
    if (uploading) return;
    const list = Array.from(files || []).filter((file) => file instanceof File);
    if (list.length === 0) return;

    const oversized = list.filter((file) => file.size > MAX_IMAGE_BYTES);
    const valid = list.filter((file) => file.size <= MAX_IMAGE_BYTES);
    if (valid.length === 0) {
      setUploadStatus("");
      setUploadError(
        oversized.length > 0
          ? t("admin.mediaUploadTooLarge", { mb: 20 })
          : t("admin.uploadImageTypeInvalid"),
      );
      return;
    }

    setUploading(true);
    setUploadCount(valid.length);
    setUploadError("");
    setUploadStatus(t("admin.mediaUploadUploading", { n: valid.length }));
    let succeeded = 0;
    const errors = [];

    for (const file of valid) {
      try {
        const formData = new FormData();
        formData.append("file", file, file.name || "media-image.png");
        const query = new URLSearchParams({ kind: "image" });
        if (selectedUploadBackend) {
          query.set("backend", selectedUploadBackend);
        }
        const response = await fetch(`/api/admin/upload?${query.toString()}`, {
          method: "POST",
          body: formData,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.ok) {
          throw new Error(json?.error || t("admin.mediaUploadFailed"));
        }
        succeeded += 1;
      } catch (uploadSingleError) {
        errors.push(
          uploadSingleError instanceof Error
            ? uploadSingleError.message
            : t("admin.mediaUploadFailed"),
        );
      }
    }

    const skipped = oversized.length;
    const failed = errors.length;
    const total = valid.length + skipped;

    if (succeeded > 0) {
      const successText =
        failed > 0 || skipped > 0
          ? t("admin.mediaUploadPartial", {
              ok: succeeded,
              total,
            })
          : t("admin.mediaUploadDone", { n: succeeded });
      setUploadStatus(successText);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: successText },
        }),
      );
      setRefreshToken((value) => value + 1);
    } else {
      setUploadStatus("");
    }

    if (failed > 0 || skipped > 0) {
      const parts = [];
      if (failed > 0) {
        parts.push(t("admin.mediaUploadFailed"));
      }
      if (skipped > 0) {
        parts.push(t("admin.mediaUploadTooLarge", { mb: 20 }));
      }
      if (errors[0]) {
        parts.push(errors[0]);
      }
      const message = parts.filter(Boolean).join(" ");
      setUploadError(message);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "error", message },
        }),
      );
    } else {
      setUploadError("");
    }

    setUploading(false);
    setUploadCount(0);
  }

  function handleUploadInputChange(event) {
    const files = extractImageFiles(event.currentTarget);
    uploadImageFiles(files);
  }

  function handleDropZonePaste(event) {
    const files = extractImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    uploadImageFiles(files);
  }

  function handleDropZoneDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }

  function handleDropZoneDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }

  function handleDropZoneDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDropZoneDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    const files = extractImageFiles(event.dataTransfer);
    if (files.length === 0) {
      setUploadError(t("admin.uploadImageTypeInvalid"));
      return;
    }
    uploadImageFiles(files);
  }

  return (
    <div className="border rounded p-5 space-y-4 bg-white min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            {t("admin.navMedia", "Media")}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t(
              "admin.mediaLibrarySummary",
              "Combined library from WordPress media and Cloudflare R2.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshToken((value) => value + 1)}
          disabled={loading}
          className="px-3 py-2 rounded border hover:bg-gray-50 text-sm disabled:opacity-50"
        >
          {t("admin.mediaRefresh", "Refresh")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: t("admin.mediaAllSources", "All sources") },
          { id: "wordpress", label: "WordPress" },
          { id: "r2", label: "R2" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSourceFilter(option.id)}
            className={`px-3 py-1.5 rounded border text-sm ${
              sourceFilter === option.id
                ? "border-purple-500 bg-purple-50 text-purple-800"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSearchTerm(searchInput.trim());
        }}
      >
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t(
            "admin.mediaSearchPlaceholder",
            "Search by filename, key, or URL",
          )}
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded border hover:bg-gray-50 text-sm"
        >
          {t("admin.mediaSearch", "Search")}
        </button>
      </form>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUploadInputChange}
        className="absolute -left-[10000px] top-auto h-px w-px opacity-0"
      />

      <div className="space-y-2">
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
          className={`rounded border-2 border-dashed p-4 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 ${
            isDragActive
              ? "border-purple-500 bg-purple-50"
              : "border-gray-300 bg-gray-50 hover:bg-gray-100"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-800">
                {t("admin.mediaDropzoneTitle", "Upload new images")}
              </p>
              <p className="text-xs text-gray-600">
                {isDragActive
                  ? t("admin.mediaDropzoneActive", "Drop image files to upload now.")
                  : t(
                      "admin.mediaDropzoneHint",
                      "Drag and drop image files here, or click to select files.",
                    )}
              </p>
              <p className="text-xs text-gray-500">
                {t(
                  "admin.mediaDropzonePasteHint",
                  "Paste also works: click this area and press Ctrl/Cmd+V.",
                )}
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
              {t("admin.mediaChooseFiles", "Choose images")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {enabledUploadOptions.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <span>{t("admin.uploadDestinationTitle", "Upload destination")}</span>
              <select
                value={selectedUploadBackend}
                onChange={(event) => setSelectedUploadBackend(event.target.value)}
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
        {uploadError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {uploadError}
          </p>
        )}
      </div>

      {sources && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`px-2 py-1 rounded ${sources.wordpress?.ok ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}
          >
            WordPress: {sources.wordpress?.count ?? 0}
          </span>
          <span
            className={`px-2 py-1 rounded ${sources.r2?.ok ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
          >
            R2: {sources.r2?.count ?? 0}
          </span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-sm text-gray-500">{t("common.loading", "Loading…")}</p>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="text-sm text-gray-500">
          {t(
            "admin.mediaLibraryEmpty",
            "No media files matched this filter.",
          )}
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">{t("admin.preview", "Preview")}</th>
                <th className="text-left px-3 py-2">{t("common.name", "Name")}</th>
                <th className="text-left px-3 py-2">{t("admin.source", "Source")}</th>
                <th className="text-left px-3 py-2">{t("admin.fileType", "File type")}</th>
                <th className="text-left px-3 py-2">{t("admin.bucketSize", "Size")}</th>
                <th className="text-left px-3 py-2">{t("admin.resolution", "Resolution")}</th>
                <th className="text-left px-3 py-2">{t("admin.bucketLastModified", "Updated")}</th>
                <th className="text-left px-3 py-2">
                  {t("admin.mediaMetadata", "Metadata")}
                </th>
                <th className="text-left px-3 py-2">{t("admin.fileUrl", "URL")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-t align-top">
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
                      <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">
                        {item.fileType || "FILE"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-800 break-all">
                      {item.title || "—"}
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
                  <td className="px-3 py-2 text-gray-700">{item.fileType || "—"}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {formatBytes(item.sizeBytes)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {formatResolution(item.width, item.height)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {formatUpdatedAt(item.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1 text-xs">
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
                      <button
                        type="button"
                        onClick={() => openEditor(item)}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        {t("admin.mediaAnnotate", "Annotate")}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-purple-700 hover:underline break-all"
                      >
                        {item.url}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyUrl(item.url)}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      >
                        {copiedUrl === item.url
                          ? t("admin.clientCopied", "Copied")
                          : t("admin.bucketCopyUrl", "Copy URL")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedItem && editor && (
        <div className="rounded border bg-gray-50 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                {t("admin.mediaAnnotate", "Annotate")}
              </h3>
              <p className="text-xs text-gray-500 break-all">
                {selectedItem.title || selectedItem.url}
              </p>
              <p className="text-xs text-gray-500">
                {t(
                  "admin.mediaAnnotateHint",
                  "Manage caption, alt text, tooltip, and rights metadata for this asset.",
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={closeEditor}
              className="px-3 py-1.5 rounded border text-xs hover:bg-gray-100"
            >
              {t("common.close", "Close")}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("common.name", "Name")}</span>
              <input
                type="text"
                value={editor.title}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.imageLicenseLabel", "License")}</span>
              <input
                type="text"
                value={editor.license}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    license: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600 md:col-span-2">
              <span>{t("admin.imageCaption", "Caption")}</span>
              <input
                type="text"
                value={editor.caption}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    caption: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.imageAltText", "Alt text")}</span>
              <input
                type="text"
                value={editor.altText}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    altText: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.imageTooltip", "Tooltip")}</span>
              <input
                type="text"
                value={editor.tooltip}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    tooltip: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600 md:col-span-2">
              <span>{t("admin.imageDescription", "Description")}</span>
              <textarea
                value={editor.description}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>{t("admin.imageCopyrightHolderLabel", "Copyright holder")}</span>
              <input
                type="text"
                value={editor.copyrightHolder}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    copyrightHolder: event.target.value,
                  }))
                }
                className="w-full border rounded px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
          </div>

          {saveError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
              {saveSuccess}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={suggestAnnotations}
              className="px-3 py-1.5 rounded border text-xs hover:bg-gray-100"
            >
              {t("admin.mediaSuggestAlt", "Suggest alt/tooltip")}
            </button>
            <button
              type="button"
              onClick={saveAnnotations}
              disabled={saveLoading}
              className="px-3 py-1.5 rounded bg-gray-800 text-white text-xs hover:bg-gray-700 disabled:opacity-50"
            >
              {saveLoading
                ? t("admin.mediaSavingMetadata", "Saving…")
                : t("admin.mediaSaveMetadata", "Save metadata")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
