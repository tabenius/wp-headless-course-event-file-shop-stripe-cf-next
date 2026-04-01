"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { TYPOGRAPHY_THEMES } from "@/lib/typographyThemes";
import AdminFontBrowserModal from "./AdminFontBrowserModal";
import AdminDocsContextLinks from "./AdminDocsContextLinks";
import AdminFieldHelpLink from "./AdminFieldHelpLink";

// ── CTA button style constants (mirrored from AdminDashboard.js) ──────────────

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

// ── Site style color fields ───────────────────────────────────────────────────

const SITE_STYLE_COLOR_FIELDS = [
  {
    key: "background",
    labelKey: "admin.styleColorBackground",
    token: "--color-background",
    semanticKey: "admin.styleColorSemanticBackground",
  },
  {
    key: "foreground",
    labelKey: "admin.styleColorForeground",
    token: "--color-foreground",
    semanticKey: "admin.styleColorSemanticForeground",
  },
  {
    key: "primary",
    labelKey: "admin.styleColorPrimary",
    token: "--color-primary",
    semanticKey: "admin.styleColorSemanticPrimary",
  },
  {
    key: "secondary",
    labelKey: "admin.styleColorSecondary",
    token: "--color-secondary",
    semanticKey: "admin.styleColorSemanticSecondary",
  },
  {
    key: "tertiary",
    labelKey: "admin.styleColorTertiary",
    token: "--color-tertiary",
    semanticKey: "admin.styleColorSemanticTertiary",
  },
  {
    key: "muted",
    labelKey: "admin.styleColorMuted",
    token: "--color-muted",
    semanticKey: "admin.styleColorSemanticMuted",
  },
  {
    key: "focusRing",
    labelKey: "admin.styleColorFocusRing",
    token: "--focus-ring-color",
    semanticKey: "admin.styleColorSemanticFocusRing",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminStyleTab({
  siteStyleTokens,
  setSiteStyleTokens,
  siteStyleHistory,
  setSiteStyleHistory,
  userTypographyPresets,
  setUserTypographyPresets,
  userCtaPresets,
  setUserCtaPresets,
  fontRoles,
  setFontRoles,
  typographyPalette,
  setTypographyPalette,
  linkStyle,
  setLinkStyle,
  fontBrowserRole,
  setFontBrowserRole,
  downloadedFamilies,
  downloadingRole,
  setDownloadingRole,
  ctaSaveName,
  setCtaSaveName,
  ctaSaveExpanded,
  setCtaSaveExpanded,
  typographySaveName,
  setTypographySaveName,
  typographySaveExpanded,
  setTypographySaveExpanded,
  shopSettingsSaving,
  saveSiteStyleSettings,
  updateSiteStyleColor,
  resetSiteStyleDefaults,
  restoreSiteStyleRevision,
  adminFetch,
  applyFontRolesToDom,
  applySiteStyleTokensToDom,
}) {
  const [cssExpandedRole, setCssExpandedRole] = useState(null);
  const [previewMode, setPreviewMode] = useState("both");
  const typographyColor1 = typographyPalette[0] || siteStyleTokens.foreground || "#111827";
  const typographyColor2 = typographyPalette[1] || typographyColor1;

  const previewLinkUnderline =
    linkStyle?.underlineDefault === "always" ? "underline" : "none";
  const previewSurfaces = [
    {
      id: "light",
      label: t("admin.stylePreviewModeLight", "Light"),
      tokens: {
        background: siteStyleTokens.background || "#ffffff",
        foreground: siteStyleTokens.foreground || "#111827",
        primary: siteStyleTokens.primary || "#0f766e",
        secondary: siteStyleTokens.secondary || "#d1d5db",
        tertiary: siteStyleTokens.tertiary || "#4f46e5",
        muted: siteStyleTokens.muted || "#9ca3af",
        focusRing: siteStyleTokens.focusRing || siteStyleTokens.primary || "#0f766e",
      },
    },
    {
      id: "dark",
      label: t("admin.stylePreviewModeDark", "Dark"),
      tokens: {
        background: "#1a1a1a",
        foreground: "#ffffff",
        primary: siteStyleTokens.primary || "#22c55e",
        secondary: siteStyleTokens.secondary || "#475569",
        tertiary: siteStyleTokens.tertiary || "#818cf8",
        muted: "#52525b",
        focusRing: siteStyleTokens.focusRing || siteStyleTokens.primary || "#22c55e",
      },
    },
  ];
  const visiblePreviewSurfaces =
    previewMode === "both"
      ? previewSurfaces
      : previewSurfaces.filter((surface) => surface.id === previewMode);

  return (
    <>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border rounded p-5 space-y-8">
          {/* ── Main site style ── */}
          <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1">
                <h2 className="text-2xl font-semibold text-gray-900">
                  {t("admin.styleSiteTitle")}
                </h2>
                <AdminFieldHelpLink
                  slug="product-value"
                  topic={t("admin.styleSiteTitle")}
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {t("admin.styleSiteSummary")}
              </p>
            </div>
            <AdminDocsContextLinks tab="style" compact />
          </div>
          <p className="text-xs text-gray-500">
            {t(
              "admin.styleSiteEditHint",
              "Edit colors/fonts, preview instantly, then publish. Each publish creates a revision you can restore later.",
            )}
          </p>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {SITE_STYLE_COLOR_FIELDS.map(
              ({ key, labelKey, token, semanticKey }) => (
              <label
                key={token}
                className="flex items-center gap-3 border rounded p-3 bg-gray-50"
              >
                <input
                  type="color"
                  value={siteStyleTokens[key]}
                  onChange={(event) =>
                    updateSiteStyleColor(key, event.target.value)
                  }
                  className="h-10 w-10 rounded border border-gray-200 shrink-0 bg-transparent"
                  title={t(labelKey)}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800">
                    {t(labelKey)}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {siteStyleTokens[key]}
                  </div>
                  <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
                    {t(semanticKey)}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono">
                    {token}
                  </div>
                </div>
              </label>
              ),
            )}
          </div>
          {/* ── Typography ───────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-1">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {t("admin.styleTypographyTitle", "Typography")}
              </h3>
              <AdminFieldHelpLink
                slug="technical-manual"
                topic={t("admin.styleTypographyTitle", "Typography")}
              />
            </div>

            {/* Built-in themes strip */}
            <div>
              <div className="inline-flex items-center gap-1 text-xs text-gray-500 mb-2">
                <span>{t("admin.styleThemesLabel", "Themes")}</span>
                <AdminFieldHelpLink
                  slug="product-value"
                  topic={t("admin.styleThemesLabel", "Themes")}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {TYPOGRAPHY_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => {
                      const roles = {
                        fontDisplay: theme.fontDisplay,
                        fontHeading: theme.fontHeading,
                        fontSubheading: theme.fontSubheading,
                        fontBody: theme.fontBody,
                        fontButton: theme.fontButton,
                      };
                      setFontRoles(roles);
                      setTypographyPalette(theme.typographyPalette);
                      applyFontRolesToDom(roles, theme.typographyPalette, linkStyle);
                    }}
                    className="px-3 py-1.5 text-xs border rounded-full hover:bg-gray-100 hover:border-gray-400"
                    title={theme.description}
                  >
                    {theme.name}
                  </button>
                ))}

                {/* User typography presets */}
                {userTypographyPresets.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const s = preset.style;
                        const roles = {
                          fontDisplay: s.fontDisplay || fontRoles.fontDisplay,
                          fontHeading: s.fontHeading && typeof s.fontHeading === "object" ? s.fontHeading : fontRoles.fontHeading,
                          fontSubheading: s.fontSubheading || fontRoles.fontSubheading,
                          fontBody: s.fontBody && typeof s.fontBody === "object" ? s.fontBody : fontRoles.fontBody,
                          fontButton: s.fontButton || fontRoles.fontButton,
                        };
                        const pal = s.typographyPalette || typographyPalette;
                        const ls = s.linkStyle || linkStyle;
                        setFontRoles(roles);
                        setTypographyPalette(pal);
                        setLinkStyle(ls);
                        applyFontRolesToDom(roles, pal, ls);
                      }}
                      className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:border-gray-400"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={async () => {
                        await adminFetch("/api/admin/style-presets", {
                          method: "DELETE",
                          body: JSON.stringify({ id: preset.id, type: "typography" }),
                        });
                        setUserTypographyPresets((prev) => prev.filter((p) => p.id !== preset.id));
                      }}
                      className="text-gray-400 hover:text-red-500 text-xs leading-none"
                      title="Delete preset"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Save current typography preset */}
                {!typographySaveExpanded ? (
                  <button
                    onClick={() => setTypographySaveExpanded(true)}
                    className="px-3 py-1 text-xs rounded border border-dashed border-gray-300 text-gray-500 hover:border-gray-400"
                  >
                    Save current…
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={typographySaveName}
                      onChange={(e) => setTypographySaveName(e.target.value)}
                      placeholder="Preset name"
                      className="text-xs border border-gray-300 rounded px-2 py-1 w-44"
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        if (!typographySaveName.trim()) return;
                        const style = {
                          ...fontRoles,
                          typographyPalette,
                          linkStyle,
                        };
                        const { json: data } = await adminFetch("/api/admin/style-presets", {
                          method: "POST",
                          body: JSON.stringify({
                            type: "typography",
                            name: typographySaveName.trim(),
                            style,
                          }),
                        });
                        if (data?.ok && data.preset) {
                          setUserTypographyPresets((prev) => [data.preset, ...prev]);
                          setTypographySaveName("");
                          setTypographySaveExpanded(false);
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-slate-600 text-white hover:bg-slate-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setTypographySaveExpanded(false); setTypographySaveName(""); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Typography color palette */}
            <div>
              <div className="text-xs text-gray-500 mb-2">Typography Colors</div>
              <div className="flex items-center gap-3">
                {typographyPalette.map((color, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => {
                        const next = [...typographyPalette];
                        next[idx] = e.target.value;
                        setTypographyPalette(next);
                        applyFontRolesToDom(fontRoles, next, linkStyle);
                      }}
                      className="w-8 h-8 rounded cursor-pointer border"
                    />
                    <span className="text-xs font-mono text-gray-500">{color}</span>
                  </div>
                ))}
                {typographyPalette.length < 2 ? (
                  <button
                    onClick={() => setTypographyPalette([...typographyPalette, "#4682b4"])}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                  >
                    + Second color
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const next = [typographyPalette[0]];
                      const updated = { ...fontRoles };
                      for (const key of ["fontDisplay", "fontHeading", "fontSubheading"]) {
                        if (updated[key]?.colorSlot === 2) updated[key] = { ...updated[key], colorSlot: 1 };
                      }
                      setTypographyPalette(next);
                      setFontRoles(updated);
                      applyFontRolesToDom(updated, next, linkStyle);
                    }}
                    className="px-2 py-1 text-xs border rounded hover:bg-red-50 hover:border-red-300 text-red-600"
                  >
                    − Remove
                  </button>
                )}
              </div>
            </div>

            {/* Font role cards */}
            {[
              { key: "fontDisplay", label: "Display", elements: "h1", hasColor: true },
              { key: "fontHeading", label: "Heading", elements: "h2, h3, h4", hasColor: true },
              { key: "fontSubheading", label: "Subheading", elements: "h5, h6", hasColor: true },
              { key: "fontBody", label: "Body", elements: "body, p", hasColor: false },
              { key: "fontButton", label: "Button", elements: "button", hasColor: false },
            ].map(({ key, label, elements, hasColor }) => {
              const role = fontRoles[key];
              const fontLabel =
                role?.type === "google" ? `${role.family}${role.isVariable ? " Variable" : ""}` :
                role?.type === "inherit" ? "(inherits Heading)" :
                role?.type === "preset" ? "Preset" : "—";
              const weightLabel =
                role?.isVariable ? `${role.weightRange?.[0]}–${role.weightRange?.[1]}` :
                role?.weights ? role.weights.join(", ") : "";
              const slot = role?.colorSlot;

              const cssOpen = cssExpandedRole === key;
              const downloadedEntry = role?.type === "google"
                ? downloadedFamilies?.find(f => f.family === role.family)
                : null;
              const googleCdnUrl = downloadedEntry
                ? downloadedEntry.isVariable
                  ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(downloadedEntry.family).replace(/%20/g, "+")}:wght@${downloadedEntry.weightRange?.[0] ?? 100}..${downloadedEntry.weightRange?.[1] ?? 900}&display=swap`
                  : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(downloadedEntry.family).replace(/%20/g, "+")}:wght@${(downloadedEntry.weights ?? [400, 700]).join(";")}&display=swap`
                : null;

              return (
                <div key={key}>
                  <div className="border rounded-lg p-3 flex items-center gap-3">
                    {hasColor && typographyPalette.length > 0 ? (
                      <button
                        onClick={() => {
                          if (typographyPalette.length < 2) return;
                          const nextSlot = slot === 2 ? 1 : 2;
                          const updated = { ...fontRoles, [key]: { ...role, colorSlot: nextSlot } };
                          setFontRoles(updated);
                          applyFontRolesToDom(updated, typographyPalette, linkStyle);
                        }}
                        className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-gray-300 shrink-0 cursor-pointer"
                        style={{ backgroundColor: typographyPalette[(slot || 1) - 1] || "#111" }}
                        title={typographyPalette.length < 2 ? "Add second color to enable slot switching" : `Color slot ${slot || 1}`}
                      />
                    ) : (
                      <div className="w-5 h-5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{label}</div>
                      <div className="text-xs text-gray-500">{elements}</div>
                      <div className="text-xs text-gray-700 mt-0.5">
                        {fontLabel}
                        {weightLabel && <span className="ml-2 text-gray-400">{weightLabel}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {role?.type !== "preset" && role?.type !== "inherit" && (
                        <button
                          onClick={() => {
                            const defaults = {
                              fontDisplay: { type: "preset", stack: "system-ui, sans-serif", colorSlot: 1 },
                              fontHeading: { type: "preset", stack: "system-ui, sans-serif", colorSlot: 1 },
                              fontSubheading: { type: "inherit" },
                              fontBody: { type: "preset", stack: "Georgia, serif" },
                              fontButton: { type: "preset", stack: "system-ui, sans-serif" },
                            };
                            const updated = { ...fontRoles, [key]: defaults[key] };
                            setFontRoles(updated);
                            applyFontRolesToDom(updated, typographyPalette, linkStyle);
                          }}
                          className="text-gray-400 hover:text-gray-700 text-lg leading-none"
                          title="Reset to preset"
                        >×</button>
                      )}
                      {role?.type === "google" && downloadedEntry && (
                        <button
                          onClick={() => setCssExpandedRole(cssOpen ? null : key)}
                          className={`px-2 py-1.5 text-xs border rounded-lg hover:bg-gray-100 ${cssOpen ? "bg-gray-100 border-gray-400" : ""}`}
                          title="Show CSS"
                        >CSS</button>
                      )}
                      <button
                        onClick={() => setFontBrowserRole(key)}
                        disabled={downloadingRole === key}
                        className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-wait"
                      >
                        {downloadingRole === key ? "Downloading…" : "Browse"}
                      </button>
                    </div>
                  </div>
                  {cssOpen && downloadedEntry && (
                    <div className="mt-1 border rounded-lg p-3 bg-gray-50 space-y-3">
                      {downloadedEntry.fontFaceCss && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500 font-medium">@font-face CSS</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(downloadedEntry.fontFaceCss)}
                              className="px-2 py-0.5 text-xs border rounded hover:bg-gray-200"
                            >Copy</button>
                          </div>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white border rounded p-2 text-gray-700">{downloadedEntry.fontFaceCss}</pre>
                        </div>
                      )}
                      {googleCdnUrl && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500 font-medium">Google Fonts CDN URL</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(googleCdnUrl)}
                              className="px-2 py-0.5 text-xs border rounded hover:bg-gray-200"
                            >Copy</button>
                          </div>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white border rounded p-2 text-gray-700">{googleCdnUrl}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Link style */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="text-sm font-medium text-gray-800">Link Style</div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-600">Underline:</span>
                {["always", "hover", "never"].map((v) => (
                  <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="underlineDefault"
                      value={v}
                      checked={linkStyle.underlineDefault === v}
                      onChange={() => {
                        const next = { ...linkStyle, underlineDefault: v };
                        setLinkStyle(next);
                        applyFontRolesToDom(fontRoles, typographyPalette, next);
                      }}
                    />
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["none", "underline", "highlight", "inverse", "pill", "slide", "box"].map((variant) => (
                  <button
                    key={variant}
                    onClick={() => {
                      const next = { ...linkStyle, hoverVariant: variant };
                      setLinkStyle(next);
                      applyFontRolesToDom(fontRoles, typographyPalette, next);
                    }}
                    className={`px-3 py-1.5 text-xs border rounded-full ${linkStyle.hoverVariant === variant ? "bg-slate-100 border-slate-400 text-slate-700" : "hover:bg-gray-100"}`}
                  >
                    {variant}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveSiteStyleSettings}
              disabled={shopSettingsSaving}
              className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {shopSettingsSaving
                ? t("admin.saving", "Saving…")
                : t("common.save")}
            </button>
            <button
              type="button"
              onClick={resetSiteStyleDefaults}
              className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
            >
              {t("admin.styleSiteResetDefaults", "Reset to defaults")}
            </button>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              className="px-4 py-2 rounded text-white text-sm font-medium"
              style={{ background: siteStyleTokens.primary }}
            >
              {t("admin.stylePrimaryButton")}
            </button>
            <button
              className="px-4 py-2 rounded text-white text-sm font-medium"
              style={{ background: siteStyleTokens.tertiary }}
            >
              {t("admin.styleTertiaryButton")}
            </button>
            <button
              className="px-4 py-2 rounded text-sm font-medium border"
              style={{
                color: siteStyleTokens.primary,
                borderColor: siteStyleTokens.primary,
              }}
            >
              {t("admin.styleOutlineButton")}
            </button>
            <span
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={{
                background: siteStyleTokens.secondary,
                color: siteStyleTokens.foreground,
              }}
            >
              {t("admin.styleBadge")}
            </span>
          </div>
          <div className="rounded border bg-gray-50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1">
                <h3 className="text-sm font-semibold text-gray-800">
                  {t("admin.styleRevisionHistory", "Style revision history")}
                </h3>
                <AdminFieldHelpLink
                  slug="technical-manual"
                  topic={t("admin.styleRevisionHistory", "Style revision history")}
                />
              </div>
              <span className="text-xs text-gray-500">
                {t("admin.styleRevisionCount", {
                  count: siteStyleHistory.length,
                })}
              </span>
            </div>
            {siteStyleHistory.length === 0 ? (
              <p className="text-xs text-gray-500">
                {t(
                  "admin.styleRevisionEmpty",
                  "No style revisions saved yet. Publish your first style to create history.",
                )}
              </p>
            ) : (
              <div className="overflow-auto border rounded bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-2 py-1.5">
                        {t("admin.updatedAt", "Updated")}
                      </th>
                      <th className="text-left px-2 py-1.5">
                        {t("admin.styleColors", "Colors")}
                      </th>
                      <th className="text-left px-2 py-1.5">
                        {t("admin.action", "Action")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteStyleHistory.slice(0, 20).map((revision) => (
                      <tr key={revision.id || revision.savedAt} className="border-t">
                        <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                          {revision.savedAt
                            ? new Date(revision.savedAt).toLocaleString("sv-SE")
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            {[
                              revision.style?.background,
                              revision.style?.primary,
                              revision.style?.secondary,
                              revision.style?.tertiary,
                            ].map((value, index) => (
                              <span
                                key={`${revision.id || revision.savedAt}-swatch-${index}`}
                                className="inline-block h-4 w-4 rounded border border-gray-300"
                                style={{ background: value || "#000000" }}
                                title={value || ""}
                              />
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => restoreSiteStyleRevision(revision)}
                            disabled={shopSettingsSaving}
                            className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
                          >
                            {t("admin.styleRevisionRestore", "Restore")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* ── Button Style ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1">
            <div className="text-sm font-semibold text-gray-800">
              {t("admin.styleButtonStyle", "Button style")}
            </div>
            <AdminFieldHelpLink
              slug="technical-manual"
              topic={t("admin.styleButtonStyle", "Button style")}
            />
          </div>

          {/* Preset strip */}
          <div className="flex flex-wrap gap-2 items-center">
            {CTA_BUILTIN_PRESETS.map((preset) => {
              const isActive = preset.id === "upstream"
                ? siteStyleTokens.ctaStyle?.type === "upstream"
                : JSON.stringify(normalizeCtaStyleClient(siteStyleTokens.ctaStyle)) === JSON.stringify(normalizeCtaStyleClient(preset.style));
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    const next = { ...siteStyleTokens, ctaStyle: preset.style };
                    setSiteStyleTokens(next);
                    applySiteStyleTokensToDom(next);
                  }}
                  className={`px-3 py-1 text-xs rounded border ${isActive ? "bg-slate-100 border-slate-400 text-slate-700 font-semibold" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}
                >
                  {preset.name}{preset.id === "upstream" && isActive ? " ●" : ""}
                </button>
              );
            })}

            {userCtaPresets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const next = { ...siteStyleTokens, ctaStyle: preset.style };
                    setSiteStyleTokens(next);
                    applySiteStyleTokensToDom(next);
                  }}
                  className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:border-gray-400"
                >
                  {preset.name}
                </button>
                <button
                  onClick={async () => {
                    await adminFetch("/api/admin/style-presets", {
                      method: "DELETE",
                      body: JSON.stringify({ id: preset.id, type: "cta" }),
                    });
                    setUserCtaPresets((prev) => prev.filter((p) => p.id !== preset.id));
                  }}
                  className="text-gray-400 hover:text-red-500 text-xs leading-none"
                  title="Delete preset"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Save current… */}
            {!ctaSaveExpanded ? (
              <button
                onClick={() => setCtaSaveExpanded(true)}
                className="px-3 py-1 text-xs rounded border border-dashed border-gray-300 text-gray-500 hover:border-gray-400"
              >
                Save current…
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ctaSaveName}
                  onChange={(e) => setCtaSaveName(e.target.value)}
                  placeholder="Preset name"
                  className="text-xs border border-gray-300 rounded px-2 py-1 w-36"
                  autoFocus
                />
                <button
                  onClick={async () => {
                    if (!ctaSaveName.trim()) return;
                    if (siteStyleTokens.ctaStyle?.type === "upstream") return; // can't save upstream as preset
                    const { json: data } = await adminFetch("/api/admin/style-presets", {
                      method: "POST",
                      body: JSON.stringify({
                        type: "cta",
                        name: ctaSaveName.trim(),
                        style: siteStyleTokens.ctaStyle,
                      }),
                    });
                    if (data?.ok && data.preset) {
                      setUserCtaPresets((prev) => [data.preset, ...prev]);
                      setCtaSaveName("");
                      setCtaSaveExpanded(false);
                    }
                  }}
                  className="text-xs px-2 py-1 rounded bg-slate-600 text-white hover:bg-slate-700"
                >
                  Save
                </button>
                <button
                  onClick={() => { setCtaSaveExpanded(false); setCtaSaveName(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Live preview */}
          {siteStyleTokens.ctaStyle?.type === "upstream" ? (
            <div className="text-xs text-gray-400 italic">Using WordPress default button styles</div>
          ) : (
            <div>
              <button
                style={ctaPreviewStyle(siteStyleTokens.ctaStyle, siteStyleTokens)}
              >
                Shop Now →
              </button>
            </div>
          )}

          {/* Controls — disabled when upstream */}
          {siteStyleTokens.ctaStyle?.type !== "upstream" && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Background", field: "bgColor", options: CTA_BG_COLORS },
                { label: "Text Color", field: "textColor", options: CTA_TEXT_COLORS },
                { label: "Border", field: "border", options: CTA_BORDERS },
                { label: "Shadow", field: "shadow", options: CTA_SHADOWS },
                { label: "Radius", field: "borderRadius", options: CTA_BORDER_RADII },
                { label: "Font Weight", field: "fontWeight", options: CTA_FONT_WEIGHTS },
                { label: "Text Case", field: "textTransform", options: CTA_TEXT_TRANSFORMS },
                { label: "Padding", field: "paddingSize", options: CTA_PADDING_SIZES },
              ].map(({ label, field, options }) => (
                <div key={field} className="flex items-center justify-between gap-2">
                  <label className="text-xs text-gray-600 w-24 shrink-0">{label}</label>
                  <select
                    value={siteStyleTokens.ctaStyle?.[field] || ""}
                    onChange={(e) => {
                      const next = {
                        ...siteStyleTokens,
                        ctaStyle: normalizeCtaStyleClient({ ...siteStyleTokens.ctaStyle, [field]: e.target.value }),
                      };
                      setSiteStyleTokens(next);
                      applySiteStyleTokensToDom(next);
                    }}
                    className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                  >
                    {options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              ))}

              {/* Border color — only when border === solid */}
              {siteStyleTokens.ctaStyle?.border === "solid" && (
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-gray-600 w-24 shrink-0">Border Color</label>
                  <select
                    value={siteStyleTokens.ctaStyle?.borderColor || "primary"}
                    onChange={(e) => {
                      const next = {
                        ...siteStyleTokens,
                        ctaStyle: normalizeCtaStyleClient({ ...siteStyleTokens.ctaStyle, borderColor: e.target.value }),
                      };
                      setSiteStyleTokens(next);
                      applySiteStyleTokensToDom(next);
                    }}
                    className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                  >
                    {CTA_BORDER_COLORS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* bgColor custom hex input */}
              {siteStyleTokens.ctaStyle?.bgColor === "custom" && (
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-gray-600 w-24 shrink-0">BG Hex</label>
                  <input
                    type="color"
                    value={siteStyleTokens.ctaStyle?.bgCustom || "#000000"}
                    onChange={(e) => {
                      const next = { ...siteStyleTokens, ctaStyle: { ...siteStyleTokens.ctaStyle, bgCustom: e.target.value } };
                      setSiteStyleTokens(next);
                      applySiteStyleTokensToDom(next);
                    }}
                    className="h-7 w-16 border border-gray-300 rounded cursor-pointer"
                  />
                </div>
              )}

              {/* textColor custom hex input */}
              {siteStyleTokens.ctaStyle?.textColor === "custom" && (
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-gray-600 w-24 shrink-0">Text Hex</label>
                  <input
                    type="color"
                    value={siteStyleTokens.ctaStyle?.textCustom || "#ffffff"}
                    onChange={(e) => {
                      const next = { ...siteStyleTokens, ctaStyle: { ...siteStyleTokens.ctaStyle, textCustom: e.target.value } };
                      setSiteStyleTokens(next);
                      applySiteStyleTokensToDom(next);
                    }}
                    className="h-7 w-16 border border-gray-300 rounded cursor-pointer"
                  />
                </div>
              )}

              {/* borderColor custom hex input */}
              {siteStyleTokens.ctaStyle?.border === "solid" && siteStyleTokens.ctaStyle?.borderColor === "custom" && (
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-gray-600 w-24 shrink-0">Border Hex</label>
                  <input
                    type="color"
                    value={siteStyleTokens.ctaStyle?.borderCustom || "#000000"}
                    onChange={(e) => {
                      const next = { ...siteStyleTokens, ctaStyle: { ...siteStyleTokens.ctaStyle, borderCustom: e.target.value } };
                      setSiteStyleTokens(next);
                      applySiteStyleTokensToDom(next);
                    }}
                    className="h-7 w-16 border border-gray-300 rounded cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        </div>

        <aside className="xl:sticky xl:top-20 space-y-4 border rounded p-4">
          <div className="inline-flex items-center gap-1">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              {t("admin.styleActivePreviewTitle", "Active typography preview")}
            </h3>
            <AdminFieldHelpLink
              slug="product-value"
              topic={t("admin.styleActivePreviewTitle", "Active typography preview")}
            />
          </div>
          <p className="text-sm text-gray-500">
            {t(
              "admin.styleActivePreviewSummary",
              "See how your current display, heading, body, button, and link roles render together.",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "light", label: t("admin.stylePreviewModeLight", "Light") },
              { id: "dark", label: t("admin.stylePreviewModeDark", "Dark") },
              { id: "both", label: t("admin.stylePreviewModeBoth", "Both") },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPreviewMode(option.id)}
                className={`rounded border px-2 py-1 text-xs ${
                  previewMode === option.id
                    ? "border-slate-500 bg-slate-600 text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {visiblePreviewSurfaces.map((surface) => {
              const previewTokens = surface.tokens;
              const previewCtaStyle =
                siteStyleTokens.ctaStyle?.type === "upstream"
                  ? {
                      backgroundColor: previewTokens.primary,
                      color: previewTokens.background,
                      borderRadius: "8px",
                      border: "0",
                      fontWeight: 600,
                      padding: "0.625rem 1.25rem",
                      fontSize: "0.875rem",
                    }
                  : ctaPreviewStyle(siteStyleTokens.ctaStyle, previewTokens);

              return (
                <section
                  key={surface.id}
                  className="space-y-3 rounded border p-3"
                  style={{
                    background: previewTokens.background,
                    color: previewTokens.foreground,
                    borderColor: previewTokens.muted,
                  }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {surface.label}
                  </div>

                  <h1
                    className="leading-tight"
                    style={{
                      margin: 0,
                      fontFamily:
                        "var(--font-display, var(--font-heading, system-ui, sans-serif))",
                      color: previewTokens.foreground,
                      fontSize: "clamp(1.35rem, 2.4vw, 1.9rem)",
                    }}
                  >
                    {t("admin.styleActivePreviewDisplaySample", "Design with clarity and speed.")}
                  </h1>

                  <h2
                    className="text-base leading-snug"
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-heading, system-ui, sans-serif)",
                      color: previewTokens.foreground,
                    }}
                  >
                    {t(
                      "admin.styleActivePreviewHeadingSample",
                      "Readable hierarchy for real content.",
                    )}
                  </h2>

                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-body, system-ui, sans-serif)",
                    }}
                  >
                    {t("admin.fontBrowserPreviewText")}
                  </p>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide opacity-70">
                      {t("admin.styleButtonsPreview", "Buttons and outlines")}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        style={{
                          ...previewCtaStyle,
                          fontFamily:
                            "var(--font-button, var(--font-body, system-ui, sans-serif))",
                        }}
                      >
                        {t("admin.stylePrimaryButton")}
                      </button>
                      <button
                        type="button"
                        className="rounded px-4 py-2 text-sm"
                        style={{
                          fontFamily:
                            "var(--font-button, var(--font-body, system-ui, sans-serif))",
                          background: previewTokens.secondary,
                          color: previewTokens.foreground,
                          border: `1px solid ${previewTokens.muted}`,
                        }}
                      >
                        {t("admin.stylePreviewSecondaryButton", "Secondary button")}
                      </button>
                      <button
                        type="button"
                        className="rounded px-4 py-2 text-sm"
                        style={{
                          fontFamily:
                            "var(--font-button, var(--font-body, system-ui, sans-serif))",
                          color: previewTokens.primary,
                          border: `1px solid ${previewTokens.primary}`,
                          background: "transparent",
                        }}
                      >
                        {t("admin.styleOutlineButton")}
                      </button>
                      <button
                        type="button"
                        className="rounded px-3 py-1.5 text-xs"
                        style={{
                          fontFamily:
                            "var(--font-button, var(--font-body, system-ui, sans-serif))",
                          color: previewTokens.foreground,
                          border: `1px solid ${previewTokens.muted}`,
                          background: previewTokens.background,
                          outline: `2px solid ${previewTokens.focusRing}`,
                          outlineOffset: "1px",
                        }}
                      >
                        {t("admin.stylePreviewFocusRing", "Focus outline")}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide opacity-70">
                      {t("admin.stylePreviewMenuTitle", "Menu and submenu")}
                    </div>
                    <div
                      className="rounded border p-2"
                      style={{
                        borderColor: previewTokens.muted,
                        background:
                          "color-mix(in srgb, var(--color-background) 92%, transparent)",
                      }}
                    >
                      <div
                        className="flex flex-wrap items-center gap-3 text-[13px]"
                        style={{
                          fontFamily:
                            "var(--font-submenu, var(--font-heading, system-ui, sans-serif))",
                          color: previewTokens.foreground,
                        }}
                      >
                        <span>{t("admin.stylePreviewMenuItem", "Home")}</span>
                        <span>{t("admin.stylePreviewMenuItemCourses", "Courses")}</span>
                        <span style={{ color: previewTokens.primary }}>
                          {t("admin.stylePreviewMenuItemShop", "Shop")}
                        </span>
                      </div>
                      <div
                        className="mt-2 min-w-[160px] max-w-[220px] rounded border"
                        style={{
                          borderColor: previewTokens.muted,
                          background: previewTokens.background,
                        }}
                      >
                        <div
                          className="border-b px-3 py-1.5 text-[13px]"
                          style={{
                            borderColor: previewTokens.muted,
                            fontFamily:
                              "var(--font-submenu, var(--font-heading, system-ui, sans-serif))",
                            color: previewTokens.foreground,
                          }}
                        >
                          {t("admin.stylePreviewSubmenuItem1", "Start here")}
                        </div>
                        <div
                          className="px-3 py-1.5 text-[12px]"
                          style={{
                            fontFamily:
                              "var(--font-submenu, var(--font-heading, system-ui, sans-serif))",
                            color: previewTokens.foreground,
                          }}
                        >
                          {t("admin.stylePreviewSubmenuItem2", "Popular now")}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide opacity-70">
                      {t("admin.stylePreviewLinkTitle", "Link behavior")}
                    </div>
                    <a
                      href="#"
                      onClick={(event) => event.preventDefault()}
                      className="text-sm"
                      style={{
                        fontFamily: "var(--font-body, system-ui, sans-serif)",
                        color: previewTokens.primary,
                        textDecoration: previewLinkUnderline,
                      }}
                    >
                      {t("admin.styleActivePreviewLinkSample", "Read the full guide")}
                    </a>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide opacity-70">
                      {t("admin.styleFormPreview", "Form field")}
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={t("admin.styleFormPreviewValue", "Sample input text")}
                      className="w-full rounded border px-2 py-1 text-xs"
                      style={{
                        borderColor: previewTokens.muted,
                        background: previewTokens.background,
                        color: previewTokens.foreground,
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide opacity-70">
                      {t("admin.styleStatusPreview", "Status pills")}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="rounded px-2 py-0.5 bg-emerald-100 text-emerald-800">
                        {t("admin.ok", "OK")}
                      </span>
                      <span className="rounded px-2 py-0.5 bg-amber-100 text-amber-800">
                        {t("admin.warning", "Warning")}
                      </span>
                      <span className="rounded px-2 py-0.5 bg-red-100 text-red-800">
                        {t("admin.error", "Error")}
                      </span>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Font browser modal */}
      {fontBrowserRole && (
        <AdminFontBrowserModal
          role={fontBrowserRole}
          currentFamily={fontRoles[fontBrowserRole]?.family}
          downloadedFamilies={downloadedFamilies}
          usedFonts={Object.entries(fontRoles)
            .filter(([k, r]) => k !== fontBrowserRole && r?.type === "google" && r?.family)
            .map(([k, r]) => ({ family: r.family, role: k.replace("font", "") }))}
          onSelect={(roleObj) => {
            const updated = { ...fontRoles, [fontBrowserRole]: roleObj };
            setFontRoles(updated);
            applyFontRolesToDom(updated, typographyPalette, linkStyle);
            setFontBrowserRole(null);
          }}
          onClose={() => setFontBrowserRole(null)}
          onDownloadStart={() => setDownloadingRole(fontBrowserRole)}
          onDownloadEnd={() => setDownloadingRole(null)}
        />
      )}
    </>
  );
}
