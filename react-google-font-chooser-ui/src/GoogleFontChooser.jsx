"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_FONT_CATALOG, FONT_CATEGORIES } from "./fontCatalog";
import "./googleFontChooser.css";

function slugifyFamily(family) {
  return String(family || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureGoogleFontLoaded(family) {
  if (!family || typeof document === "undefined") return;
  const id = `rgfc-font-${slugifyFamily(family)}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  const encoded = encodeURIComponent(family).replace(/%20/g, "+");
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
  document.head.appendChild(link);
}

function buildVariationSettings(axisValues, axes) {
  const pairs = axes
    .map((axis) => [axis.tag, axisValues[axis.tag]])
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([tag, value]) => `'${tag}' ${value}`);
  return pairs.join(", ");
}

function getSimilarFonts(selected, fonts) {
  if (!selected?.family) return [];
  const selectedLower = selected.family.toLowerCase();
  const parts = selectedLower.split(/\s+/).filter(Boolean);

  return fonts
    .filter((font) => font.family !== selected.family)
    .map((font) => {
      const lower = font.family.toLowerCase();
      let score = 0;
      if (font.category === selected.category) score += 2;
      if (lower.startsWith(parts[0] || "")) score += 1;
      for (const part of parts) {
        if (part.length > 2 && lower.includes(part)) score += 2;
      }
      return { font, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.font);
}

export default function GoogleFontChooser({
  fonts = DEFAULT_FONT_CATALOG,
  initialFamily = DEFAULT_FONT_CATALOG[0]?.family || "Inter",
  initialPreviewText = "The quick brown fox jumps over the lazy dog",
  initialFontSize = 52,
  onApply,
  className = "",
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedFamily, setSelectedFamily] = useState(initialFamily);
  const [previewText, setPreviewText] = useState(initialPreviewText);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [axisValues, setAxisValues] = useState({});
  const [copyState, setCopyState] = useState("idle");

  const filteredFonts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return fonts.filter((font) => {
      if (category !== "all" && font.category !== category) return false;
      if (!needle) return true;
      return font.family.toLowerCase().includes(needle);
    });
  }, [category, fonts, search]);

  const selectedFont = useMemo(
    () => fonts.find((font) => font.family === selectedFamily) || fonts[0] || null,
    [fonts, selectedFamily],
  );

  useEffect(() => {
    if (!selectedFont) return;
    ensureGoogleFontLoaded(selectedFont.family);
    setAxisValues((previous) => {
      const next = { ...previous };
      for (const axis of selectedFont.axes || []) {
        if (!Object.prototype.hasOwnProperty.call(next, axis.tag)) {
          next[axis.tag] = axis.default;
        }
      }
      return next;
    });
  }, [selectedFont]);

  const similarFonts = useMemo(
    () => getSimilarFonts(selectedFont, fonts),
    [selectedFont, fonts],
  );

  const variationSettings = useMemo(
    () => buildVariationSettings(axisValues, selectedFont?.axes || []),
    [axisValues, selectedFont],
  );

  const previewStyle = useMemo(
    () => ({
      fontFamily: selectedFont ? `'${selectedFont.family}', system-ui, sans-serif` : "system-ui, sans-serif",
      fontSize: `${fontSize}px`,
      fontVariationSettings: variationSettings || undefined,
    }),
    [fontSize, selectedFont, variationSettings],
  );

  const cssSnippet = useMemo(() => {
    const family = selectedFont?.family || "Inter";
    return [
      `font-family: '${family}', system-ui, sans-serif;`,
      `font-size: ${fontSize}px;`,
      variationSettings ? `font-variation-settings: ${variationSettings};` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [fontSize, selectedFont, variationSettings]);

  async function copyCss() {
    try {
      await navigator.clipboard.writeText(cssSnippet);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("failed");
      setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  function applySelection() {
    onApply?.({
      family: selectedFont?.family || "",
      category: selectedFont?.category || "",
      fontSize,
      axisValues,
      variationSettings,
      cssSnippet,
      previewText,
    });
  }

  return (
    <div className={`rgfc-shell ${className}`}>
      <div className="rgfc-card rgfc-left">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="rgfc-search"
          placeholder="Search Google fonts"
        />

        <div className="rgfc-cats">
          {FONT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`rgfc-cat ${cat === category ? "active" : ""}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="rgfc-font-list">
          {filteredFonts.map((font) => (
            <button
              key={font.family}
              type="button"
              className={`rgfc-font-row ${
                selectedFont?.family === font.family ? "active" : ""
              }`}
              onClick={() => setSelectedFamily(font.family)}
            >
              <span className="rgfc-font-meta">
                <span className="rgfc-font-family">{font.family}</span>
                <span className="rgfc-font-sub">
                  {font.category} · {(font.axes || []).length} axes
                </span>
              </span>
              <span style={{ fontFamily: `'${font.family}', system-ui, sans-serif` }}>
                Aa
              </span>
            </button>
          ))}
          {filteredFonts.length === 0 ? (
            <div className="rgfc-font-row">
              <span className="rgfc-font-sub">No fonts match this filter.</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rgfc-card rgfc-right">
        <div className="rgfc-preview-controls">
          <input
            type="text"
            value={previewText}
            onChange={(event) => setPreviewText(event.target.value)}
            className="rgfc-preview-text"
          />
          <label className="rgfc-font-size">
            <span style={{ fontSize: "0.75rem" }}>Size</span>
            <input
              type="range"
              min={16}
              max={120}
              value={fontSize}
              onChange={(event) =>
                setFontSize(Number.parseInt(event.target.value, 10) || 16)
              }
            />
            <strong style={{ fontSize: "0.78rem", minWidth: "44px" }}>
              {fontSize}px
            </strong>
          </label>
        </div>

        <div className="rgfc-preview" style={previewStyle}>
          {previewText}
        </div>

        <div className="rgfc-axes">
          {(selectedFont?.axes || []).map((axis) => (
            <div key={axis.tag} className="rgfc-axis">
              <div className="rgfc-axis-head">
                <span>{axis.tag}</span>
                <span>{axisValues[axis.tag] ?? axis.default}</span>
              </div>
              <input
                type="range"
                min={axis.min}
                max={axis.max}
                step={axis.step || 1}
                value={axisValues[axis.tag] ?? axis.default}
                onChange={(event) =>
                  setAxisValues((previous) => ({
                    ...previous,
                    [axis.tag]:
                      Number.parseFloat(event.target.value) || axis.default,
                  }))
                }
              />
            </div>
          ))}
        </div>

        {similarFonts.length > 0 ? (
          <div className="rgfc-similar">
            {similarFonts.map((font) => (
              <button
                key={font.family}
                type="button"
                className="rgfc-chip"
                onClick={() => setSelectedFamily(font.family)}
              >
                {font.family}
              </button>
            ))}
          </div>
        ) : null}

        <pre className="rgfc-css">{cssSnippet}</pre>

        <div className="rgfc-actions">
          <button type="button" className="rgfc-button" onClick={copyCss}>
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy CSS"}
          </button>
          <button type="button" className="rgfc-button primary" onClick={applySelection}>
            Apply selection
          </button>
        </div>
      </div>
    </div>
  );
}
