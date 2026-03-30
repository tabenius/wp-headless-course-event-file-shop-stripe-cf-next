"use client";

import { getLocale, t } from "@/lib/i18n";
import { buildRagbazDocsUrl, normalizeDocsLanguage } from "@/lib/ragbazDocs";

const SLUG_TOPIC_KEYS = {
  "quick-start": "docsGuideQuickStart",
  "product-value": "docsGuideProductValue",
  "performance-explained": "docsGuidePerformance",
  "technical-manual": "docsGuideTechnical",
};

export default function AdminFieldHelpLink({ slug, topic = "", className = "" }) {
  const docsLang = normalizeDocsLanguage(getLocale());
  const href = buildRagbazDocsUrl({ lang: docsLang, slug });
  const resolvedTopic =
    topic || (SLUG_TOPIC_KEYS[slug] ? t(`admin.${SLUG_TOPIC_KEYS[slug]}`) : "");
  const tooltip = resolvedTopic
    ? t("admin.docsOpenGuideTooltipFor", {
        topic: resolvedTopic,
        lang: docsLang.toUpperCase(),
      })
    : t("admin.docsOpenGuideTooltip", {
        lang: docsLang.toUpperCase(),
      });
  const aria = resolvedTopic
    ? t("admin.docsOpenGuideAria", "Open related guide") + ": " + resolvedTopic
    : t("admin.docsOpenGuideAria", "Open related guide");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={tooltip}
      aria-label={aria}
      className={`admin-help-pill inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none ${className}`.trim()}
    >
      ?
    </a>
  );
}
