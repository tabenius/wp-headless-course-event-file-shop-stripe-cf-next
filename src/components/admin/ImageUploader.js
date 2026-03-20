"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { SIZE_PRESETS } from "@/lib/imageQuota";

const DEFAULT_ASPECT_KEY = "portrait-4-5";
const UPLOADER_ASPECT_KEYS = [
  "portrait-4-5",
  "square",
  "portrait-3-4",
  "landscape-16-9",
  "story-9-16",
];

const ASPECT_LABEL_KEYS = {
  "portrait-4-5": "admin.imageSizePortrait45",
  square: "admin.imageSizeSquare",
  "portrait-3-4": "admin.imageSizePortrait34",
  "landscape-16-9": "admin.imageSizeLandscape169",
  "story-9-16": "admin.imageSizeStory916",
};

const PREVIEW_MAX = 320;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
const DEFAULT_OUTPUT_FORMAT = "webp";
const OUTPUT_FORMATS = ["webp", "avif", "raw"];
const OUTPUT_EXTENSIONS = {
  webp: "webp",
  avif: "avif",
  raw: "png",
};
const OUTPUT_MIME_TYPES = {
  webp: "image/webp",
  avif: "image/avif",
  raw: "image/png",
};
const OUTPUT_QUALITY = {
  webp: 0.86,
  avif: 0.82,
  raw: 1,
};

function resolveAspectSize(key) {
  return SIZE_PRESETS[key] || SIZE_PRESETS[DEFAULT_ASPECT_KEY] || SIZE_PRESETS.square;
}

function computePreviewFrame(size) {
  if (!size?.width || !size?.height) return { width: PREVIEW_MAX, height: PREVIEW_MAX };
  if (size.width >= size.height) {
    return {
      width: PREVIEW_MAX,
      height: Math.max(1, Math.round((size.height / size.width) * PREVIEW_MAX)),
    };
  }
  return {
    width: Math.max(1, Math.round((size.width / size.height) * PREVIEW_MAX)),
    height: PREVIEW_MAX,
  };
}

