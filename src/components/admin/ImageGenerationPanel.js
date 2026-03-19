"use client";

import { useState, useEffect, useCallback } from "react";
import { t } from "@/lib/i18n";

const SIZE_PRESET_KEYS = ["square", "landscape", "portrait", "a6-150dpi"];
const SIZE_LABEL_KEYS = {
  square:      "admin.imageSizeSquare",
  landscape:   "admin.imageSizeLandscape",
  portrait:    "admin.imageSizePortrait",
  "a6-150dpi": "admin.imageSizeA6",
};

function formatTimeUntil(isoString) {
  const diff = Math.max(0, new Date(isoString) - Date.now());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ImageGenerationPanel({
  description = "",
  initialPrompt,
  onSave,
  context = "editor",
  uploadBackend = "wordpress",
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [promptLoading, setPromptLoading] = useState(false);
  const [count, setCount] = useState(2);
  const [size, setSize] = useState("square");
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState([]);
  const [quota, setQuota] = useState(null);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    fetch("/api/admin/generate-image")
      .then((r) => r.json())
      .then((j) => { if (j?.ok) setQuota(j.quota); })
      .catch(() => {});
  }, []);

  const generatePrompt = useCallback(async () => {
    if (!description) return;
    setPromptLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "image-prompt", description }),
      });
      const json = await res.json();
      if (json?.ok && json?.prompt) setPrompt(json.prompt);
    } catch {
      // leave prompt empty — user types manually
    } finally {
      setPromptLoading(false);
    }
  }, [description]);

  useEffect(() => {
    if (!initialPrompt && description) generatePrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setImages([]);
    try {
      const res = await fetch("/api/admin/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), count, size }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 429) {
          if (json?.quota) setQuota(json.quota);
          const resetTime = json.quota?.resetsAt
            ? new Date(json.quota.resetsAt).toUTCString().slice(17, 22)
            : "?";
          showToast(t("admin.quotaExhausted", { time: resetTime }));
        } else {
          showToast(json?.error || t("admin.imageGenFailed"));
        }
        return;
      }
      if (json.quota) setQuota(json.quota);
      setImages(json.images || []);
      if ((json.images?.length ?? 0) < count) {
        showToast(t("admin.imagePartialFail", { n: json.images.length, m: count }), "info");
      }
    } catch (err) {
      showToast(err.message || t("admin.imageGenFailed"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(dataUrl, idx) {
    if (!onSave) return;
    setSaving(idx);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const form = new FormData();
      form.append("file", new File([blob], "ragbaz-ai-image.png", { type: "image/png" }));
      const uploadRes = await fetch(`/api/admin/upload?backend=${encodeURIComponent(uploadBackend)}`, {
        method: "POST",
        body: form,
      });
      const json = await uploadRes.json();
      if (!uploadRes.ok || !json?.ok) throw new Error(json?.error || "Upload failed");
      onSave(json.url);
    } catch (err) {
      showToast(err.message || t("admin.imageSaveFailed"));
    } finally {
      setSaving(null);
    }
  }

  function handleDownload(dataUrl, idx) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ragbaz-ai-image-${idx + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const remaining = quota ? Math.max(0, quota.remaining) : null;
  const quotaExhausted = remaining === 0;

  return (
    <div className={`border rounded p-4 space-y-3 bg-purple-50 ${context === "chat" ? "text-sm" : ""}`}>
      <div className="text-sm font-semibold text-purple-800">{t("admin.aiImagesTitle")}</div>

      {quota && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="flex gap-0.5">
              {Array.from({ length: quota.limit }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-sm ${i < quota.used ? "bg-purple-500" : "bg-gray-200"}`}
                />
              ))}
            </div>
            <span>
              {t("admin.quotaStatus", {
                used: quota.used,
                limit: quota.limit,
                time: formatTimeUntil(quota.resetsAt),
              })}
            </span>
          </div>
          {remaining !== null && remaining <= 2 && remaining > 0 && (
            <p className="text-xs text-amber-700">{t("admin.quotaWarning", { n: remaining })}</p>
          )}
          {quotaExhausted && (
            <p className="text-xs text-red-700">
              {t("admin.quotaExhausted", { time: new Date(quota.resetsAt).toUTCString().slice(17, 22) })}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 items-start">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={promptLoading ? "…" : t("admin.imagePromptPlaceholder")}
          disabled={promptLoading}
          className="flex-1 border rounded px-3 py-2 text-sm resize-none"
        />
        {context === "editor" && (
          <button
            type="button"
            onClick={generatePrompt}
            disabled={promptLoading || !description}
            title={!description ? "No description available" : undefined}
            className="px-2 py-1 rounded border text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
          >
            {promptLoading ? "…" : t("admin.regeneratePrompt")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">{t("admin.imageCount")}</span>
          <div className="flex gap-1">
            {[2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={`px-3 py-1 rounded border text-sm ${
                  count === n ? "bg-purple-600 text-white border-purple-600" : "hover:bg-gray-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500" title={t("admin.imageSizeNeuronTip")}>
            {t("admin.imageSize")} ⓘ
          </span>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            {SIZE_PRESET_KEYS.map((key) => (
              <option key={key} value={key}>{t(SIZE_LABEL_KEYS[key])}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || quotaExhausted || !prompt.trim()}
          className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 text-sm ml-auto"
        >
          {generating ? "…" : t("admin.generateButton")}
        </button>
      </div>

      {toast && (
        <div className={`text-xs px-3 py-2 rounded ${toast.type === "info" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
          {toast.msg}
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <img
                src={img}
                alt={`Generated ${idx + 1}`}
                className="rounded border object-cover"
                style={{ width: 160, height: 160 }}
              />
              <div className="flex gap-1">
                {onSave && (
                  <button
                    type="button"
                    onClick={() => handleSave(img, idx)}
                    disabled={saving !== null}
                    className="flex-1 px-2 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    {saving === idx ? "…" : t("admin.saveImage")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDownload(img, idx)}
                  className="flex-1 px-2 py-1 rounded border text-xs hover:bg-gray-50"
                >
                  {t("admin.downloadImage")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
