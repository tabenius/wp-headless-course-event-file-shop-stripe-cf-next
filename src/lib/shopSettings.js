import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
  writeCloudflareKvJson,
} from "./cloudflareKv.js";

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

const VALID_HOVER_VARIANTS = new Set([
  "none",
  "underline",
  "highlight",
  "inverse",
  "pill",
  "slide",
  "box",
]);

const VALID_UNDERLINE_DEFAULTS = new Set(["always", "hover", "never"]);

const DEFAULT_LINK_STYLE = {
  hoverVariant: "underline",
  underlineDefault: "hover",
};

const DEFAULT_FONT_ROLES = {
  fontDisplay: {
    type: "preset",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    colorSlot: 1,
  },
  fontHeading: {
    type: "preset",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    colorSlot: 1,
  },
  fontSubheading: { type: "inherit" },
  fontBody: { type: "preset", stack: "Georgia, 'Times New Roman', serif" },
  fontButton: {
    type: "preset",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
};

export function normalizeFontRole(input, fallback) {
  // Backward compat: old string format → preset object
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed) return { type: "preset", stack: trimmed };
    return { ...fallback };
  }
  if (!input || typeof input !== "object") return { ...fallback };

  const type = String(input.type || "");
  if (!["preset", "google", "inherit"].includes(type)) return { ...fallback };

  if (type === "inherit") return { type: "inherit" };

  if (type === "preset") {
    const stack = String(input.stack || "").trim();
    if (!stack) return { ...fallback };
    const result = { type: "preset", stack };
    if (input.colorSlot === 1 || input.colorSlot === 2)
      result.colorSlot = input.colorSlot;
    return result;
  }

  // type === "google"
  const family = String(input.family || "").trim();
  if (!family) return { ...fallback };
  const result = { type: "google", family };
  result.isVariable = Boolean(input.isVariable);
  if (result.isVariable) {
    const [min, max] = Array.isArray(input.weightRange)
      ? input.weightRange
      : [100, 900];
    result.weightRange = [Number(min) || 100, Number(max) || 900];
  } else {
    result.weights = Array.isArray(input.weights)
      ? input.weights.map(Number).filter((w) => w > 0)
      : [400];
  }
  if (input.colorSlot === 1 || input.colorSlot === 2)
    result.colorSlot = input.colorSlot;
  return result;
}

export function normalizeTypographyPalette(input) {
  const DEFAULT = ["#111111"];
  if (!Array.isArray(input) || input.length === 0) return DEFAULT;
  const validated = input
    .slice(0, 2)
    .map((c) =>
      HEX_COLOR_RE.test(String(c || "").trim())
        ? String(c).trim().toLowerCase()
        : null,
    )
    .filter(Boolean);
  return validated.length > 0 ? validated : DEFAULT;
}

export function normalizeLinkStyle(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    hoverVariant: VALID_HOVER_VARIANTS.has(source.hoverVariant)
      ? source.hoverVariant
      : DEFAULT_LINK_STYLE.hoverVariant,
    underlineDefault: VALID_UNDERLINE_DEFAULTS.has(source.underlineDefault)
      ? source.underlineDefault
      : DEFAULT_LINK_STYLE.underlineDefault,
  };
}

