import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "@/lib/cloudflareKv";

const KV_KEY = "shop-settings";
const MAX_SITE_STYLE_HISTORY = 40;

const ALL_TYPES = [
  "product",
  "course",
  "event",
  "digital_file",
  "digital_course",
];

const SITE_FONT_STACKS = {
  heading: [
    "var(--font-montserrat), 'Helvetica Neue', sans-serif",
    "var(--font-merriweather), Georgia, serif",
    "system-ui, -apple-system, 'Segoe UI', sans-serif",
    "Georgia, 'Times New Roman', serif",
  ],
  body: [
    "var(--font-merriweather), Georgia, serif",
    "var(--font-montserrat), 'Helvetica Neue', sans-serif",
    "system-ui, -apple-system, 'Segoe UI', sans-serif",
    "Georgia, 'Times New Roman', serif",
  ],
};

const SITE_FONT_SET = new Set(
  [...SITE_FONT_STACKS.heading, ...SITE_FONT_STACKS.body].map((value) =>
    String(value || "").trim(),
  ),
);

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}){1,2}$/i;

const DEFAULT_SITE_STYLE = {
  background: "#fff1f1",
  foreground: "#1a1a1a",
  primary: "#6d003e",
  secondary: "#ffb606",
  tertiary: "#442e66",
  muted: "#686868",
  fontHeading: SITE_FONT_STACKS.heading[0],
  fontBody: SITE_FONT_STACKS.body[0],
};

const DEFAULTS = {
  visibleTypes: [...ALL_TYPES],
  vatByCategory: {},
  siteStyle: { ...DEFAULT_SITE_STYLE },
  siteStyleHistory: [],
};

function normalizeVatCategoryKey(key) {
  if (typeof key !== "string") return "";
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeVatByCategory(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = normalizeVatCategoryKey(rawKey);
    if (!key) continue;
    const numeric =
      typeof rawValue === "number"
        ? rawValue
        : Number.parseFloat(String(rawValue || "").replace(",", "."));
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) continue;
    output[key] = Math.round(numeric * 100) / 100;
  }
  return output;
}

function normalizeHexColor(value, fallback) {
  const text = String(value || "").trim();
  if (!HEX_COLOR_RE.test(text)) return fallback;
  return text.toLowerCase();
}

function normalizeSiteFont(value, fallback) {
  const text = String(value || "").trim();
  if (!SITE_FONT_SET.has(text)) return fallback;
  return text;
}

function normalizeSiteStyle(input, fallback = DEFAULT_SITE_STYLE) {
  const source = input && typeof input === "object" ? input : {};
  return {
    background: normalizeHexColor(source.background, fallback.background),
    foreground: normalizeHexColor(source.foreground, fallback.foreground),
    primary: normalizeHexColor(source.primary, fallback.primary),
    secondary: normalizeHexColor(source.secondary, fallback.secondary),
    tertiary: normalizeHexColor(source.tertiary, fallback.tertiary),
    muted: normalizeHexColor(source.muted, fallback.muted),
    fontHeading: normalizeSiteFont(source.fontHeading, fallback.fontHeading),
    fontBody: normalizeSiteFont(source.fontBody, fallback.fontBody),
  };
}

function normalizeIso(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString();
}

function normalizeRevisionId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 80);
}

function createRevisionId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID().toLowerCase();
  }
  return `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSiteStyleHistory(input, fallbackStyle = DEFAULT_SITE_STYLE) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const rows = [];
  for (const row of input) {
    const source = row && typeof row === "object" ? row : {};
    const id = normalizeRevisionId(source.id) || createRevisionId();
    if (seen.has(id)) continue;
    seen.add(id);
    const savedAt =
      normalizeIso(source.savedAt) || normalizeIso(source.createdAt) || "";
    rows.push({
      id,
      savedAt: savedAt || new Date().toISOString(),
      style: normalizeSiteStyle(source.style, fallbackStyle),
    });
  }
  rows.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
  return rows.slice(0, MAX_SITE_STYLE_HISTORY);
}

function areSiteStylesEqual(left, right) {
  const a = normalizeSiteStyle(left, DEFAULT_SITE_STYLE);
  const b = normalizeSiteStyle(right, DEFAULT_SITE_STYLE);
  return (
    a.background === b.background &&
    a.foreground === b.foreground &&
    a.primary === b.primary &&
    a.secondary === b.secondary &&
    a.tertiary === b.tertiary &&
    a.muted === b.muted &&
    a.fontHeading === b.fontHeading &&
    a.fontBody === b.fontBody
  );
}

function pushSiteStyleRevision(history, style) {
  const nextStyle = normalizeSiteStyle(style, DEFAULT_SITE_STYLE);
  const baseHistory = normalizeSiteStyleHistory(history, nextStyle);
  if (baseHistory[0] && areSiteStylesEqual(baseHistory[0].style, nextStyle)) {
    return baseHistory;
  }
  return [
    {
      id: createRevisionId(),
      savedAt: new Date().toISOString(),
      style: nextStyle,
    },
    ...baseHistory,
  ].slice(0, MAX_SITE_STYLE_HISTORY);
}

function shouldUseCloudflare() {
  return isCloudflareKvConfigured();
}

export async function getShopSettings() {
  if (shouldUseCloudflare()) {
    try {
      const data = await readCloudflareKvJson(KV_KEY);
      if (data && typeof data === "object") {
        const fallbackStyle = { ...DEFAULTS.siteStyle };
        return {
          visibleTypes: Array.isArray(data.visibleTypes)
            ? data.visibleTypes.filter((t) => ALL_TYPES.includes(t))
            : [...DEFAULTS.visibleTypes],
          vatByCategory: normalizeVatByCategory(data.vatByCategory),
          siteStyle: normalizeSiteStyle(data.siteStyle, fallbackStyle),
          siteStyleHistory: normalizeSiteStyleHistory(
            data.siteStyleHistory,
            fallbackStyle,
          ),
        };
      }
    } catch (error) {
      console.error("Failed to read shop settings from KV:", error);
    }
  }
  return {
    visibleTypes: [...DEFAULTS.visibleTypes],
    vatByCategory: { ...DEFAULTS.vatByCategory },
    siteStyle: { ...DEFAULTS.siteStyle },
    siteStyleHistory: [...DEFAULTS.siteStyleHistory],
  };
}

export async function saveShopSettings(settings) {
  const current = await getShopSettings();
  const nextSiteStyle =
    settings && Object.prototype.hasOwnProperty.call(settings, "siteStyle")
      ? normalizeSiteStyle(settings.siteStyle, current.siteStyle)
      : current.siteStyle;
  const baseHistory = normalizeSiteStyleHistory(
    current.siteStyleHistory,
    current.siteStyle,
  );
  const nextHistory = areSiteStylesEqual(nextSiteStyle, current.siteStyle)
    ? baseHistory
    : pushSiteStyleRevision(baseHistory, nextSiteStyle);
  const safe = {
    visibleTypes: Array.isArray(settings?.visibleTypes)
      ? settings.visibleTypes.filter((t) => ALL_TYPES.includes(t))
      : current.visibleTypes,
    vatByCategory:
      settings && Object.prototype.hasOwnProperty.call(settings, "vatByCategory")
        ? normalizeVatByCategory(settings.vatByCategory)
        : current.vatByCategory,
    siteStyle: nextSiteStyle,
    siteStyleHistory: nextHistory,
  };
  if (shouldUseCloudflare()) {
    await writeCloudflareKvJson(KV_KEY, safe);
  }
  return safe;
}

export { ALL_TYPES, DEFAULT_SITE_STYLE, SITE_FONT_STACKS };
