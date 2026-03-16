"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

/**
 * Image uploader with crop & scale preview.
 * Props:
 *   value         — current image URL
 *   onUploaded    — callback(url) after upload completes
 *   onError       — callback(message) on failure
 *   className     — wrapper class
 *   renderTrigger — optional (openFilePicker) => ReactNode to replace default UI
 */
export default function ImageUploader({ value, onUploaded, onError, className = "", renderTrigger }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  const openFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const picked = input.files?.[0];
      if (!picked) return;
      setFile(picked);
      setScale(1);
      setOffsetX(0);
      setOffsetY(0);
      const url = URL.createObjectURL(picked);
      setPreview(url);
      setShowEditor(true);
    };
    input.click();
  }, []);

  // Draw image on canvas whenever scale/offset/preview changes
  useEffect(() => {
    if (!showEditor || !preview) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const img = imgRef.current;
    if (!img || !img.complete) return;

    const size = 320;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, 0, size, size);

    const imgAspect = img.naturalWidth / img.naturalHeight;
    let drawW, drawH;
    if (imgAspect > 1) {
      drawH = size * scale;
      drawW = drawH * imgAspect;
    } else {
      drawW = size * scale;
      drawH = drawW / imgAspect;
    }
    const x = (size - drawW) / 2 + offsetX;
    const y = (size - drawH) / 2 + offsetY;
    ctx.drawImage(img, x, y, drawW, drawH);
  }, [preview, scale, offsetX, offsetY, showEditor]);

  function handleImgLoad() {
    // Trigger a redraw
    setScale((s) => s);
  }

  function handleMouseDown(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startOX = offsetX;
    const startOY = offsetY;

    function onMove(ev) {
      setOffsetX(startOX + (ev.clientX - startX));
      setOffsetY(startOY + (ev.clientY - startY));
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
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const startOX = offsetX;
    const startOY = offsetY;

    function onMove(ev) {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      const t = ev.touches[0];
      setOffsetX(startOX + (t.clientX - startX));
      setOffsetY(startOY + (t.clientY - startY));
    }
    function onEnd() {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    }
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }

  async function handleUpload() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setUploading(true);
    try {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      const formData = new FormData();
      const name = file?.name?.replace(/\.[^.]+$/, "") || "image";
      formData.append("file", blob, `${name}.jpg`);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const msg = json?.error || t("admin.uploadFailed");
        onError?.(msg);
        alert(msg);
        return;
      }
      onUploaded?.(json.url);
      setShowEditor(false);
      setPreview(null);
      setFile(null);
    } catch {
      const msg = t("admin.uploadFailed");
      onError?.(msg);
      alert(msg);
    } finally {
      setUploading(false);
    }
  }

  function handleCancel() {
    setShowEditor(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
  }

  return (
    <div className={className}>
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

      {/* Crop/scale editor modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4 space-y-4">
            <h3 className="font-semibold text-sm">{t("admin.cropAndScale")}</h3>
            <p className="text-xs text-gray-500">{t("admin.cropHint")}</p>

            {/* Hidden image for drawing */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={preview}
              alt=""
              className="hidden"
              onLoad={handleImgLoad}
            />

            {/* Canvas with drag */}
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                width={320}
                height={320}
                className="border rounded cursor-move"
                style={{ width: 320, height: 320, touchAction: "none" }}
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
                min="0.5"
                max="3"
                step="0.05"
                value={scale}
                onChange={(e) => setScale(Number.parseFloat(e.target.value))}
                className="w-full"
              />
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