const DEFAULT_SITE_STYLE = {
  background: "#f0d0d0",
  foreground: "#1a1a1a",
  primary: "#6d003e",
  secondary: "#ffb606",
  tertiary: "#442e66",
  muted: "#686868",
  fontDisplay: { ...DEFAULT_FONT_ROLES.fontDisplay },
  fontHeading: { ...DEFAULT_FONT_ROLES.fontHeading },
  fontSubheading: { ...DEFAULT_FONT_ROLES.fontSubheading },
  fontBody: { ...DEFAULT_FONT_ROLES.fontBody },
  fontButton: { ...DEFAULT_FONT_ROLES.fontButton },
  typographyPalette: ["#111111"],
  linkStyle: { ...DEFAULT_LINK_STYLE },
  ctaStyle: { type: "upstream" },
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

const CTA_BG_COLORS = new Set(["primary", "secondary", "foreground", "background", "custom"]);
const CTA_TEXT_COLORS = new Set(["background", "foreground", "primary", "secondary", "custom"]);
const CTA_BORDER_RADII = new Set(["none", "sm", "md", "lg", "full"]);
const CTA_BORDERS = new Set(["none", "solid"]);
const CTA_BORDER_COLORS = new Set(["primary", "secondary", "foreground", "custom"]);
const CTA_SHADOWS = new Set(["none", "sm", "md"]);
const CTA_FONT_WEIGHTS = new Set(["normal", "medium", "semibold", "bold"]);
const CTA_TEXT_TRANSFORMS = new Set(["none", "uppercase", "capitalize"]);
const CTA_PADDING_SIZES = new Set(["sm", "md", "lg"]);

export function normalizeCtaStyle(source) {
  if (!source || typeof source !== "object") return { type: "upstream" };
  if (source.type === "upstream") return { type: "upstream" };
  if (!CTA_BG_COLORS.has(source.bgColor)) return { type: "upstream" };

  const bgColor = source.bgColor;
  const textColor = CTA_TEXT_COLORS.has(source.textColor) ? source.textColor : "background";
  const borderRadius = CTA_BORDER_RADII.has(source.borderRadius) ? source.borderRadius : "md";
  const border = CTA_BORDERS.has(source.border) ? source.border : "none";
  const shadow = CTA_SHADOWS.has(source.shadow) ? source.shadow : "none";
  const fontWeight = CTA_FONT_WEIGHTS.has(source.fontWeight) ? source.fontWeight : "semibold";
  const textTransform = CTA_TEXT_TRANSFORMS.has(source.textTransform) ? source.textTransform : "none";
  const paddingSize = CTA_PADDING_SIZES.has(source.paddingSize) ? source.paddingSize : "md";

  // Fixed key order for stable JSON.stringify in areSiteStylesEqual
  const result = { bgColor, textColor, borderRadius, border, shadow, fontWeight, textTransform, paddingSize };

  if (bgColor === "custom") {
    result.bgCustom = normalizeHexColor(source.bgCustom, "#000000");
  }
  if (textColor === "custom") {
    result.textCustom = normalizeHexColor(source.textCustom, "#ffffff");
  }
  if (border === "solid") {
    result.borderColor = CTA_BORDER_COLORS.has(source.borderColor) ? source.borderColor : "primary";
    if (result.borderColor === "custom") {
      result.borderCustom = normalizeHexColor(source.borderCustom, "#000000");
    }
  }

  return result;
}

function normalizeSiteStyle(input, fallback = DEFAULT_SITE_STYLE) {
  const source = input && typeof input === "object" ? input : {};
  return {
    // Color fields — unchanged
    background: normalizeHexColor(source.background, fallback.background),
    foreground: normalizeHexColor(source.foreground, fallback.foreground),
    primary: normalizeHexColor(source.primary, fallback.primary),
    secondary: normalizeHexColor(source.secondary, fallback.secondary),
    tertiary: normalizeHexColor(source.tertiary, fallback.tertiary),
    muted: normalizeHexColor(source.muted, fallback.muted),
    // Font role objects — normalizeFontRole coerces legacy strings to preset objects
    fontDisplay: normalizeFontRole(
      source.fontDisplay,
      DEFAULT_FONT_ROLES.fontDisplay,
    ),
    fontHeading: normalizeFontRole(
      source.fontHeading,
      DEFAULT_FONT_ROLES.fontHeading,
    ),
    fontSubheading: normalizeFontRole(
      source.fontSubheading,
      DEFAULT_FONT_ROLES.fontSubheading,
    ),
    fontBody: normalizeFontRole(source.fontBody, DEFAULT_FONT_ROLES.fontBody),
    fontButton: normalizeFontRole(
      source.fontButton,
      DEFAULT_FONT_ROLES.fontButton,
    ),
    // Palette and link style
    typographyPalette: normalizeTypographyPalette(source.typographyPalette),
    linkStyle: normalizeLinkStyle(source.linkStyle),
    ctaStyle: normalizeCtaStyle(source.ctaStyle),
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
    JSON.stringify(a.fontDisplay) === JSON.stringify(b.fontDisplay) &&
    JSON.stringify(a.fontHeading) === JSON.stringify(b.fontHeading) &&
    JSON.stringify(a.fontSubheading) === JSON.stringify(b.fontSubheading) &&
    JSON.stringify(a.fontBody) === JSON.stringify(b.fontBody) &&
    JSON.stringify(a.fontButton) === JSON.stringify(b.fontButton) &&
    JSON.stringify(a.typographyPalette) ===
      JSON.stringify(b.typographyPalette) &&
    JSON.stringify(a.linkStyle) === JSON.stringify(b.linkStyle) &&
    JSON.stringify(a.ctaStyle) === JSON.stringify(b.ctaStyle)
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
