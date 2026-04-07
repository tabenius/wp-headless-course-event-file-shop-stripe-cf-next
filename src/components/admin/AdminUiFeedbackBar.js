"use client";

import { t } from "@/lib/i18n";

const FEEDBACK_OPTIONS = [
  {
    value: "up",
    icon: "👍",
    labelKey: "uiFeedbackThumbUp",
    fallback: "Adequate",
  },
  { value: "heart", icon: "❤", labelKey: "uiFeedbackHeart", fallback: "Good" },
  {
    value: "down",
    icon: "👎",
    labelKey: "uiFeedbackThumbDown",
    fallback: "Needs improvement",
  },
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
  const selected = String(entry?.value || "")
    .trim()
    .toLowerCase();
  const by = String(entry?.by || "").trim();
  const updatedAt = formatWhen(entry?.updatedAt);

  return (
    <aside className="admin-ui-feedback-bar rounded-md border border-gray-200/80 bg-gray-50/20 px-2 py-1 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-gray-500">
            {t("admin.uiFeedbackTitle", "UI feedback")} · {contextLabel}
          </span>
          {(by || updatedAt) && (
            <span className="text-[10px] text-gray-400">
              {by ? `${t("admin.uiFeedbackBy", "By")}: ${by}` : ""}
              {by && updatedAt ? " · " : ""}
              {updatedAt
                ? `${t("admin.uiFeedbackUpdated", "Updated")}: ${updatedAt}`
                : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {FEEDBACK_OPTIONS.map((option) => {
            const isActive = selected === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`rounded border px-1.5 py-0.5 text-xs transition-colors ${
                  isActive
                    ? "border-gray-500 bg-gray-200 text-gray-900"
                    : "border-gray-300 text-gray-500 hover:bg-gray-100"
                } ${readOnly || loading || saving ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={readOnly || loading || saving}
                onClick={() => onSet?.(fieldId, option.value)}
                title={t(`admin.${option.labelKey}`, option.fallback)}
              >
                <span className="mr-0.5" aria-hidden="true">
                  {option.icon}
                </span>
                {t(`admin.${option.labelKey}`, option.fallback)}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
