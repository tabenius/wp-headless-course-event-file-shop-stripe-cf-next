"use client";

import { getLocale, t } from "@/lib/i18n";
import { buildRagbazDocsUrl, normalizeDocsLanguage } from "@/lib/ragbazDocs";

export default function AdminFieldHelpLink({ slug, topic = "", className = "" }) {
  const docsLang = normalizeDocsLanguage(getLocale());
  const href = buildRagbazDocsUrl({ lang: docsLang, slug });
  const tooltipBase = topic
    ? t(
        "admin.docsOpenGuideTooltipFor",
        "Open guide for {topic} on RAGBAZ.xyz ({lang}).",
        {
          topic,
          lang: docsLang.toUpperCase(),
        },
      )
    : t("admin.docsOpenGuideTooltip", "Open guide on RAGBAZ.xyz ({lang}).", {
        lang: docsLang.toUpperCase(),
      });
  const hotkeyHint = t(
    "admin.docsOpenGuideHotkeyHint",
    "Focus and press ? or F1.",
  );
  const tooltip = `${tooltipBase} ${hotkeyHint}`;
  const aria = t("admin.docsOpenGuideAria", "Open related guide");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={tooltip}
      aria-label={aria}
      aria-keyshortcuts="Shift+Slash F1"
      onKeyDown={(event) => {
        if (event.key === "F1" || event.key === "?") {
          event.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-[10px] font-bold leading-none text-slate-700 hover:bg-slate-100 ${className}`.trim()}
    >
      ?
    </a>
  );
}
