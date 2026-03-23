"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "@/lib/i18n";
import { parsePriceCents } from "@/lib/parsePrice";
import { slugify } from "@/lib/slugify";
import { multipartUpload } from "@/lib/multipartUploadClient";
import ImageUploader from "./ImageUploader";
import ProductRow from "./ProductRow";
import ProductSection from "./ProductSection";
import ImageGenerationPanel from "./ImageGenerationPanel";
import ChatPanel from "./ChatPanel";
import { adminFetch } from "@/lib/adminFetch";
import {
  isAdminActionHotkey,
  resolveAdminTabHotkey,
  shouldIgnoreAdminHotkeys,
} from "@/lib/adminHotkeys";
import {
  deriveWelcomeRevisionState,
  persistWelcomeRevision,
  WELCOME_SEEN_KEY,
} from "@/lib/adminWelcomeRevision";

const WELCOME_REVISION =
  process.env.NEXT_PUBLIC_WELCOME_REVISION ||
  process.env.NEXT_PUBLIC_GIT_SHA ||
  "";

const AdminProductsTab = lazy(() => import("./AdminProductsTab"));
const AdminSupportTab = lazy(() => import("./AdminSupportTab"));
const AdminSalesTab = lazy(() => import("./AdminSalesTab"));
const AdminWelcomeTab = lazy(() => import("./AdminWelcomeTab"));
const AdminMediaLibraryTab = lazy(() => import("./AdminMediaLibraryTab"));
const AdminInfoHubTab = lazy(() => import("./AdminInfoHubTab"));
const AdminStyleTab = lazy(() => import("./AdminStyleTab"));

const ADMIN_TABS_BASE = [
  "sales",
  "media",
  "products",
  "support",
  "style",
  "info",
  "welcome",
];
// "chat" is a beta feature — shown only when the admin has enabled it via
// Admin → Info → Beta features.
const CHAT_BETA_STORAGE_KEY = "ragbaz_chat_beta_enabled";
const ADMIN_TAB_SET = new Set([...ADMIN_TABS_BASE, "chat"]);

function normalizeAdminTab(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^#\/?/, "")
    .split(/[/?&]/)[0];
  if (!normalized) return null;
  if (
    normalized === "sandbox" ||
    normalized === "health" ||
    normalized === "stats" ||
    normalized === "docs" ||
    normalized === "documentation"
  ) {
    return "info";
  }
  return ADMIN_TAB_SET.has(normalized) ? normalized : null;
}

function hashForAdminRoute(detail) {
  const normalized = String(detail || "").trim().toLowerCase();
  if (
    normalized === "health" ||
    normalized === "info/health" ||
    normalized === "status"
  ) {
    return "#/info/health";
  }
  if (
    normalized === "stats" ||
    normalized === "info/stats" ||
    normalized === "statistics"
  ) {
    return "#/info/stats";
  }
  if (
    normalized === "docs" ||
    normalized === "documentation" ||
    normalized === "info/docs"
  ) {
    return "#/info/docs";
  }
  const tab = normalizeAdminTab(normalized);
  if (!tab) return null;
  return `#/${tab}`;
}

const log = (...args) => {
  // Console output is streamed by wrangler tail in production.
  console.info("[AdminDashboard]", ...args);
};

function parseTabFromHash(hashValue) {
  const normalized = String(hashValue || "")
    .replace(/^#\/?/, "")
    .split(/[/?&]/)[0]
    .trim()
    .toLowerCase();
  return normalizeAdminTab(normalized);
}

function toCurrencyUnits(cents) {
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : "0.00";
}

function toCents(units) {
  const parsed = Number.parseFloat(units);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function parseVatPercentInput(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

function vatPercentToInput(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return String(value);
}

const SITE_STYLE_DEFAULTS = {
  background: "#fff1f1",
  foreground: "#1a1a1a",
  primary: "#6d003e",
  secondary: "#ffb606",
  tertiary: "#442e66",
  muted: "#686868",
  fontHeading: "var(--font-montserrat), 'Helvetica Neue', sans-serif",
  fontBody: "var(--font-merriweather), Georgia, serif",
};

// ── CTA button style ──────────────────────────────────────────────────────────

const CTA_BG_COLORS = ["primary", "secondary", "foreground", "background", "custom"];
const CTA_TEXT_COLORS = ["background", "foreground", "primary", "secondary", "custom"];
const CTA_BORDER_RADII = ["none", "sm", "md", "lg", "full"];
const CTA_BORDERS = ["none", "solid"];
const CTA_BORDER_COLORS = ["primary", "secondary", "foreground", "custom"];
const CTA_SHADOWS = ["none", "sm", "md"];
const CTA_FONT_WEIGHTS = ["normal", "medium", "semibold", "bold"];
const CTA_TEXT_TRANSFORMS = ["none", "uppercase", "capitalize"];
const CTA_PADDING_SIZES = ["sm", "md", "lg"];

const _CTA_BG_SET = new Set(CTA_BG_COLORS);
const _CTA_TEXT_SET = new Set(CTA_TEXT_COLORS);
const _CTA_RADII_SET = new Set(CTA_BORDER_RADII);
const _CTA_BORDERS_SET = new Set(CTA_BORDERS);
const _CTA_BORDER_COLOR_SET = new Set(CTA_BORDER_COLORS);
const _CTA_SHADOWS_SET = new Set(CTA_SHADOWS);
const _CTA_WEIGHTS_SET = new Set(CTA_FONT_WEIGHTS);
const _CTA_TRANSFORMS_SET = new Set(CTA_TEXT_TRANSFORMS);
const _CTA_PADDING_SET = new Set(CTA_PADDING_SIZES);

const CTA_RADIUS_MAP = { none: "0px", sm: "4px", md: "8px", lg: "16px", full: "9999px" };
const CTA_PADDING_MAP = {
  sm: { x: "0.875rem", y: "0.375rem" },
  md: { x: "1.25rem", y: "0.625rem" },
  lg: { x: "1.75rem", y: "0.875rem" },
};
const CTA_SHADOW_MAP = {
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,.08)",
  md: "0 4px 6px rgba(0,0,0,.10)",
};
const CTA_FONT_WEIGHT_MAP = { normal: 400, medium: 500, semibold: 600, bold: 700 };

const CTA_UPSTREAM = { type: "upstream" };
const CTA_DEFAULT_STYLE = {
  bgColor: "primary", textColor: "background", borderRadius: "md",
  border: "none", shadow: "none", fontWeight: "semibold",
  textTransform: "none", paddingSize: "md",
};

const CTA_BUILTIN_PRESETS = [
  { id: "upstream", name: "Upstream", style: CTA_UPSTREAM },
  { id: "filled",   name: "Filled",   style: { ...CTA_DEFAULT_STYLE } },
  { id: "outline",  name: "Outline",  style: { bgColor: "background", textColor: "primary", borderRadius: "md", border: "solid", borderColor: "primary", shadow: "none", fontWeight: "semibold", textTransform: "none", paddingSize: "md" } },
  { id: "pill",     name: "Pill",     style: { bgColor: "primary", textColor: "background", borderRadius: "full", border: "none", shadow: "none", fontWeight: "semibold", textTransform: "none", paddingSize: "md" } },
  { id: "secondary",name: "Secondary",style: { bgColor: "secondary", textColor: "foreground", borderRadius: "md", border: "none", shadow: "none", fontWeight: "semibold", textTransform: "none", paddingSize: "md" } },
];

/** Client-side mirror of normalizeCtaStyle from shopSettings.js */
function normalizeCtaStyleClient(source) {
  if (!source || typeof source !== "object") return { type: "upstream" };
  if (source.type === "upstream") return { type: "upstream" };
  if (!_CTA_BG_SET.has(source.bgColor)) return { type: "upstream" };
  const bgColor = source.bgColor;
  const textColor = _CTA_TEXT_SET.has(source.textColor) ? source.textColor : "background";
  const borderRadius = _CTA_RADII_SET.has(source.borderRadius) ? source.borderRadius : "md";
  const border = _CTA_BORDERS_SET.has(source.border) ? source.border : "none";
  const shadow = _CTA_SHADOWS_SET.has(source.shadow) ? source.shadow : "none";
  const fontWeight = _CTA_WEIGHTS_SET.has(source.fontWeight) ? source.fontWeight : "semibold";
  const textTransform = _CTA_TRANSFORMS_SET.has(source.textTransform) ? source.textTransform : "none";
  const paddingSize = _CTA_PADDING_SET.has(source.paddingSize) ? source.paddingSize : "md";
  const result = { bgColor, textColor, borderRadius, border, shadow, fontWeight, textTransform, paddingSize };
  if (bgColor === "custom") result.bgCustom = source.bgCustom || "#000000";
  if (textColor === "custom") result.textCustom = source.textCustom || "#ffffff";
  if (border === "solid") {
    result.borderColor = _CTA_BORDER_COLOR_SET.has(source.borderColor) ? source.borderColor : "primary";
    if (result.borderColor === "custom") result.borderCustom = source.borderCustom || "#000000";
  }
  return result;
}

/** Resolve a color slot to a hex string using current siteStyleTokens. */
function resolveCtaColor(slot, customValue, tokens) {
  if (slot === "custom") return customValue || "#000000";
  return tokens[slot] || "";
}

/** Compute inline style for the Button Style live preview button. */
function ctaPreviewStyle(cta, tokens) {
  if (!cta || cta.type === "upstream") return {};
  const bg = resolveCtaColor(cta.bgColor, cta.bgCustom, tokens);
  const color = resolveCtaColor(cta.textColor, cta.textCustom, tokens);
  const borderColor = cta.border === "solid" ? resolveCtaColor(cta.borderColor, cta.borderCustom, tokens) : "transparent";
  const pad = CTA_PADDING_MAP[cta.paddingSize] || CTA_PADDING_MAP.md;
  return {
    backgroundColor: bg,
    color,
    borderRadius: CTA_RADIUS_MAP[cta.borderRadius] || "8px",
    border: `${cta.border === "solid" ? "1px" : "0px"} solid ${borderColor}`,
    boxShadow: CTA_SHADOW_MAP[cta.shadow] || "none",
    fontWeight: CTA_FONT_WEIGHT_MAP[cta.fontWeight] || 600,
    textTransform: cta.textTransform || "none",
    padding: `${pad.y} ${pad.x}`,
    cursor: "default",
    fontSize: "0.875rem",
    display: "inline-block",
  };
}

const SITE_STYLE_COLOR_FIELDS = [
  {
    key: "background",
    labelKey: "admin.styleColorBackground",
    token: "--color-background",
  },
  {
    key: "foreground",
    labelKey: "admin.styleColorForeground",
    token: "--color-foreground",
  },
  { key: "primary", labelKey: "admin.styleColorPrimary", token: "--color-primary" },
  {
    key: "secondary",
    labelKey: "admin.styleColorSecondary",
    token: "--color-secondary",
  },
  {
    key: "tertiary",
    labelKey: "admin.styleColorTertiary",
    token: "--color-tertiary",
  },
  { key: "muted", labelKey: "admin.styleColorMuted", token: "--color-muted" },
];

const SITE_STYLE_FONT_PRESETS = [
  "var(--font-montserrat), 'Helvetica Neue', sans-serif",
  "var(--font-merriweather), Georgia, serif",
  "system-ui, -apple-system, 'Segoe UI', sans-serif",
  "Georgia, 'Times New Roman', serif",
];

const SITE_STYLE_FONT_SET = new Set(SITE_STYLE_FONT_PRESETS);
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}){1,2}$/i;

