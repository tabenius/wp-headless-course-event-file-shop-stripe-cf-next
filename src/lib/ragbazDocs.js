const DEFAULT_DOCS_BASE = "https://ragbaz.xyz/docs";
const DOCS_LANGUAGES = new Set(["en", "sv", "es"]);

const DOCS_CONTEXT_BY_TAB = Object.freeze({
  welcome: ["quick-start", "product-value"],
  media: ["technical-manual", "quick-start"],
  products: ["product-value", "technical-manual"],
  support: ["technical-manual", "quick-start"],
  sales: ["performance-explained", "technical-manual"],
  style: ["performance-explained", "product-value"],
  info: ["technical-manual", "performance-explained"],
  chat: ["technical-manual", "product-value"],
});

export function normalizeDocsLanguage(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (DOCS_LANGUAGES.has(normalized)) return normalized;
  if (normalized.startsWith("sv")) return "sv";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("en")) return "en";
  return "en";
}

export function contextDocSlugsForTab(tab) {
  const key = String(tab || "")
    .trim()
    .toLowerCase();
  return DOCS_CONTEXT_BY_TAB[key] || DOCS_CONTEXT_BY_TAB.welcome;
}

export function ragbazDocsBaseUrl() {
  const configured = String(
    process.env.NEXT_PUBLIC_RAGBAZ_DOCS_BASE_URL || "",
  ).trim();
  if (!configured) return DEFAULT_DOCS_BASE;
  return configured.replace(/\/+$/, "");
}

export function buildRagbazDocsUrl({ lang, slug }) {
  const base = ragbazDocsBaseUrl();
  const docsLang = normalizeDocsLanguage(lang);
  const docsSlug = String(slug || "")
    .trim()
    .toLowerCase();
  if (!docsSlug) return `${base}/${docsLang}`;
  return `${base}/${docsLang}/${docsSlug}`;
}
