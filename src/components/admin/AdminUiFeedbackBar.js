"use client";

import { t } from "@/lib/i18n";

const FEEDBACK_OPTIONS = [
  { value: "up", icon: "👍", labelKey: "uiFeedbackThumbUp", fallback: "Adequate" },
  { value: "heart", icon: "❤", labelKey: "uiFeedbackHeart", fallback: "Good" },
  { value: "down", icon: "👎", labelKey: "uiFeedbackThumbDown", fallback: "Needs improvement" },
];

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function AdminUiFeedbackBar({
  contextLabel,
  fieldId,
  entry,
  loading = false,
  saving = false,
  readOnly = true,
  onSet,
}) {
  if (!fieldId) return null;
  const selected = String(entry?.value || "").trim().toLowerCase();
  const by = String(entry?.by || "").trim();
  const updatedAt = formatWhen(entry?.updatedAt);

  return (
    <aside className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {t("admin.uiFeedbackTitle", "UI feedback")} ·{" "}
          <span className="font-semibold">{contextLabel}</span>
        </p>
        <div className="flex items-center gap-1">
          {FEEDBACK_OPTIONS.map((option) => {
            const isActive = selected === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-amber-900 bg-amber-200 text-amber-950"
                    : "border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                } ${readOnly || loading || saving ? "opacity-70 cursor-not-allowed" : ""}`}
                disabled={readOnly || loading || saving}
                onClick={() => onSet?.(fieldId, option.value)}
                title={t(`admin.${option.labelKey}`, option.fallback)}
              >
                <span className="mr-1" aria-hidden="true">
                  {option.icon}
                </span>
                {t(`admin.${option.labelKey}`, option.fallback)}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        {readOnly
          ? t(
              "admin.uiFeedbackReadOnly",
              "Read-only for this admin user. Sofia can set feedback.",
            )
          : t(
              "admin.uiFeedbackEditable",
              "Your feedback is saved to Cloudflare KV and shared across admin sessions.",
            )}
        {by || updatedAt ? " " : ""}
        {by ? `${t("admin.uiFeedbackBy", "By")}: ${by}. ` : ""}
        {updatedAt ? `${t("admin.uiFeedbackUpdated", "Updated")}: ${updatedAt}.` : ""}
      </p>
    </aside>
  );
}