function normalizeStyleColor(value, fallback) {
  const text = String(value || "").trim();
  if (!HEX_COLOR_PATTERN.test(text)) return fallback;
  return text.toLowerCase();
}

function normalizeStyleFont(value, fallback) {
  const text = String(value || "").trim();
  if (!SITE_STYLE_FONT_SET.has(text)) return fallback;
  return text;
}

function sanitizeSiteStyleTokens(input, fallback = SITE_STYLE_DEFAULTS) {
  const source = input && typeof input === "object" ? input : {};
  return {
    background: normalizeStyleColor(source.background, fallback.background),
    foreground: normalizeStyleColor(source.foreground, fallback.foreground),
    primary: normalizeStyleColor(source.primary, fallback.primary),
    secondary: normalizeStyleColor(source.secondary, fallback.secondary),
    tertiary: normalizeStyleColor(source.tertiary, fallback.tertiary),
    muted: normalizeStyleColor(source.muted, fallback.muted),
    fontHeading: normalizeStyleFont(source.fontHeading, fallback.fontHeading),
    fontBody: normalizeStyleFont(source.fontBody, fallback.fontBody),
    ctaStyle: normalizeCtaStyleClient(source.ctaStyle),
  };
}

function readSiteStyleTokensFromDom(fallback = SITE_STYLE_DEFAULTS) {
  if (typeof window === "undefined") return { ...fallback };
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallbackValue) =>
    styles.getPropertyValue(name).trim() || fallbackValue;
  return sanitizeSiteStyleTokens(
    {
      background: read("--color-background", fallback.background),
      foreground: read("--color-foreground", fallback.foreground),
      primary: read("--color-primary", fallback.primary),
      secondary: read("--color-secondary", fallback.secondary),
      tertiary: read("--color-tertiary", fallback.tertiary),
      muted: read("--color-muted", fallback.muted),
      fontHeading: read("--font-heading", fallback.fontHeading),
      fontBody: read("--font-body", fallback.fontBody),
    },
    fallback,
  );
}

function applySiteStyleTokensToDom(tokens) {
  if (typeof window === "undefined") return;
  const safe = sanitizeSiteStyleTokens(tokens, SITE_STYLE_DEFAULTS);
  const root = document.documentElement;
  root.style.setProperty("--color-background", safe.background);
  root.style.setProperty("--color-foreground", safe.foreground);
  root.style.setProperty("--color-primary", safe.primary);
  root.style.setProperty("--color-secondary", safe.secondary);
  root.style.setProperty("--color-tertiary", safe.tertiary);
  root.style.setProperty("--color-muted", safe.muted);
  root.style.setProperty("--font-heading", safe.fontHeading);
  root.style.setProperty("--font-body", safe.fontBody);
  root.style.setProperty("--background", "var(--color-background)");
  root.style.setProperty("--foreground", "var(--color-foreground)");
  // Note: `resolve` here emits CSS var() references so the cascade resolves them.
  // ctaPreviewStyle() uses resolveCtaColor() for hex values for inline React styles.
  // Apply --btn-* CSS vars for CTA button style
  const cta = safe.ctaStyle;
  if (cta && cta.type !== "upstream" && cta.bgColor) {
    const resolve = (slot, custom) => {
      if (slot === "custom") return custom || "";
      const varMap = { primary: "var(--color-primary)", secondary: "var(--color-secondary)", foreground: "var(--color-foreground)", background: "var(--color-background)" };
      return varMap[slot] || "";
    };
    root.style.setProperty("--btn-bg", resolve(cta.bgColor, cta.bgCustom));
    root.style.setProperty("--btn-color", resolve(cta.textColor, cta.textCustom));
    root.style.setProperty("--btn-radius", CTA_RADIUS_MAP[cta.borderRadius] || "8px");
    root.style.setProperty("--btn-border-width", cta.border === "solid" ? "1px" : "0px");
    root.style.setProperty("--btn-border-color", cta.border === "solid" ? resolve(cta.borderColor, cta.borderCustom) : "transparent");
    root.style.setProperty("--btn-shadow", CTA_SHADOW_MAP[cta.shadow] || "none");
    root.style.setProperty("--btn-font-weight", String(CTA_FONT_WEIGHT_MAP[cta.fontWeight] || 600));
    root.style.setProperty("--btn-text-transform", cta.textTransform || "none");
    const pad = CTA_PADDING_MAP[cta.paddingSize] || CTA_PADDING_MAP.md;
    root.style.setProperty("--btn-padding-x", pad.x);
    root.style.setProperty("--btn-padding-y", pad.y);
  } else {
    // Upstream — remove overrides so WP theme styles apply
    ["--btn-bg","--btn-color","--btn-radius","--btn-border-width","--btn-border-color","--btn-shadow","--btn-font-weight","--btn-text-transform","--btn-padding-x","--btn-padding-y"].forEach(v => root.style.removeProperty(v));
  }
}

function applyFontRolesToDom(roles, palette, ls) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const body = document.body;

  function fontFamilyValue(role) {
    if (!role || typeof role !== "object") return null;
    if (role.type === "preset") return role.stack || null;
    if (role.type === "google") return `'${role.family}', system-ui, sans-serif`;
    return null;
  }

  const cssVarMap = {
    fontDisplay: "--font-display",
    fontHeading: "--font-heading",
    fontSubheading: "--font-subheading",
    fontBody: "--font-body",
    fontButton: "--font-button",
  };
  for (const [key, cssVar] of Object.entries(cssVarMap)) {
    const fv = fontFamilyValue(roles[key]);
    if (fv) root.style.setProperty(cssVar, fv);
  }

  const colorVarMap = {
    fontDisplay: "--font-color-display",
    fontHeading: "--font-color-heading",
    fontSubheading: "--font-color-subheading",
  };
  for (const [key, cssVar] of Object.entries(colorVarMap)) {
    const slot = roles[key]?.colorSlot;
    const hex = slot && palette[slot - 1] ? palette[slot - 1] : null;
    if (hex) root.style.setProperty(cssVar, hex);
  }

  if (ls) {
    body.setAttribute("data-link-style", ls.hoverVariant || "underline");
    body.setAttribute("data-link-underline", ls.underlineDefault || "hover");
  }
}

/** Alternating row background for product lists (purple hues). */
function emptyProduct() {
  return {
    name: "",
    slug: "",
    type: "digital_file",
    description: "",
    imageUrl: "",
    priceCents: 0,
    currency: "SEK",
    fileUrl: "",
    mimeType: "",
    vatPercent: null,
    courseUri: "",
    active: true,
    slugEdited: false,
  };
}

function deriveHealthStatus(checks) {
  if (!checks) return "red";
  const entries = Object.values(checks).filter(Boolean);
  if (entries.length === 0) return "red";
  const failing = entries.filter((check) => check.ok === false).length;
  if (failing === 0) return "green";
  if (failing <= 2) return "amber";
  return "red";
}

function emitHealthStatus(status) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("admin:healthStatus", { detail: { status } }),
  );
}