function isImageMediaItem(item) {
  const mime = String(item?.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const url = String(item?.url || "");
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(url);
}

function drawCroppedImage({
  canvas,
  image,
  frameWidth,
  frameHeight,
  scale,
  offsetX,
  offsetY,
}) {
  const ctx = canvas?.getContext("2d");
  if (!ctx || !image) return;

  canvas.width = frameWidth;
  canvas.height = frameHeight;
  ctx.clearRect(0, 0, frameWidth, frameHeight);
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, frameWidth, frameHeight);

  const baseScale = Math.max(
    frameWidth / image.naturalWidth,
    frameHeight / image.naturalHeight,
  );
  const drawW = image.naturalWidth * baseScale * scale;
  const drawH = image.naturalHeight * baseScale * scale;
  const x = (frameWidth - drawW) / 2 + offsetX;
  const y = (frameHeight - drawH) / 2 + offsetY;
  ctx.drawImage(image, x, y, drawW, drawH);
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

/**
 * Image uploader with crop & scale preview.
 * Props:
 *   value         — current image URL
 *   onUploaded    — callback(url) after upload completes
 *   onError       — callback(message) on failure
 *   className     — wrapper class
 *   renderTrigger — optional (openFilePicker) => ReactNode to replace default UI
 */
export default function ImageUploader({
  value,
  onUploaded,
  onError,
  className = "",
  renderTrigger,
  uploadBackend = "wordpress",
  uploadOptions = [],
}) {
  const availableUploadOptions = (
    Array.isArray(uploadOptions) && uploadOptions.length > 0
      ? uploadOptions
      : [
          {
            id: "wordpress",
            label: t("admin.uploadTargetWordpress"),
            enabled: true,
          },
          ...(uploadBackend && uploadBackend !== "wordpress"
            ? [
                {
                  id: uploadBackend,
                  label:
                    uploadBackend === "r2"
                      ? t("admin.uploadTargetR2")
                      : uploadBackend === "s3"
                        ? t("admin.uploadTargetS3")
                        : uploadBackend,
                  enabled: true,
                },
              ]
            : []),
        ]
  )
    .filter((opt) => opt && typeof opt.id === "string")
    .filter((opt) => opt.enabled !== false);
  const preferredUploadBackend =
    availableUploadOptions.find((opt) => opt.id === "wordpress")?.id ||
    availableUploadOptions[0]?.id ||
    "wordpress";
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showSourceChooser, setShowSourceChooser] = useState(false);
  const [showMediaBrowser, setShowMediaBrowser] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaSearchInput, setMediaSearchInput] = useState("");
  const [mediaSearchTerm, setMediaSearchTerm] = useState("");
  const [selectedUploadBackend, setSelectedUploadBackend] = useState(
    preferredUploadBackend,
  );
  const [outputFormat, setOutputFormat] = useState(DEFAULT_OUTPUT_FORMAT);
  const [isDerivedWork, setIsDerivedWork] = useState(false);
  const [copyrightHolder, setCopyrightHolder] = useState("");
  const [license, setLicense] = useState("");
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [aspectKey, setAspectKey] = useState(DEFAULT_ASPECT_KEY);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const selectedSize = resolveAspectSize(aspectKey);
  const previewFrame = computePreviewFrame(selectedSize);
  const outputFormatOptions = OUTPUT_FORMATS.map((format) => ({
    id: format,
    label:
      format === "webp"
        ? t("admin.imageOutputFormatWebp")
        : format === "avif"
          ? t("admin.imageOutputFormatAvif")
          : t("admin.imageOutputFormatRaw"),
  }));

  useEffect(() => {
    setSelectedUploadBackend(preferredUploadBackend);
  }, [preferredUploadBackend]);

  const emitError = useCallback(
    (message) => {
      onError?.(message);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "error", message },
        }),
      );
    },
    [onError],
  );

  // Revoke blob URLs when preview changes or component unmounts.
  useEffect(
    () => () => {
      if (preview && preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview);
      }
    },
    [preview],
  );

  const handleFileChange = useCallback(
    (event) => {
      const input = event.currentTarget;
      const picked = input.files?.[0];
      if (!picked) return;
      if (!picked.type || !picked.type.startsWith("image/")) {
        emitError(t("admin.uploadImageTypeInvalid"));
        return;
      }
      if (picked.size > MAX_IMAGE_BYTES) {
        emitError(t("admin.uploadImageTooLarge", { mb: 20 }));
        return;
      }
      setFile(picked);
      setScale(1);
      setOffsetX(0);
      setOffsetY(0);
      setAspectKey(DEFAULT_ASPECT_KEY);
      setSelectedUploadBackend(preferredUploadBackend);
      setOutputFormat(DEFAULT_OUTPUT_FORMAT);
      setIsDerivedWork(false);
      setCopyrightHolder("");
      setLicense("");
      const url = URL.createObjectURL(picked);
      setPreview(url);
      setShowEditor(true);
    },
    [emitError, preferredUploadBackend],
  );

  const openLocalUploadPicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    // Use direct click for cross-browser reliability; showPicker can no-op
    // without throwing on some platforms.
    input.click();
  }, []);

  const openFilePicker = useCallback(() => {
    setShowSourceChooser(true);
  }, []);

  const loadMediaLibrary = useCallback(async () => {
    setMediaLoading(true);
    setMediaError("");
    try {
      const params = new URLSearchParams({ limit: "80", source: "all" });
      if (mediaSearchTerm.trim()) params.set("search", mediaSearchTerm.trim());
      const response = await fetch(`/api/admin/media-library?${params.toString()}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            t("admin.imageBrowseLibraryLoadFailed", "Failed to load media library."),
        );
      }
      const rows = Array.isArray(json.items) ? json.items : [];
      setMediaItems(rows.filter((item) => isImageMediaItem(item)));
    } catch (error) {
      setMediaItems([]);
      setMediaError(
        error instanceof Error
          ? error.message
          : t("admin.imageBrowseLibraryLoadFailed", "Failed to load media library."),
      );
    } finally {
      setMediaLoading(false);
    }
  }, [mediaSearchTerm]);

  useEffect(() => {
    if (!showMediaBrowser) return;
    loadMediaLibrary();
  }, [showMediaBrowser, loadMediaLibrary]);

  const chooseUploadNew = useCallback(() => {
    setShowSourceChooser(false);
    openLocalUploadPicker();
  }, [openLocalUploadPicker]);

  const chooseBrowseLibrary = useCallback(() => {
    setShowSourceChooser(false);
    setShowMediaBrowser(true);
  }, []);

  const closeMediaBrowser = useCallback(() => {
    setShowMediaBrowser(false);
    setMediaSearchInput("");
    setMediaSearchTerm("");
    setMediaError("");
    setMediaItems([]);
  }, []);

  const selectMediaImage = useCallback(
    (item) => {
      if (!item?.url) return;
      setShowMediaBrowser(false);
      setMediaSearchInput("");
      setMediaSearchTerm("");
      setMediaError("");
      setMediaItems([]);
      try {
        onUploaded?.(item.url, item.asset || null);
      } catch (error) {
        console.error("ImageUploader media selection callback failed:", error);
      }
    },
    [onUploaded],
  );

  useEffect(() => {
    if (!showEditor && !showMediaBrowser && !showSourceChooser) return undefined;
    function handleEscape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();

      if (showEditor) {
        setShowEditor(false);
        setPreview(null);
        setFile(null);
        setIsDerivedWork(false);
        setCopyrightHolder("");
        setLicense("");
        return;
      }
      if (showMediaBrowser) {
        closeMediaBrowser();
        return;
      }
      if (showSourceChooser) {
        setShowSourceChooser(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [
    showEditor,
    showMediaBrowser,
    showSourceChooser,
    closeMediaBrowser,
  ]);

  // Draw image on canvas whenever crop controls change.
  useEffect(() => {
    if (!showEditor || !preview) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!img || !img.complete) return;
    drawCroppedImage({
      canvas,
      image: img,
      frameWidth: previewFrame.width,
      frameHeight: previewFrame.height,
      scale,
      offsetX,
      offsetY,
    });
  }, [
    preview,
    scale,
    offsetX,
    offsetY,
    showEditor,
    previewFrame.width,
    previewFrame.height,
  ]);

  function handleImgLoad() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    drawCroppedImage({
      canvas,
      image: img,
      frameWidth: previewFrame.width,
      frameHeight: previewFrame.height,
      scale,
      offsetX,
      offsetY,
    });
  }

  function handleMouseDown(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const startOX = offsetX;
    const startOY = offsetY;

    function onMove(ev) {
      setOffsetX(startOX + (ev.clientX - startX) * sx);
      setOffsetY(startOY + (ev.clientY - startY) * sy);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const startOX = offsetX;
    const startOY = offsetY;

    function onMove(ev) {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      const t = ev.touches[0];
      setOffsetX(startOX + (t.clientX - startX) * sx);
      setOffsetY(startOY + (t.clientY - startY) * sy);
    }
    function onEnd() {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    }
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }

  async function canvasToBlob(canvas, mimeType, quality = 1) {
    const blob = await new Promise((resolve) =>
      canvas.toBlob((value) => resolve(value), mimeType, quality),
    );
    return blob || null;
  }

  async function uploadAssetStep({
    fileBlob,
    fileName,
    assetId,
    assetRole,
    assetFormat,
    variantKind = "",
    originalUrl = "",
    originalId = "",
    sourceHash = "",
    copyrightHolder = "",
    license = "",
    width = null,
    height = null,
  }) {
    const formData = new FormData();
    formData.append("file", fileBlob, fileName);
    formData.append("assetId", assetId);
    formData.append("assetRole", assetRole);
    formData.append("assetFormat", assetFormat);
    if (variantKind) formData.append("variantKind", variantKind);
    if (originalUrl) formData.append("originalUrl", originalUrl);
    if (originalId) formData.append("originalId", String(originalId));
    if (sourceHash) formData.append("sourceHash", sourceHash);
    if (copyrightHolder) formData.append("copyrightHolder", copyrightHolder);
    if (license) formData.append("license", license);
    if (Number.isFinite(width)) formData.append("width", String(width));
    if (Number.isFinite(height)) formData.append("height", String(height));

    const query = new URLSearchParams({ kind: "image" });
    if (selectedUploadBackend) {
      query.set("backend", selectedUploadBackend);
    }
    const res = await fetch(`/api/admin/upload?${query.toString()}`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const msg = json?.error || t("admin.uploadFailed");
      throw new Error(msg);
    }
    return json;
  }

  async function handleUpload() {
    const previewCanvas = canvasRef.current;
    const img = imgRef.current;
    if (!previewCanvas || !img || !img.complete || !file) return;

    setUploading(true);
    try {
      const assetId =
        typeof crypto?.randomUUID === "function"
          ? crypto.randomUUID()
          : `asset-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
      const sourceHash = await sha256Hex(await file.arrayBuffer());
      const fileBaseName = file.name?.replace(/\.[^.]+$/, "") || "image";

      // Step 1: always upload untouched original first.
      const originalUpload = await uploadAssetStep({
        fileBlob: file,
        fileName: file.name || `${fileBaseName}-original`,
        assetId,
        assetRole: "original",
        assetFormat: "raw",
        variantKind: "original",
        sourceHash,
        copyrightHolder,
        license,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });

      // Step 2: upload processed output linked to the original.
      const exportCanvas = document.createElement("canvas");
      const exportWidth = selectedSize.width;
      const exportHeight = selectedSize.height;
      const scaleX = exportWidth / previewFrame.width;
      const scaleY = exportHeight / previewFrame.height;
      drawCroppedImage({
        canvas: exportCanvas,
        image: img,
        frameWidth: exportWidth,
        frameHeight: exportHeight,
        scale,
        offsetX: offsetX * scaleX,
        offsetY: offsetY * scaleY,
      });

      let requestedFormat = outputFormat;
      let exportMime = OUTPUT_MIME_TYPES[requestedFormat] || "image/webp";
      let exportBlob = await canvasToBlob(
        exportCanvas,
        exportMime,
        OUTPUT_QUALITY[requestedFormat] ?? 0.86,
      );

      if (!exportBlob && requestedFormat === "avif") {
        requestedFormat = "webp";
        exportMime = OUTPUT_MIME_TYPES.webp;
        exportBlob = await canvasToBlob(
          exportCanvas,
          exportMime,
          OUTPUT_QUALITY.webp,
        );
      }
      if (!exportBlob) {
        requestedFormat = "raw";
        exportMime = OUTPUT_MIME_TYPES.raw;
        exportBlob = await canvasToBlob(exportCanvas, exportMime, 1);
      }
      if (!exportBlob) {
        throw new Error("Canvas export failed");
      }

      const variantKind = isDerivedWork ? "derived-work" : "original";
      const variantFileName = `${fileBaseName}-${requestedFormat}.${OUTPUT_EXTENSIONS[requestedFormat] || "bin"}`;
      const variantUpload = await uploadAssetStep({
        fileBlob: exportBlob,
        fileName: variantFileName,
        assetId,
        assetRole: "variant",
        assetFormat: requestedFormat,
        variantKind,
        originalUrl: originalUpload?.url || "",
        originalId: originalUpload?.id || "",
        sourceHash,
        copyrightHolder,
        license,
        width: exportWidth,
        height: exportHeight,
      });

      setShowEditor(false);
      setPreview(null);
      setFile(null);
      setIsDerivedWork(false);
      setCopyrightHolder("");
      setLicense("");
      try {
        onUploaded?.(variantUpload.url, variantUpload.asset);
      } catch (error) {
        console.error("ImageUploader onUploaded callback failed:", error);
      }
    } catch (error) {
      console.error("Image upload exception", {
        backend: selectedUploadBackend || "default",
        error,
      });
      const msg = t("admin.uploadFailed");
      emitError(selectedUploadBackend ? `${msg} (${selectedUploadBackend})` : msg);
      setShowEditor(false);
      setPreview(null);
      setFile(null);
      setIsDerivedWork(false);
      setCopyrightHolder("");
      setLicense("");
    } finally {
      setUploading(false);
    }
  }

  function handleCancel() {
    setShowEditor(false);
    setPreview(null);
    setFile(null);
    setIsDerivedWork(false);
    setCopyrightHolder("");
    setLicense("");
  }

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="absolute -left-[10000px] top-auto h-px w-px opacity-0"
      />
      {/* Trigger area — custom or default */}
      {renderTrigger ? (
        renderTrigger(openFilePicker)
      ) : (
        <div className="flex items-center gap-3">
          {value && (
            <img
              src={value}
              alt=""
              className="h-32 w-32 rounded border object-cover shrink-0"
            />
          )}
          <button
            type="button"
            onClick={openFilePicker}
            className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
            title={t("admin.uploadSizeHint")}
          >
            {t("admin.uploadImage")}
          </button>
          {value && (
            <input
              type="text"
              value={value}
              readOnly
              className="flex-1 border rounded px-3 py-2 text-xs text-gray-500 bg-gray-50 min-w-0"
              title={value}
            />
          )}
        </div>
      )}

      {showSourceChooser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowSourceChooser(false);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4 space-y-4">
            <h3 className="font-semibold text-sm">
              {t("admin.imageSourceChooserTitle", "Choose image source")}
            </h3>
            <p className="text-xs text-gray-500">
              {t(
                "admin.imageSourceChooserHint",
                "Start by browsing the media library or uploading a new image.",
              )}
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={chooseBrowseLibrary}
                className="w-full rounded border px-3 py-2 text-sm text-left hover:bg-gray-50"
              >
                {t("admin.imageSourceBrowseLibrary", "Browse media library")}
              </button>
              <button
                type="button"
                onClick={chooseUploadNew}
                className="w-full rounded border px-3 py-2 text-sm text-left hover:bg-gray-50"
              >
                {t("admin.imageSourceUploadNew", "Upload new image")}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowSourceChooser(false)}
                className="px-3 py-1.5 rounded border hover:bg-gray-50 text-sm"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMediaBrowser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeMediaBrowser();
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full p-4 sm:p-5 space-y-3 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm">
                  {t("admin.imageBrowseLibraryTitle", "Browse media library")}
                </h3>
                <p className="text-xs text-gray-500">
                  {t(
                    "admin.imageBrowseLibraryHint",
                    "Select an existing image from WordPress media library or R2.",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={closeMediaBrowser}
                className="px-3 py-1.5 rounded border hover:bg-gray-50 text-xs"
              >
                {t("common.close", "Close")}
              </button>
            </div>

            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                setMediaSearchTerm(mediaSearchInput.trim());
              }}
            >
              <input
                type="search"
                value={mediaSearchInput}
                onChange={(event) => setMediaSearchInput(event.target.value)}
                placeholder={t(
                  "admin.imageBrowseLibrarySearchPlaceholder",
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
              <button
                type="button"
                onClick={loadMediaLibrary}
                className="px-3 py-2 rounded border hover:bg-gray-50 text-sm"
              >
                {t("admin.mediaRefresh", "Refresh")}
              </button>
            </form>

            {mediaLoading && (
              <p className="text-xs text-gray-500">{t("common.loading", "Loading…")}</p>
            )}

            {mediaError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                {mediaError}
              </p>
            )}

            {!mediaLoading && !mediaError && mediaItems.length === 0 && (
              <p className="text-xs text-gray-500">
                {t(
                  "admin.imageBrowseLibraryEmpty",
                  "No images matched this filter.",
                )}
              </p>
            )}

            {mediaItems.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mediaItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectMediaImage(item)}
                    className="rounded border bg-white p-2 text-left hover:bg-gray-50"
                  >
                    <div className="aspect-video rounded border bg-gray-100 overflow-hidden flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <p className="mt-1 text-xs font-medium text-gray-800 line-clamp-2 break-all">
                      {item.title || item.key || item.url}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {item.source === "wordpress" ? "WordPress" : item.source === "r2" ? "R2" : "—"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Crop/scale editor modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full p-4 sm:p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div>
              <h3 className="font-semibold text-sm">{t("admin.cropAndScale")}</h3>
              <p className="text-xs text-gray-500">{t("admin.cropHint")}</p>
            </div>

            {/* Hidden image for drawing */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={preview}
              alt=""
              className="hidden"
              onLoad={handleImgLoad}
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] items-start">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600">
                      {t("admin.cropAspectLabel")}
                    </label>
                    <select
                      value={aspectKey}
                      onChange={(e) => {
                        setAspectKey(e.target.value);
                        setScale(1);
                        setOffsetX(0);
                        setOffsetY(0);
                      }}
                      className="w-full border rounded px-2 py-1 text-sm"
                    >
                      {UPLOADER_ASPECT_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {t(ASPECT_LABEL_KEYS[key])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600">
                      {t("admin.imageOutputResolutionLabel", "Output resolution")}
                    </label>
                    <div className="w-full border rounded px-2 py-1.5 text-sm text-gray-700 bg-gray-50">
                      {selectedSize.width} × {selectedSize.height}
                    </div>
                  </div>
                </div>

                {/* Canvas with drag */}
                <div className="rounded border bg-gray-50 p-2 flex justify-center overflow-auto">
                  <canvas
                    ref={canvasRef}
                    width={previewFrame.width}
                    height={previewFrame.height}
                    className="border rounded cursor-move bg-white"
                    style={{
                      width: previewFrame.width,
                      height: previewFrame.height,
                      touchAction: "none",
                    }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                  />
                </div>

                {/* Scale slider */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-600 flex justify-between">
                    <span>{t("admin.scaleLabel")}</span>
                    <span>{Math.round(scale * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={scale}
                    onChange={(e) => setScale(Number.parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">
                    {t("admin.imageOutputFormatLabel")}
                  </label>
                  <select
                    value={outputFormat}
                    onChange={(event) => setOutputFormat(event.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    {outputFormatOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500">
                    {t("admin.imageOutputFormatHint")}
                  </p>
                </div>

                <details className="rounded border bg-gray-50 px-3 py-2">
                  <summary className="cursor-pointer select-none text-xs font-semibold text-gray-700">
                    {t("admin.imageMoreOptions", "More")}
                  </summary>
                  <div className="mt-2 space-y-3">
                    <label className="flex items-start gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={isDerivedWork}
                        onChange={(event) => setIsDerivedWork(event.target.checked)}
                        className="mt-0.5"
                      />
                      <span>{t("admin.imageDerivedWorkToggle", "Mark as derived work")}</span>
                    </label>
                    <p className="text-[11px] text-gray-500">
                      {t(
                        "admin.imageVariantCurrent",
                        "Current variant type: {kind}",
                        {
                          kind: isDerivedWork
                            ? t("admin.imageVariantKindDerivedWork")
                            : t("admin.imageVariantKindOriginal"),
                        },
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {t("admin.imageVariantKindHint")}
                    </p>

                    <div className="space-y-1">
                      <label className="text-xs text-gray-600">
                        {t("admin.imageCopyrightHolderLabel")}
                      </label>
                      <input
                        type="text"
                        value={copyrightHolder}
                        onChange={(event) => setCopyrightHolder(event.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        placeholder={t("admin.imageCopyrightHolderPlaceholder")}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-gray-600">
                        {t("admin.imageLicenseLabel")}
                      </label>
                      <input
                        type="text"
                        value={license}
                        onChange={(event) => setLicense(event.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        placeholder={t("admin.imageLicensePlaceholder")}
                      />
                    </div>
                  </div>
                </details>

                {availableUploadOptions.length > 1 && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600">
                      {t("admin.uploadDestinationTitle")}
                    </label>
                    <select
                      value={selectedUploadBackend}
                      onChange={(event) =>
                        setSelectedUploadBackend(event.target.value)
                      }
                      className="w-full border rounded px-2 py-1 text-sm"
                    >
                      {availableUploadOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded border hover:bg-gray-50 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700 text-sm disabled:opacity-50"
              >
                {uploading ? t("admin.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
