"use client";

import { getLocale, t } from "@/lib/i18n";
import { buildRagbazDocsUrl, normalizeDocsLanguage } from "@/lib/ragbazDocs";

export default function AdminFieldHelpLink({ slug, className = "" }) {
  const docsLang = normalizeDocsLanguage(getLocale());
  const href = buildRagbazDocsUrl({ lang: docsLang, slug });
  const tooltip = t("admin.docsOpenGuideTooltip", "Open guide on ragbaz.xyz ({lang}).", {
    lang: docsLang.toUpperCase(),
  });
  const aria = t("admin.docsOpenGuideAria", "Open related guide");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={tooltip}
      aria-label={aria}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-[10px] font-bold leading-none text-slate-700 hover:bg-slate-100 ${className}`.trim()}
    >
      ?
    </a>
  );
}