function UserAccessPanel({ users, courses, allWpContent, products }) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [panelMsg, setPanelMsg] = useState("");

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name || "").toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  // All URIs that have access configs
  const allUris = Object.keys(courses).sort();

  // Which URIs this user has access to
  const userAccess = selectedUser
    ? allUris.filter(
        (uri) =>
          Array.isArray(courses[uri]?.allowedUsers) &&
          courses[uri].allowedUsers.includes(selectedUser.email),
      )
    : [];

  function uriLabel(uri) {
    const wp = allWpContent.find((item) => item.uri === uri);
    if (wp) return wp.title || wp.name || uri;
    const shop = products.find((p) => p.courseUri === uri);
    if (shop) return shop.name || uri;
    return uri;
  }

  async function toggleAccess(uri, grant) {
    if (!selectedUser) return;
    setSaving(true);
    setPanelMsg("");
    try {
      const config = courses[uri] || {
        allowedUsers: [],
        priceCents: 0,
        currency: "SEK",
      };
      const currentUsers = Array.isArray(config.allowedUsers)
        ? [...config.allowedUsers]
        : [];
      const nextUsers = grant
        ? [...new Set([...currentUsers, selectedUser.email])]
        : currentUsers.filter((e) => e !== selectedUser.email);
      const res = await fetch("/api/admin/course-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseUri: uri,
          allowedUsers: nextUsers,
          priceCents: config.priceCents || 0,
          currency: config.currency || "SEK",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed");
      // Update courses in parent — use a custom event
      window.dispatchEvent(
        new CustomEvent("admin:coursesUpdated", { detail: json.courses }),
      );
      setPanelMsg(grant ? "Access granted." : "Access revoked.");
    } catch (err) {
      setPanelMsg(err.message || "Failed to update access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="w-full border rounded px-3 py-2 text-sm"
      />
      {filtered.length > 0 && (
        <div className="border rounded max-h-40 overflow-auto divide-y">
          {filtered.slice(0, 20).map((u) => (
            <button
              key={u.email}
              type="button"
              onClick={() => setSelectedUser(u)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                selectedUser?.email === u.email ? "bg-blue-50 font-medium" : ""
              }`}
            >
              {u.name} <span className="text-gray-400">({u.email})</span>
            </button>
          ))}
        </div>
      )}
      {selectedUser && (
        <div className="border rounded p-4 space-y-3 bg-gray-50">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-medium">{selectedUser.name}</div>
              <div className="text-xs text-gray-500">{selectedUser.email}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>

          {/* Access replication */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Access backends
            </h3>
            <p className="text-xs text-gray-500">
              Course access is written to WordPress via GraphQL, and mirrored to
              Cloudflare KV if it is configured.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1 rounded bg-green-50 text-green-800 border border-green-200">
                WordPress GraphQL: active
              </span>
              {storage?.replicas?.includes?.("cloudflare-kv") ? (
                <span className="px-3 py-1 rounded bg-green-50 text-green-800 border border-green-200">
                  Cloudflare KV mirror: active
                </span>
              ) : (
                <span className="px-3 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  Cloudflare KV mirror: disabled
                </span>
              )}
            </div>
          </div>
          <div className="text-xs font-medium text-gray-600">
            Content access:
          </div>
          {allUris.length === 0 ? (
            <p className="text-xs text-gray-400">
              No content items configured yet.
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-auto">
              {allUris.map((uri) => {
                const hasAccess = userAccess.includes(uri);
                return (
                  <label key={uri} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hasAccess}
                      disabled={saving}
                      onChange={() => toggleAccess(uri, !hasAccess)}
                    />
                    <span
                      className={hasAccess ? "text-gray-900" : "text-gray-500"}
                    >
                      {uriLabel(uri)}
                    </span>
                    <span className="text-[10px] text-gray-400">{uri}</span>
                  </label>
                );
              })}
            </div>
          )}
          {panelMsg && <p className="text-xs text-green-700">{panelMsg}</p>}
        </div>
      )}
    </div>
  );
}

const LEVEL_STYLE = {
  error: "text-red-400",
  warn: "text-yellow-400",
  info: "text-blue-300",
  log: "text-gray-300",
};

function DebugLogPanel({ clientLogs, setClientLogs }) {
  const [serverLogs, setServerLogs] = useState([]);
  const [serverError, setServerError] = useState("");
  const [tab, setTab] = useState("client");
  const [polling, setPolling] = useState(true);

  // Poll server logs every 5 s while this panel is mounted and polling is on
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    async function fetchServerLogs() {
      try {
        const res = await fetch("/api/admin/log-entries");
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setServerLogs(json.logs ?? []);
      } catch (e) {
        if (!cancelled) setServerError(String(e));
      }
    }
    fetchServerLogs();
    const id = setInterval(fetchServerLogs, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [polling]);

  async function clearServer() {
    await fetch("/api/admin/log-entries", { method: "DELETE" });
    setServerLogs([]);
  }

  const logs = tab === "client" ? clientLogs : serverLogs;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Debug logs</h3>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPolling((p) => !p)}
            className={`px-2 py-0.5 rounded border ${polling ? "border-green-400 text-green-700 bg-green-50" : "border-gray-300 text-gray-500"}`}
          >
            {polling ? "● live" : "○ paused"}
          </button>
          {tab === "client" ? (
            <button
              type="button"
              onClick={() => setClientLogs([])}
              className="px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:text-red-600"
            >
              clear
            </button>
          ) : (
            <button
              type="button"
              onClick={clearServer}
              className="px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:text-red-600"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 text-xs">
        {["client", "server"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded ${tab === t ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {t === "client"
              ? `Browser (${clientLogs.length})`
              : `Server (${serverLogs.length})`}
          </button>
        ))}
      </div>

      {serverError && tab === "server" && (
        <p className="text-xs text-red-500">{serverError}</p>
      )}

      <div className="bg-gray-900 text-gray-200 rounded p-3 font-mono text-xs max-h-72 overflow-auto space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-gray-500 italic">No entries yet.</span>
        ) : (
          logs.map((entry, i) => {
            const ts =
              tab === "client"
                ? new Date(entry.ts).toLocaleTimeString()
                : new Date(entry.ts).toLocaleTimeString();
            return (
              <div key={i} className="flex gap-2 leading-snug">
                <span className="text-gray-500 shrink-0">{ts}</span>
                <span
                  className={`shrink-0 w-10 ${LEVEL_STYLE[entry.level] ?? "text-gray-300"}`}
                >
                  [{entry.level}]
                </span>
                {entry.reqId && (
                  <span className="text-purple-400 shrink-0">
                    {entry.reqId.slice(0, 8)}
                  </span>
                )}
                <span className="break-all whitespace-pre-wrap">
                  {entry.msg}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const buildTimestamp =
    process.env.NEXT_PUBLIC_BUILD_TIME ||
    process.env.BUILD_TIME ||
    process.env.VERCEL_GIT_COMMIT_TIMESTAMP ||
    process.env.VERCEL_DEPLOYMENT_TIME ||
    "";
  const gitRevision =
    process.env.NEXT_PUBLIC_GIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "";
  const runtime = process.env.NEXT_RUNTIME || "node";
  const [courses, setCourses] = useState({});
  const [users, setUsers] = useState([]);
  const [wpCourses, setWpCourses] = useState([]);
  const [wcProducts, setWcProducts] = useState([]);
  const [wpEvents, setWpEvents] = useState([]);
  const [storage, setStorage] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedCourseActive, setSelectedCourseActive] = useState(true);
  const [price, setPrice] = useState("0.00");
  const [currency, setCurrency] = useState("SEK");
  const [vatPercent, setVatPercent] = useState("");
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [manualEmail, setManualEmail] = useState("");
  const [errorState, setErrorState] = useState({ message: "", tab: null });
  const [loading, setLoading] = useState(false);
  const [healthChecks, setHealthChecks] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [ragbazDownloadUrl, setRagbazDownloadUrl] = useState("");
  const [healthLoading, setHealthLoading] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const [clientLogs, setClientLogs] = useState([]);
  const [shouldShowWelcomeBadge, setShouldShowWelcomeBadge] = useState(
    Boolean(WELCOME_REVISION),
  );
  const [products, setProducts] = useState([]);
  const [chatBetaEnabled, setChatBetaEnabledState] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CHAT_BETA_STORAGE_KEY) === "true";
  });
  const setChatBetaEnabled = useCallback((val) => {
    const next = Boolean(val);
    setChatBetaEnabledState(next);
    try { localStorage.setItem(CHAT_BETA_STORAGE_KEY, String(next)); } catch {}
  }, []);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "welcome";
    return parseTabFromHash(window.location.hash) || "welcome";
  });
  const activeTabRef = useRef(activeTab);
  // If chat beta gets disabled while on the chat tab, redirect to info
  useEffect(() => {
    if (activeTab === "chat" && !chatBetaEnabled) setActiveTab("info");
  }, [chatBetaEnabled, activeTab]);
  const error = errorState.message;
  const showErrorBanner =
    Boolean(error) &&
    (errorState.tab === null ||
      errorState.tab === "global" ||
      errorState.tab === activeTab);
  const setError = useCallback(
    (nextMessage, tabOverride) => {
      const message = String(nextMessage || "");
      if (!message) {
        setErrorState({ message: "", tab: null });
        return;
      }
      const scopedTab = normalizeAdminTab(tabOverride || activeTab) || "global";
      setErrorState({ message, tab: scopedTab });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("toast", {
            detail: { type: "error", message, duration: 8000 },
          }),
        );
      }
    },
    [activeTab],
  );
  const [welcomeStoryVisible, setWelcomeStoryVisible] = useState(true);
  const [purging, setPurging] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [lastDeployAt, setLastDeployAt] = useState(null);
  const [userSearch, setUserSearch] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsMode, setAnalyticsMode] = useState("none"); // "zone" | "workers" | "none"
  const [analyticsConfigured, setAnalyticsConfigured] = useState(false);
  const [commits, setCommits] = useState(null);
  const [commitsError, setCommitsError] = useState("");
  const [commitsExpanded, setCommitsExpanded] = useState(false);
  const editFormRef = useRef(null);
  const [resendConfigured, setResendConfigured] = useState(false);
  const [uploadInfo, setUploadInfo] = useState({
    backend: "wordpress",
    wordpress: true,
    s3: false,
    r2: false,
  });
  const [uploadInfoDetails, setUploadInfoDetails] = useState(null);
  const [uploadBackend, setUploadBackend] = useState("wordpress");
  const [shopVisibleTypes, setShopVisibleTypes] = useState([
    "product",
    "course",
    "event",
    "digital_file",
    "digital_course",
  ]);
  const [shopSettingsSaving, setShopSettingsSaving] = useState(false);
  const [shopVatByCategory, setShopVatByCategory] = useState({});
  const [siteStyleTokens, setSiteStyleTokens] = useState(() =>
    readSiteStyleTokensFromDom(SITE_STYLE_DEFAULTS),
  );
  const [siteStyleHistory, setSiteStyleHistory] = useState([]);
  const [userCtaPresets, setUserCtaPresets] = useState([]);
  const [ctaSaveName, setCtaSaveName] = useState("");
  const [ctaSaveExpanded, setCtaSaveExpanded] = useState(false);
  const [userTypographyPresets, setUserTypographyPresets] = useState([]);
  const [typographySaveName, setTypographySaveName] = useState("");
  const [typographySaveExpanded, setTypographySaveExpanded] = useState(false);
  // Font role state (new system)
  const [fontRoles, setFontRoles] = useState({
    fontDisplay: { type: "preset", stack: "system-ui, sans-serif", colorSlot: 1 },
    fontHeading: { type: "preset", stack: "system-ui, sans-serif", colorSlot: 1 },
    fontSubheading: { type: "inherit" },
    fontBody: { type: "preset", stack: "Georgia, serif" },
    fontButton: { type: "preset", stack: "system-ui, sans-serif" },
  });
  const [typographyPalette, setTypographyPalette] = useState(["#111111"]);
  const [linkStyle, setLinkStyle] = useState({ hoverVariant: "underline", underlineDefault: "hover" });
  const [fontBrowserRole, setFontBrowserRole] = useState(null);
  const [downloadedFamilies] = useState([]);
  const [downloadingRole, setDownloadingRole] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [newTicket, setNewTicket] = useState({
    title: "",
    description: "",
    priority: "moderate",
  });
  const [commentText, setCommentText] = useState("");
  const [showImageGen, setShowImageGen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatAbortRef = useRef(null);
  const [loaded, setLoaded] = useState({
    courseAccess: false,
    products: false,
    analytics: false,
    deploy: false,
    shopSettings: false,
    tickets: false,
    uploadInfo: false,
    commits: false,
    payments: false,
  });
  const [payments, setPayments] = useState([]);
  const [paymentsEmail, setPaymentsEmail] = useState("");
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const [paymentsErrorCode, setPaymentsErrorCode] = useState("");
  const [paymentsStripeConfigured, setPaymentsStripeConfigured] = useState(true);
  const [paymentsEmptyReason, setPaymentsEmptyReason] = useState(null);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    log("mounted");
    return () => log("unmounted");
  }, []);

  useEffect(() => {
    log("activeTab", activeTab);
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.localStorage === undefined
    ) {
      return;
    }
    const stored = window.localStorage.getItem(WELCOME_SEEN_KEY);
    const next = deriveWelcomeRevisionState({
      revision: WELCOME_REVISION,
      storedRevision: stored,
      defaultShowStory: true,
    });
    setShouldShowWelcomeBadge(next.showRevisionBadge);
    setWelcomeStoryVisible(next.showStory);
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (shouldIgnoreAdminHotkeys(e)) return;
      const tab = resolveAdminTabHotkey(e);
      if (tab) {
        e.preventDefault();
        const routeDetail =
          tab === "health" ? "info/health" : tab === "stats" ? "info/stats" : tab;
        const normalizedTab = normalizeAdminTab(routeDetail) || "welcome";
        setActiveTab(normalizedTab);
        const nextHash = hashForAdminRoute(routeDetail);
        if (nextHash && window.location.hash !== nextHash) {
          const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
          window.history.replaceState(null, "", nextUrl);
        }
        window.dispatchEvent(
          new CustomEvent("admin:switchTab", { detail: routeDetail }),
        );
        return;
      }
      if (isAdminActionHotkey(e, "menuNext")) {
        e.preventDefault();
        const current = normalizeAdminTab(activeTabRef.current) || "welcome";
        const currentIndex = Math.max(0, ADMIN_TABS_BASE.indexOf(current));
        const nextIndex = (currentIndex + 1) % ADMIN_TABS_BASE.length;
        const nextTab = ADMIN_TABS_BASE[nextIndex];
        setActiveTab(nextTab);
        window.dispatchEvent(
          new CustomEvent("admin:switchTab", { detail: nextTab }),
        );
        return;
      }
      if (isAdminActionHotkey(e, "menuPrev")) {
        e.preventDefault();
        const current = normalizeAdminTab(activeTabRef.current) || "welcome";
        const currentIndex = Math.max(0, ADMIN_TABS_BASE.indexOf(current));
        const prevIndex =
          (currentIndex - 1 + ADMIN_TABS_BASE.length) % ADMIN_TABS_BASE.length;
        const prevTab = ADMIN_TABS_BASE[prevIndex];
        setActiveTab(prevTab);
        window.dispatchEvent(
          new CustomEvent("admin:switchTab", { detail: prevTab }),
        );
        return;
      }
      if (isAdminActionHotkey(e, "logout")) {
        e.preventDefault();
        logoutAdmin();
        return;
      }
      if (isAdminActionHotkey(e, "search")) {
        e.preventDefault();
        const searchInput = document.querySelector(
          "input[type='search'], input[aria-label='search']",
        );
        if (searchInput) searchInput.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onHashChange() {
      const rawHash = String(window.location.hash || "").toLowerCase();
      const legacyToInfoHash = rawHash.startsWith("#/health")
        ? "#/info/health"
        : rawHash.startsWith("#/stats")
          ? "#/info/stats"
          : rawHash.startsWith("#/docs")
            ? "#/info/docs"
            : null;
      if (legacyToInfoHash && window.location.hash !== legacyToInfoHash) {
        const migratedUrl = `${window.location.pathname}${window.location.search}${legacyToInfoHash}`;
        window.history.replaceState(null, "", migratedUrl);
      }

      const tab = parseTabFromHash(window.location.hash);
      if (!tab) {
        if (window.__RAGBAZ_IMPRESS_ACTIVE__) {
          return;
        }
        const fallback = ADMIN_TAB_SET.has(activeTabRef.current)
          ? activeTabRef.current
          : "welcome";
        const expected = `#/${fallback}`;
        if (window.location.hash !== expected) {
          const nextUrl = `${window.location.pathname}${window.location.search}${expected}`;
          window.history.replaceState(null, "", nextUrl);
        }
        return;
      }
      setActiveTab(tab);
      window.dispatchEvent(
        new CustomEvent("admin:switchTab", { detail: window.location.hash }),
      );
    }
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !ADMIN_TAB_SET.has(activeTab)) return;
    if (
      activeTab === "info" &&
      String(window.location.hash || "").toLowerCase().startsWith("#/info/")
    ) {
      return;
    }
    const nextHash = `#/${activeTab}`;
    if (window.location.hash === nextHash) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeTab]);

  const handleWelcomeSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    persistWelcomeRevision(window.localStorage, WELCOME_REVISION);
    setShouldShowWelcomeBadge(false);
  }, []);

  const hideWelcomeStory = useCallback(() => {
    setWelcomeStoryVisible(false);
    handleWelcomeSeen();
  }, [handleWelcomeSeen]);

  const replayWelcomeStory = useCallback(() => {
    setWelcomeStoryVisible(true);
  }, []);

  // Derived values for shop product selection
  const isShopSelection = selectedCourse.startsWith("__shop_");
  const shopIndex = isShopSelection
    ? Number.parseInt(selectedCourse.replace("__shop_", ""), 10)
    : -1;
  const selectedShopProduct =
    isShopSelection && shopIndex >= 0 && shopIndex < products.length
      ? products[shopIndex]
      : null;
  const isWpSelection =
    selectedCourse && !selectedCourse.startsWith("__") && selectedCourse !== "";

  // The URI used for access config (empty if not applicable)
  const accessUri = useMemo(() => {
    if (
      !selectedCourse ||
      selectedCourse === "__custom__" ||
      selectedCourse === "__new__"
    )
      return "";
    if (isShopSelection) {
      return selectedShopProduct?.type === "course"
        ? selectedShopProduct.courseUri
        : "";
    }
    return selectedCourse;
  }, [selectedCourse, isShopSelection, selectedShopProduct]);

  const loadCourseAccess = useCallback(async () => {
    if (loaded.courseAccess) return;
    try {
      const { res, json } = await adminFetch("/api/admin/course-access");
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.fetchAdminDataFailed"));
      setCourses(json.courses || {});
      setUsers(Array.isArray(json.users) ? json.users : []);
      setWpCourses(Array.isArray(json.wpCourses) ? json.wpCourses : []);
      setWcProducts(Array.isArray(json.wcProducts) ? json.wcProducts : []);
      setWpEvents(Array.isArray(json.wpEvents) ? json.wpEvents : []);
      setStorage(json.storage || null);
      setResendConfigured(!!json.resendConfigured);
      if (json.upload) {
        setUploadInfo(json.upload);
        setUploadBackend(json.upload.backend || "wordpress");
      }
      setLoaded((s) => ({ ...s, courseAccess: true, uploadInfo: true }));
    } catch (fetchError) {
      console.error(
        "AdminDashboard: failed to load course-access data",
        fetchError,
      );
      setError(fetchError.message || t("admin.fetchAdminDataFailed"));
    }
  }, [loaded.courseAccess, setError]);

  const loadProducts = useCallback(async () => {
    if (loaded.products) return;
    try {
      const { res, json } = await adminFetch("/api/admin/products");
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.fetchProductsFailed"));
      const rows = Array.isArray(json.products) ? json.products : [];
      setProducts(
        rows.map((product) => ({
          ...emptyProduct(),
          ...product,
          slugEdited: true,
        })),
      );
      setLoaded((s) => ({ ...s, products: true }));
    } catch (fetchError) {
      console.error("AdminDashboard: failed to load products", fetchError);
      setError(fetchError.message || t("admin.fetchProductListFailed"));
    }
  }, [loaded.products, setError]);

  const loadAnalytics = useCallback(async () => {
    if (loaded.analytics) return;
    try {
      const { res, json } = await adminFetch("/api/admin/analytics");
      if (res.ok && json?.ok) {
        setAnalytics(json.analytics);
        setAnalyticsMode(json.mode || "none");
        setAnalyticsConfigured(json.configured);
      }
      setLoaded((s) => ({ ...s, analytics: true }));
    } catch (err) {
      console.error("AdminDashboard: failed to load analytics", err);
    }
  }, [loaded.analytics]);

  const loadDeploy = useCallback(async () => {
    if (loaded.deploy) return;
    try {
      const { json } = await adminFetch("/api/admin/deploy/last");
      if (json?.timestamp) setLastDeployAt(json.timestamp);
      setLoaded((s) => ({ ...s, deploy: true }));
    } catch (err) {
      console.error(
        "AdminDashboard: failed to load last deploy timestamp",
        err,
      );
    }
  }, [loaded.deploy]);

  const loadShopSettings = useCallback(async () => {
    if (loaded.shopSettings) return;
    try {
      const { res, json } = await adminFetch("/api/admin/shop-settings");
      if (res.ok && json?.ok && Array.isArray(json.settings?.visibleTypes)) {
        setShopVisibleTypes(json.settings.visibleTypes);
      }
      if (
        json?.settings?.vatByCategory &&
        typeof json.settings.vatByCategory === "object"
      ) {
        setShopVatByCategory(json.settings.vatByCategory);
      }
      const fallbackTokens = readSiteStyleTokensFromDom(SITE_STYLE_DEFAULTS);
      const nextSiteStyle = sanitizeSiteStyleTokens(
        json?.settings?.siteStyle,
        fallbackTokens,
      );
      setSiteStyleTokens(nextSiteStyle);
      applySiteStyleTokensToDom(nextSiteStyle);
      // Load new font role state from API
      if (json?.settings?.siteStyle) {
        const s = json.settings.siteStyle;
        setFontRoles((prev) => ({
          fontDisplay: s.fontDisplay || prev.fontDisplay,
          fontHeading: s.fontHeading && typeof s.fontHeading === "object" ? s.fontHeading : prev.fontHeading,
          fontSubheading: s.fontSubheading || prev.fontSubheading,
          fontBody: s.fontBody && typeof s.fontBody === "object" ? s.fontBody : prev.fontBody,
          fontButton: s.fontButton || prev.fontButton,
        }));
        if (s.typographyPalette) setTypographyPalette(s.typographyPalette);
        if (s.linkStyle) setLinkStyle(s.linkStyle);
      }
      setSiteStyleHistory(
        Array.isArray(json?.settings?.siteStyleHistory)
          ? json.settings.siteStyleHistory
          : [],
      );
      setLoaded((s) => ({ ...s, shopSettings: true }));
      // Load style presets
      adminFetch("/api/admin/style-presets")
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.ok) {
            if (Array.isArray(data.cta)) setUserCtaPresets(data.cta);
            if (Array.isArray(data.typography)) setUserTypographyPresets(data.typography);
          }
        })
        .catch(() => {});
    } catch (err) {
      console.error("AdminDashboard: failed to load shop settings", err);
    }
  }, [loaded.shopSettings]);

  const loadTickets = useCallback(async () => {
    if (loaded.tickets) return;
    setTicketsLoading(true);
    setTicketsError("");
    try {
      const res = await fetch("/api/admin/tickets");
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.ticketFetchFailed"));
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
      if (!selectedTicketId && json.tickets?.[0]?.id) {
        setSelectedTicketId(json.tickets[0].id);
      }
      setLoaded((s) => ({ ...s, tickets: true }));
    } catch (err) {
      setTicketsError(err.message || t("admin.ticketFetchFailed"));
    } finally {
      setTicketsLoading(false);
    }
  }, [loaded.tickets, selectedTicketId]);

  const loadUploadInfo = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/upload-info?backend=${encodeURIComponent(uploadBackend)}`,
      );
      const json = await res.json().catch(() => ({}));
      if (json?.upload) {
        setUploadInfo(json.upload);
        setUploadBackend(json.upload.backend || "wordpress");
      }
      if (json?.ok) {
        setUploadInfoDetails(json);
      }
      setLoaded((s) => ({ ...s, uploadInfo: true }));
    } catch (err) {
      console.error("AdminDashboard: failed to load upload info", err);
    }
  }, [uploadBackend]);

  const loadCommits = useCallback(async () => {
    if (loaded.commits) return;
    setCommitsError("");
    try {
      const res = await fetch("/api/admin/commits");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCommits(Array.isArray(json?.commits) ? json.commits : []);
      setLoaded((s) => ({ ...s, commits: true }));
    } catch (err) {
      setCommitsError(err.message || "Failed to load commits");
    }
  }, [loaded.commits]);

  const loadPayments = useCallback(
    async (emailFilter) => {
      setPaymentsLoading(true);
      setPaymentsError("");
      setPaymentsErrorCode("");
      setPaymentsEmptyReason(null);
      try {
        const url = new URL("/api/admin/payments", window.location.origin);
        if (emailFilter) url.searchParams.set("email", emailFilter);
        const res = await fetch(url.toString());
        const json = await res.json();
        setPaymentsStripeConfigured(json?.stripeConfigured !== false);
        setPaymentsEmptyReason(json?.emptyReason || null);
        if (!res.ok || !json?.ok) {
          const err = new Error(json?.error || "Failed to load payments");
          err.code = json?.code || `http_${res.status}`;
          throw err;
        }
        setPayments(json.payments || []);
        setLoaded((s) => ({ ...s, payments: true }));
      } catch (err) {
        setPaymentsError(err.message || "Failed to load payments");
        setPaymentsErrorCode(err.code || "payments_load_failed");
      } finally {
        setPaymentsLoading(false);
      }
    },
    [],
  );

  const runHealthCheck = useCallback(async () => {
    log("healthCheck:start");
    setHealthLoading(true);
    setError("");
    try {
      const { res, json, reqId, duration } =
        await adminFetch("/api/admin/health");
      setDebugLogs((prev) =>
        [
          {
            ts: Date.now(),
            reqId,
            status: res.status,
            duration,
            path: "/api/admin/health",
          },
          ...prev,
        ].slice(0, 10),
      );
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || t("admin.healthCheckFailed"));
      }
      setHealthChecks(json.checks || {});
      if (json.webhookUrl) setWebhookUrl(json.webhookUrl);
      if (json.ragbazDownloadUrl) setRagbazDownloadUrl(json.ragbazDownloadUrl);
      log("healthCheck:ok", { checks: Object.keys(json.checks || {}) });
    } catch (healthError) {
      const msg =
        healthError instanceof Error
          ? healthError.message
          : t("admin.healthCheckFailed");
      setError(msg);
      log("healthCheck:error", msg);
    } finally {
      setHealthLoading(false);
      log("healthCheck:done");
    }
  }, [setError]);

  useEffect(() => {
    loadCourseAccess();
    loadProducts();
  }, [loadCourseAccess, loadProducts]);

  useEffect(() => {
    if (activeTab === "products" || activeTab === "style") {
      loadShopSettings();
    }
    if (activeTab === "support") {
      loadTickets();
    }
    if (activeTab === "media" || activeTab === "info") {
      loadUploadInfo();
    }
    if (activeTab === "info") {
      loadCommits();
      loadAnalytics();
      loadDeploy();
    }
    if (
      (activeTab === "support" || activeTab === "sales") &&
      !loaded.payments
    ) {
      loadPayments(paymentsEmail);
    }
  }, [
    activeTab,
    loadAnalytics,
    loadDeploy,
    loadShopSettings,
    loadTickets,
    loadUploadInfo,
    loadCommits,
    loadPayments,
    paymentsEmail,
    loaded.payments,
  ]);

  async function saveShopSettings(nextSettings, successMessageKey) {
    setShopSettingsSaving(true);
    try {
      const res = await fetch("/api/admin/shop-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || t("admin.shopSettingsSaveFailed"));
      }
      if (Array.isArray(json.settings?.visibleTypes)) {
        setShopVisibleTypes(json.settings.visibleTypes);
      }
      if (json.settings?.vatByCategory && typeof json.settings.vatByCategory === "object") {
        setShopVatByCategory(json.settings.vatByCategory);
      }
      if (json.settings?.siteStyle && typeof json.settings.siteStyle === "object") {
        const nextSiteStyle = sanitizeSiteStyleTokens(
          json.settings.siteStyle,
          SITE_STYLE_DEFAULTS,
        );
        setSiteStyleTokens(nextSiteStyle);
        applySiteStyleTokensToDom(nextSiteStyle);
      }
      if (Array.isArray(json.settings?.siteStyleHistory)) {
        setSiteStyleHistory(json.settings.siteStyleHistory);
      }
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: t(successMessageKey || "admin.shopVisibilitySaved") },
        }),
      );
    } catch (err) {
      console.error("Failed to save shop settings:", err);
      setError(err.message || t("admin.shopSettingsSaveFailed"));
    } finally {
      setShopSettingsSaving(false);
    }
  }

  function toggleShopType(type) {
    const next = shopVisibleTypes.includes(type)
      ? shopVisibleTypes.filter((t) => t !== type)
      : [...shopVisibleTypes, type];
    setShopVisibleTypes(next);
    saveShopSettings(
      { visibleTypes: next, vatByCategory: shopVatByCategory },
      "admin.shopVisibilitySaved",
    );
  }

  function updateShopVatByCategory(nextVatByCategory) {
    setShopVatByCategory(nextVatByCategory);
    saveShopSettings(
      { visibleTypes: shopVisibleTypes, vatByCategory: nextVatByCategory },
      "admin.vatMapSaved",
    );
  }

  function updateSiteStyleColor(key, value) {
    if (!key || !Object.prototype.hasOwnProperty.call(SITE_STYLE_DEFAULTS, key)) {
      return;
    }
    setSiteStyleTokens((current) => {
      const next = sanitizeSiteStyleTokens(
        { ...current, [key]: value },
        current,
      );
      applySiteStyleTokensToDom(next);
      return next;
    });
  }

  function updateSiteStyleFont(key, value) {
    if (key !== "fontHeading" && key !== "fontBody") return;
    setSiteStyleTokens((current) => {
      const next = sanitizeSiteStyleTokens(
        { ...current, [key]: value },
        current,
      );
      applySiteStyleTokensToDom(next);
      return next;
    });
  }

  function resetSiteStyleDefaults() {
    const defaults = { ...SITE_STYLE_DEFAULTS };
    setSiteStyleTokens(defaults);
    applySiteStyleTokensToDom(defaults);
  }

  async function saveSiteStyleSettings() {
    const safe = sanitizeSiteStyleTokens(siteStyleTokens, SITE_STYLE_DEFAULTS);
    setSiteStyleTokens(safe);
    applySiteStyleTokensToDom(safe);
    await saveShopSettings({
      siteStyle: {
        ...safe,
        ...fontRoles,
        typographyPalette,
        linkStyle,
      },
    }, "admin.styleSiteSaved");
  }

  async function restoreSiteStyleRevision(revision) {
    const candidate =
      revision && typeof revision === "object" ? revision.style : null;
    if (!candidate || typeof candidate !== "object") return;
    const safe = sanitizeSiteStyleTokens(candidate, SITE_STYLE_DEFAULTS);
    setSiteStyleTokens(safe);
    applySiteStyleTokensToDom(safe);
    await saveShopSettings({ siteStyle: safe }, "admin.styleSiteRestored");
  }

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || tickets[0],
    [tickets, selectedTicketId],
  );

  async function rebuildIndex() {
    setChatLoading(true);
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: "rebuild index" },
    ]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "rebuild index", rebuild: true }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || "Rebuild failed");
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: json.answer || "Index rebuilt.",
          sources: json.sources || [],
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err.message || "Rebuild failed",
          sources: [],
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const message = chatInput.trim();
    const isRebuild =
      /^rebuild\s+index$/i.test(message) ||
      /^(indexera|bygg\s+om\s+index|återbygg\s+index)$/i.test(message) ||
      /^(reindexar|reconstruir\s+[ií]ndice|regenerar\s+[ií]ndice)$/i.test(
        message,
      );
    setChatInput("");
    if (isRebuild) {
      await rebuildIndex();
      return;
    }
    // Cancel any in-flight request
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const history = [...chatMessages, { role: "user", content: message }];
    setChatMessages(history);
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Chat failed");
      if (json.type === "image-generation") {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", type: "image-generation", prompt: json.prompt },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: json.answer,
            sources: json.sources || [],
          },
        ]);
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err.message || "Chat failed",
          sources: [],
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function clearChat() {
    setChatMessages([]);
    try {
      await fetch("/api/chat", { method: "DELETE" });
    } catch (err) {
      console.error("clearChat error", err);
    }
  }

  async function downloadReceipt(chargeId) {
    setDownloading(chargeId);
    try {
      // First try: proxy the Stripe invoice PDF (works for invoice-backed charges).
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `receipt-${chargeId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      // Fallback: open the generated HTML receipt (always works, printable as PDF).
      const receiptUrl = `/api/admin/payments/receipt?chargeId=${encodeURIComponent(chargeId)}`;
      window.open(receiptUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      // Network-level failure — open HTML receipt as last resort.
      try {
        window.open(
          `/api/admin/payments/receipt?chargeId=${encodeURIComponent(chargeId)}`,
          "_blank",
          "noopener,noreferrer",
        );
      } catch {
        setError(
          err.message ||
            t("admin.receiptDownloadFailed", "Failed to download receipt"),
        );
      }
    } finally {
      setDownloading(null);
    }
  }

  async function createSupportTicket() {
    if (!newTicket.title.trim()) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "error", message: t("admin.requiredField") },
        }),
      );
      return;
    }
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newTicket,
          buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || "",
          gitSha: process.env.NEXT_PUBLIC_GIT_SHA || "",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.ticketUpdateFailed"));
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
      setNewTicket({ title: "", description: "", priority: "moderate" });
      setSelectedTicketId(json.ticket?.id || json.tickets?.[0]?.id || null);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: t("admin.ticketCreated") },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            type: "error",
            message: err.message || t("admin.ticketUpdateFailed"),
          },
        }),
      );
    }
  }

  const [ticketSaving, setTicketSaving] = useState(false);

  async function updateSupportTicket({ status, comment }) {
    if (!selectedTicket) return;
    setTicketSaving(true);
    try {
      const payload = { id: selectedTicket.id };
      if (status !== undefined) payload.status = status;
      if (comment !== undefined) payload.comment = comment;
      const res = await fetch("/api/admin/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.ticketUpdateFailed"));
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
      if (comment) setCommentText("");
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: t("admin.ticketUpdated") },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            type: "error",
            message: err.message || t("admin.ticketUpdateFailed"),
          },
        }),
      );
    } finally {
      setTicketSaving(false);
    }
  }

  // Build a unified list of all WordPress content items
  const allWpContent = useMemo(() => {
    const items = [];
    for (const p of wcProducts) items.push(p);
    for (const c of wpCourses) items.push(c);
    for (const e of wpEvents) items.push(e);
    return items;
  }, [wcProducts, wpCourses, wpEvents]);

  // Load price + access when selection changes
  useEffect(() => {
    if (!selectedCourse || selectedCourse === "__new__") return;

    // Shop product: load price from product data
    if (isShopSelection && selectedShopProduct) {
      setPrice(toCurrencyUnits(selectedShopProduct.priceCents ?? 0));
      setCurrency((selectedShopProduct.currency || "SEK").toUpperCase());
      setVatPercent(vatPercentToInput(selectedShopProduct.vatPercent));
      setSelectedCourseActive(true);
      const uri =
        selectedShopProduct.type === "course"
          ? selectedShopProduct.courseUri
          : "";
      if (uri && courses[uri]) {
        setAllowedUsers(
          Array.isArray(courses[uri].allowedUsers)
            ? courses[uri].allowedUsers
            : [],
        );
      } else {
        setAllowedUsers([]);
      }
      return;
    }

    // WP item or manual URI
    const config = courses[selectedCourse];
    if (config) {
      setPrice(toCurrencyUnits(config.priceCents ?? 0));
      setCurrency((config.currency || "SEK").toUpperCase());
      setVatPercent(vatPercentToInput(config.vatPercent));
      setSelectedCourseActive(config.active !== false);
      setAllowedUsers(
        Array.isArray(config.allowedUsers) ? config.allowedUsers : [],
      );
      return;
    }
    // Auto-fill price from WordPress content
    const match = allWpContent.find((item) => item.uri === selectedCourse);
    const rawPrice =
      match?.price || match?.priceRendered || match?.regularPrice || "";
    const wpPriceCents = parsePriceCents(rawPrice);
    setPrice(wpPriceCents > 0 ? toCurrencyUnits(wpPriceCents) : "");
    setSelectedCourseActive(true);
    setCurrency("SEK");
    setVatPercent("");
    setAllowedUsers([]);
  }, [
    selectedCourse,
    courses,
    allWpContent,
    isShopSelection,
    selectedShopProduct,
  ]);

  const knownCourses = useMemo(
    () => Object.keys(courses).sort((a, b) => a.localeCompare(b)),
    [courses],
  );

  const otherCourseUris = useMemo(
    () =>
      knownCourses.filter(
        (uri) =>
          !allWpContent.some((item) => item.uri === uri) &&
          !products.some((p) => p.courseUri === uri || p.slug === uri),
      ),
    [knownCourses, allWpContent, products],
  );

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  function toggleUser(email) {
    setAllowedUsers((prev) =>
      prev.includes(email)
        ? prev.filter((value) => value !== email)
        : [...prev, email],
    );
  }

  function addManualEmail() {
    const email = manualEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (!allowedUsers.includes(email)) {
      setAllowedUsers((prev) => [...prev, email]);
    }
    setManualEmail("");
  }

  function updateProduct(index, key, value) {
    setProducts((prev) =>
      prev.map((product, idx) => {
        if (idx !== index) return product;
        if (key === "name") {
          const nextName = value;
          const nextSlug = product.slugEdited
            ? product.slug
            : slugify(nextName);
          return { ...product, name: nextName, slug: nextSlug };
        }
        if (key === "slug") {
          return { ...product, slug: slugify(value), slugEdited: true };
        }
        return { ...product, [key]: value };
      }),
    );
  }

  function removeShopProduct(index) {
    if (!window.confirm(t("admin.confirmRemoveProduct"))) return;
    setProducts((prev) => prev.filter((_, idx) => idx !== index));
    setSelectedCourse("");
  }

  function handleSelection(value) {
    if (value === "__new__") {
      const newProducts = [...products, emptyProduct()];
      setProducts(newProducts);
      setSelectedCourse(`__shop_${newProducts.length - 1}`);
      setTimeout(
        () =>
          editFormRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        50,
      );
    } else {
      setSelectedCourse(value);
    }
  }

  // Whether to show the detail panel
  const showDetail =
    (isWpSelection || isShopSelection) && selectedCourse !== "__custom__";

  // Scroll to edit section when a product/content is selected
  useEffect(() => {
    if (!selectedCourse) return;
    if (!showDetail) return;
    const id = setTimeout(() => {
      editFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
    return () => clearTimeout(id);
  }, [selectedCourse, showDetail]);

  // Unified save: handles both shop products and content access
  async function saveUnified() {
    setError("");

    const uri = accessUri;
    const nextPriceCents = toCents(price);
    const nextVatPercent = parseVatPercentInput(vatPercent);
    const normalizedCurrency = (currency || "SEK").toUpperCase();
    const wpMatch = isWpSelection
      ? allWpContent.find((item) => item.uri === uri)
      : null;
    const wpFallbackPriceCents = wpMatch
      ? parsePriceCents(
          wpMatch.price ||
            wpMatch.priceRendered ||
            wpMatch.regularPrice ||
            wpMatch.priceText ||
            "",
        )
      : 0;

    // Validate WP item selection
    if (isWpSelection) {
      if (
        (price === "" || price === null || price === undefined) &&
        wpFallbackPriceCents <= 0
      ) {
        setError(t("admin.enterPrice"));
        return;
      }
    }

    setLoading(true);

    try {
      // If a shop product was edited, sync price back and save all products
      if (isShopSelection && shopIndex >= 0) {
        const updated = products.map((p, i) =>
          i === shopIndex
            ? {
                ...p,
                priceCents: toCents(price),
                currency: currency.toUpperCase(),
                vatPercent: nextVatPercent,
              }
            : p,
        );
        const payload = updated.map((p) => ({
          name: p.name,
          slug: p.slug,
          type: p.type === "course" ? "course" : "digital_file",
          description: p.description,
          imageUrl: p.imageUrl,
          priceCents: Number.isFinite(p.priceCents)
            ? p.priceCents
            : Number.parseInt(String(p.priceCents || "0"), 10) || 0,
          currency: (p.currency || "SEK").toUpperCase(),
          fileUrl: p.fileUrl,
          mimeType: p.mimeType || "",
          vatPercent:
            typeof p.vatPercent === "number" && Number.isFinite(p.vatPercent)
              ? p.vatPercent
              : null,
          courseUri: p.courseUri,
          active: p.active !== false,
        }));

        const res = await fetch("/api/admin/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: payload }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || t("admin.saveProductsFailed"));
        }
        const rows = Array.isArray(json.products) ? json.products : [];
        setProducts(
          rows.map((p) => ({ ...emptyProduct(), ...p, slugEdited: true })),
        );
      }

      // Save access config if there's a content URI
      if (uri) {
        const nextActive = isShopSelection ? undefined : selectedCourseActive;
        const currentConfig = courses[uri];
        const hasManualUsers =
          Array.isArray(allowedUsers) && allowedUsers.length > 0;
        const hasInactiveOverride =
          !isShopSelection &&
          typeof nextActive === "boolean" &&
          nextActive === false;
        const hasCurrencyOverride =
          !currentConfig && isWpSelection && normalizedCurrency !== "SEK";
        const needsManualPrice =
          !isWpSelection ||
          nextPriceCents !== wpFallbackPriceCents ||
          wpFallbackPriceCents <= 0;
        const shouldPersistAccess =
          isShopSelection ||
          Boolean(currentConfig) ||
          hasManualUsers ||
          hasInactiveOverride ||
          hasCurrencyOverride ||
          needsManualPrice;

        if (shouldPersistAccess) {
          const res = await fetch("/api/admin/course-access", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              courseUri: uri,
              allowedUsers,
              priceCents: nextPriceCents,
              currency: normalizedCurrency,
              vatPercent: nextVatPercent,
              ...(typeof nextActive === "boolean" ? { active: nextActive } : {}),
            }),
          });
          const json = await res.json();
          if (!res.ok || !json?.ok) {
            throw new Error(json?.error || t("admin.saveFailed"));
          }
          setCourses(json.courses || {});
        }
      }

      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: t("admin.courseAccessUpdated") },
        }),
      );
    } catch (err) {
      setError(err.message || t("admin.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  // Listen for tab-switch events from AdminHeader
  useEffect(() => {
    function onSwitchTab(e) {
      const rawDetail = String(e?.detail || "");
      const detail = rawDetail.replace(/^#\/?/, "");
      const tab = normalizeAdminTab(detail);
      if (!tab) return;
      setActiveTab(tab);

      const nextHash = hashForAdminRoute(detail);
      if (
        nextHash &&
        typeof window !== "undefined" &&
        window.location.hash !== nextHash
      ) {
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(null, "", nextUrl);
      }
    }
    window.addEventListener("admin:switchTab", onSwitchTab);
    return () => {
      window.removeEventListener("admin:switchTab", onSwitchTab);
    };
  }, []);

  // Fetch commit log when Info tab is shown
  useEffect(() => {
    if (activeTab !== "info" || commits) return;
    fetch("/api/admin/commits")
      .then(async (res) => {
        const json = await res.json();
        if (json?.ok) { setCommits(json.commits); setCommitsError(""); }
        else setCommitsError(json?.error || "Failed to load commits");
      })
      .catch(() => setCommitsError("Failed to load commits"));
  }, [activeTab, commits]);

  // Listen for courses updated from UserAccessPanel
  useEffect(() => {
    function onCoursesUpdated(e) {
      if (e.detail) setCourses(e.detail);
    }
    window.addEventListener("admin:coursesUpdated", onCoursesUpdated);
    return () =>
      window.removeEventListener("admin:coursesUpdated", onCoursesUpdated);
  }, []);

  // Intercept browser console to feed the client log panel in Sandbox tab
  useEffect(() => {
    const orig = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    function capture(level) {
      return (...args) => {
        orig[level](...args);
        const msg = args
          .map((a) =>
            a && typeof a === "object" ? JSON.stringify(a) : String(a),
          )
          .join(" ");
        setClientLogs((prev) =>
          [{ ts: Date.now(), level, msg }].concat(prev).slice(0, 50),
        );
      };
    }
    console.log = capture("log");
    console.info = capture("info");
    console.warn = capture("warn");
    console.error = capture("error");
    return () => Object.assign(console, orig);
  }, []);

  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadingField, setUploadingField] = useState(null);

  async function uploadFile(index, field) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = field === "imageUrl" ? "image/*" : "*/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const MULTIPART_THRESHOLD = 95 * 1024 * 1024; // 95 MB

      try {
        if (file.size > MULTIPART_THRESHOLD) {
          // Large file — use multipart upload directly to R2
          setUploadProgress({ percent: 0, currentPart: 0, totalParts: 0 });
          const url = await multipartUpload(file, {
            backend: uploadBackend,
            onProgress: (p) => setUploadProgress(p),
          });
          setUploadProgress(null);
          updateProduct(index, field, url);
          if (field === "fileUrl") {
            updateProduct(index, "mimeType", file.type || "");
          }
        } else {
          // Small file — use regular upload through Worker
          setUploadingField(field);
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch(
            `/api/admin/upload?backend=${encodeURIComponent(uploadBackend)}`,
            {
              method: "POST",
              body: formData,
            },
          );
          setUploadingField(null);
          const json = await res.json();
          if (!res.ok || !json?.ok) {
            setError(json?.error || t("admin.uploadFailed"));
            return;
          }
          updateProduct(index, field, json.url);
          if (field === "fileUrl") {
            updateProduct(index, "mimeType", file.type || json.mimeType || "");
          }
        }
      } catch (err) {
        setUploadProgress(null);
        setUploadingField(null);
        setError(err.message || t("admin.uploadFailed"));
      }
    };
    input.click();
  }

  async function purgeCache() {
    setPurging(true);
    try {
      const res = await fetch("/api/admin/purge-cache", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.purgeFailed"));
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: t("admin.cachePurged") },
        }),
      );
    } catch (err) {
      setError(err.message || t("admin.purgeFailed"));
    } finally {
      setPurging(false);
    }
  }

  async function triggerDeploy() {
    setDeploying(true);
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || t("admin.deployFailed"));
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "success", message: t("admin.deployTriggered") },
        }),
      );
    } catch (err) {
      setError(err.message || t("admin.deployFailed"));
    } finally {
      setDeploying(false);
    }
  }

  const dashboardSectionClass =
    activeTab === "welcome" && welcomeStoryVisible
      ? "w-full min-w-0 px-0 py-0"
      : "mx-auto w-full max-w-screen-2xl min-w-0 px-3 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-10 space-y-6 sm:space-y-8";

  return (
    <section className={dashboardSectionClass}>
      {activeTab === "welcome" && (
        <Suspense
          fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}
        >
          <AdminWelcomeTab
            onSeenRevision={handleWelcomeSeen}
            showRevisionBadge={shouldShowWelcomeBadge}
            showStory={welcomeStoryVisible}
            onHideStory={hideWelcomeStory}
            onReplayStory={replayWelcomeStory}
          />
        </Suspense>
      )}
      {/* ── Media tab ── */}
      {activeTab === "media" && (
        <Suspense
          fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}
        >
          <AdminMediaLibraryTab
            uploadBackend={uploadBackend}
            uploadInfo={uploadInfo}
            uploadInfoDetails={uploadInfoDetails}
          />
        </Suspense>
      )}

      {/* ── Unified Products & Access tab ── */}
      {activeTab === "products" && (
        <Suspense
          fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}
        >
          <AdminProductsTab
            shopVisibleTypes={shopVisibleTypes}
            toggleShopType={toggleShopType}
            shopVatByCategory={shopVatByCategory}
            updateShopVatByCategory={updateShopVatByCategory}
            shopSettingsSaving={shopSettingsSaving}
            wcProducts={wcProducts}
            wpCourses={wpCourses}
            wpEvents={wpEvents}
            products={products}
            courses={courses}
            otherCourseUris={otherCourseUris}
            allWpContent={allWpContent}
            selectedCourse={selectedCourse}
            setSelectedCourse={setSelectedCourse}
            handleSelection={handleSelection}
            isWpSelection={isWpSelection}
            isShopSelection={isShopSelection}
            selectedShopProduct={selectedShopProduct}
            shopIndex={shopIndex}
            showDetail={showDetail}
            editFormRef={editFormRef}
            updateProduct={updateProduct}
            removeShopProduct={removeShopProduct}
            uploadFile={uploadFile}
            uploadingField={uploadingField}
            uploadBackend={uploadBackend}
            uploadInfo={uploadInfo}
            runtime={runtime}
            showImageGen={showImageGen}
            setShowImageGen={setShowImageGen}
            setWpEvents={setWpEvents}
            setWcProducts={setWcProducts}
            setWpCourses={setWpCourses}
            setError={setError}
            price={price}
            setPrice={setPrice}
            currency={currency}
            setCurrency={setCurrency}
            vatPercent={vatPercent}
            setVatPercent={setVatPercent}
            userSearch={userSearch}
            setUserSearch={setUserSearch}
            users={users}
            selectedCourseActive={selectedCourseActive}
            setSelectedCourseActive={setSelectedCourseActive}
            allowedUsers={allowedUsers}
            filteredUsers={filteredUsers}
            toggleUser={toggleUser}
            manualEmail={manualEmail}
            setManualEmail={setManualEmail}
            addManualEmail={addManualEmail}
            saveUnified={saveUnified}
            loading={loading}
            storage={storage}
          />
        </Suspense>
      )}

      {/* ── Support tab ── */}
      {activeTab === "support" && (
        <Suspense
          fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}
        >
          <AdminSupportTab
            tickets={tickets}
            ticketsLoading={ticketsLoading}
            ticketsError={ticketsError}
            selectedTicket={selectedTicket}
            setSelectedTicketId={setSelectedTicketId}
            newTicket={newTicket}
            setNewTicket={setNewTicket}
            commentText={commentText}
            setCommentText={setCommentText}
            createSupportTicket={createSupportTicket}
            updateSupportTicket={updateSupportTicket}
            ticketSaving={ticketSaving}
          />
        </Suspense>
      )}

      {/* ── Sales tab ── */}
      {activeTab === "sales" && (
        <Suspense
          fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}
        >
          <AdminSalesTab
            payments={payments}
            paymentsEmail={paymentsEmail}
            setPaymentsEmail={setPaymentsEmail}
            loadPayments={loadPayments}
            paymentsLoading={paymentsLoading}
            paymentsError={paymentsError}
            paymentsErrorCode={paymentsErrorCode}
            paymentsStripeConfigured={paymentsStripeConfigured}
            paymentsEmptyReason={paymentsEmptyReason}
            downloadReceipt={downloadReceipt}
            downloading={downloading}
          />
        </Suspense>
      )}

      {/* ── Style tab ── */}
      {activeTab === "style" && (
        <Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}>
          <AdminStyleTab
            siteStyleTokens={siteStyleTokens}
            setSiteStyleTokens={setSiteStyleTokens}
            siteStyleHistory={siteStyleHistory}
            setSiteStyleHistory={setSiteStyleHistory}
            userTypographyPresets={userTypographyPresets}
            setUserTypographyPresets={setUserTypographyPresets}
            userCtaPresets={userCtaPresets}
            setUserCtaPresets={setUserCtaPresets}
            fontRoles={fontRoles}
            setFontRoles={setFontRoles}
            typographyPalette={typographyPalette}
            setTypographyPalette={setTypographyPalette}
            linkStyle={linkStyle}
            setLinkStyle={setLinkStyle}
            fontBrowserRole={fontBrowserRole}
            setFontBrowserRole={setFontBrowserRole}
            downloadedFamilies={downloadedFamilies}
            downloadingRole={downloadingRole}
            setDownloadingRole={setDownloadingRole}
            ctaSaveName={ctaSaveName}
            setCtaSaveName={setCtaSaveName}
            ctaSaveExpanded={ctaSaveExpanded}
            setCtaSaveExpanded={setCtaSaveExpanded}
            typographySaveName={typographySaveName}
            setTypographySaveName={setTypographySaveName}
            typographySaveExpanded={typographySaveExpanded}
            setTypographySaveExpanded={setTypographySaveExpanded}
            shopSettingsSaving={shopSettingsSaving}
            saveSiteStyleSettings={saveSiteStyleSettings}
            updateSiteStyleColor={updateSiteStyleColor}
            resetSiteStyleDefaults={resetSiteStyleDefaults}
            restoreSiteStyleRevision={restoreSiteStyleRevision}
            adminFetch={adminFetch}
            applyFontRolesToDom={applyFontRolesToDom}
            applySiteStyleTokensToDom={applySiteStyleTokensToDom}
          />
        </Suspense>
      )}

      {/* ── Info hub tab ── */}
      {activeTab === "info" && (
        <Suspense
          fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}
        >
          <AdminInfoHubTab
            buildTimestamp={buildTimestamp}
            gitRevision={gitRevision}
            storage={storage}
            uploadInfo={uploadInfo}
            uploadBackend={uploadBackend}
            setUploadBackend={setUploadBackend}
            uploadInfoDetails={uploadInfoDetails}
            resendConfigured={resendConfigured}
            wcProducts={wcProducts}
            wpCourses={wpCourses}
            wpEvents={wpEvents}
            products={products}
            users={users}
            analytics={analytics}
            analyticsMode={analyticsMode}
            analyticsConfigured={analyticsConfigured}
            healthChecks={healthChecks}
            healthLoading={healthLoading}
            webhookUrl={webhookUrl}
            ragbazDownloadUrl={ragbazDownloadUrl}
            runHealthCheck={runHealthCheck}
            purging={purging}
            deploying={deploying}
            lastDeployAt={lastDeployAt}
            commits={commits}
            commitsError={commitsError}
            commitsExpanded={commitsExpanded}
            setCommitsExpanded={setCommitsExpanded}
            purgeCache={purgeCache}
            triggerDeploy={triggerDeploy}
            clientLogs={clientLogs}
            setClientLogs={setClientLogs}
            debugLogs={debugLogs}
            chatBetaEnabled={chatBetaEnabled}
            setChatBetaEnabled={setChatBetaEnabled}
          />
        </Suspense>
      )}

      {/* ── Chat tab ── */}
      {activeTab === "chat" && (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6 items-start">
          <ChatPanel
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendChat={sendChat}
            rebuildIndex={rebuildIndex}
            clearChat={clearChat}
            chatLoading={chatLoading}
            uploadBackend={uploadBackend}
          />
          <div className="min-w-0 border rounded p-4 space-y-4 text-sm text-gray-300 bg-[#0e0018]">
            <h3 className="font-semibold text-white">Example commands</h3>
            {[
              {
                group: "Sales & revenue",
                examples: [
                  "sales today",
                  "sales this week",
                  "sales this month",
                  "försäljning denna månad",
                  "ventas hoy",
                  "sales for user@example.com",
                  "revenue total",
                  "total intäkt",
                ],
              },
              {
                group: "Payments & receipts",
                examples: [
                  "payments for user@example.com",
                  "best sellers",
                  "bästsäljare",
                  "más vendidos",
                ],
              },
              {
                group: "Refunds",
                examples: [
                  "refund pi_3abc123",
                  "återbetala pi_3abc123",
                  "reembolsar pi_3abc123",
                ],
              },
              {
                group: "Access control",
                examples: [
                  "who bought /course-name",
                  "vem köpte /kursnamn",
                  "quién compró /curso",
                  "grant access user@example.com /course-name",
                  "ge åtkomst user@example.com /kursnamn",
                  "conceder acceso user@example.com /curso",
                  "revoke access user@example.com /course-name",
                  "ta bort åtkomst user@example.com /kursnamn",
                  "revocar acceso user@example.com /curso",
                ],
              },
              {
                group: "Content",
                examples: [
                  "list all pages",
                  "visa alla sidor",
                  "list all posts",
                  "visa alla inlägg",
                  "list all events",
                  "visa alla evenemang",
                  "list all courses",
                  "visa alla kurser",
                  "list all products",
                  "visa alla produkter",
                ],
              },
              {
                group: "Index",
                examples: ["rebuild index", "bygg om index", "reindexar"],
              },
            ].map(({ group, examples }) => (
              <div key={group}>
                <p className="text-purple-300 font-medium mb-1">{group}</p>
                <ul className="space-y-1">
                  {examples.map((ex) => (
                    <li key={ex}>
                      <button
                        type="button"
                        className="text-left text-gray-400 hover:text-white font-mono text-xs"
                        onClick={() => {
                          setChatInput(ex);
                        }}
                      >
                        {ex}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploadProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>
              Uploading part {uploadProgress.currentPart} /{" "}
              {uploadProgress.totalParts}
            </span>
            <span>{uploadProgress.percent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
