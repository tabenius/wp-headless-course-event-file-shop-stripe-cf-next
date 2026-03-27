"use client";

import { getLocale, t } from "@/lib/i18n";
import {
  buildRagbazDocsUrl,
  contextDocSlugsForTab,
  normalizeDocsLanguage,
} from "@/lib/ragbazDocs";

function docLabel(slug) {
  switch (slug) {
    case "quick-start":
      return t("admin.docsGuideQuickStart", "Quick start");
    case "product-value":
      return t("admin.docsGuideProductValue", "Features and value");
    case "performance-explained":
      return t("admin.docsGuidePerformance", "Performance explained");
    case "technical-manual":
      return t("admin.docsGuideTechnical", "Technical manual");
    default:
      return slug;
  }
}

export default function AdminDocsContextLinks({
  tab = "welcome",
  compact = false,
  className = "",
}) {
  const docsLang = normalizeDocsLanguage(getLocale());
  const links = contextDocSlugsForTab(tab).map((slug) => ({
    slug,
    label: docLabel(slug),
    href: buildRagbazDocsUrl({ lang: docsLang, slug }),
  }));
  const rootClass = compact
    ? "flex flex-wrap items-center gap-1.5 text-xs"
    : "flex flex-wrap items-center gap-2 text-xs";

  return (
    <div className={`${rootClass} ${className}`.trim()}>
      <span
        className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700"
        title={t("admin.docsContextHint", "Context-aware docs links for this section.")}
      >
        {t("admin.docsContextPrefix", "Need help?")}
      </span>
      {links.map((link) => (
        <a
          key={link.slug}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
          title={t("admin.docsOpenGuideTooltip", "Open guide on ragbaz.xyz ({lang}).", {
            lang: docsLang.toUpperCase(),
          })}
        >
          {link.label} ↗
        </a>
      ))}
    </div>
  );
}
