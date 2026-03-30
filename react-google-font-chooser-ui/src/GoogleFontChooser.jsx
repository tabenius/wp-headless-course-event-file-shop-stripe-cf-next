"use client";

import { useEffect, useMemo, useState } from "react";
import AxisKnob from "./AxisKnob";
import { DEFAULT_FONT_CATALOG, FONT_CATEGORIES } from "./fontCatalog";
import "./googleFontChooser.css";
import {
  buildCssSnippet,
  buildVariationSettings,
  collectInitialAxisValues,
  getSimilarFonts,
  normalizeAxisValue,
  normalizeAxisState,
} from "./utils";

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

function asArray(input) {
  return Array.isArray(input) ? input : [];
}

function pushUnique(list, value, limit = 12) {
  const next = [value, ...asArray(list).filter((row) => row !== value)];
  return next.slice(0, limit);
}

export default function GoogleFontChooser({
  fonts = DEFAULT_FONT_CATALOG,
  initialFamily = DEFAULT_FONT_CATALOG[0]?.family || "Inter",
  initialPreviewText = "The quick brown fox jumps over the lazy dog",
  initialFontSize = 52,
  value,
  onChange,
  onApply,
  className = "",
  advancedDefault = false,
  allowAdvancedToggle = true,
  confirmBeforeSwitch = false,
  storageKey = "rgfc-state",
  similarLimit = 5,
}) {
  const safeFonts = asArray(fonts).length > 0 ? asArray(fonts) : DEFAULT_FONT_CATALOG;
  const fallbackFont = safeFonts[0] || null;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedFamily, setSelectedFamily] = useState(
    value?.family || initialFamily || fallbackFont?.family || "Inter",
  );
  const [previewText, setPreviewText] = useState(
    value?.previewText || initialPreviewText,
  );
  const [fontSize, setFontSize] = useState(
    typeof value?.fontSize === "number" ? value.fontSize : initialFontSize,
  );
  const [axisValues, setAxisValues] = useState({});
  const [controlMode, setControlMode] = useState(
    advancedDefault ? "knob" : "slider",
  );
  const [favorites, setFavorites] = useState([]);
  const [recent, setRecent] = useState([]);
  const [copyState, setCopyState] = useState("idle");

  const filteredFonts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return safeFonts.filter((font) => {
      if (category !== "all" && font.category !== category) return false;
      if (!needle) return true;
      return font.family.toLowerCase().includes(needle);
    });
  }, [category, safeFonts, search]);

  const selectedFont = useMemo(
    () =>
      safeFonts.find((font) => font.family === selectedFamily) ||
      fallbackFont ||
      null,
    [fallbackFont, safeFonts, selectedFamily],
  );

  useEffect(() => {
    if (!selectedFont) return;
    ensureGoogleFontLoaded(selectedFont.family);
    setAxisValues((previous) =>
      collectInitialAxisValues(selectedFont.axes || [], previous),
    );
  }, [selectedFont]);

  useEffect(() => {
    if (!value || typeof value !== "object") return;
    if (typeof value.family === "string" && value.family.trim()) {
      setSelectedFamily(value.family);
    }
    if (typeof value.previewText === "string") {
      setPreviewText(value.previewText);
    }
    if (typeof value.fontSize === "number" && Number.isFinite(value.fontSize)) {
      setFontSize(Math.max(16, Math.min(120, value.fontSize)));
    }
    if (value.axisValues && typeof value.axisValues === "object") {
      setAxisValues(value.axisValues);
    }
  }, [value]);

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      setFavorites(asArray(parsed.favorites));
      setRecent(asArray(parsed.recent));
    } catch {
      setFavorites([]);
      setRecent([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ favorites, recent }),
    );
  }, [favorites, recent, storageKey]);

  const normalizedAxisValues = useMemo(
    () => normalizeAxisState(axisValues, selectedFont?.axes || []),
    [axisValues, selectedFont],
  );

  const similarFonts = useMemo(
    () => getSimilarFonts(selectedFont, safeFonts, similarLimit),
    [selectedFont, safeFonts, similarLimit],
  );

  const variationSettings = useMemo(
    () => buildVariationSettings(normalizedAxisValues, selectedFont?.axes || []),
    [normalizedAxisValues, selectedFont],
  );

  const previewStyle = useMemo(
    () => ({
      fontFamily: selectedFont
        ? `'${selectedFont.family}', system-ui, sans-serif`
        : "system-ui, sans-serif",
      fontSize: `${fontSize}px`,
      fontVariationSettings: variationSettings || undefined,
    }),
    [fontSize, selectedFont, variationSettings],
  );

  const cssSnippet = useMemo(
    () =>
      buildCssSnippet({
        family: selectedFont?.family || "Inter",
        fontSize,
        variationSettings,
      }),
    [fontSize, selectedFont, variationSettings],
  );

  useEffect(() => {
    onChange?.({
      family: selectedFont?.family || "",
      category: selectedFont?.category || "",
      fontSize,
      axisValues: normalizedAxisValues,
      variationSettings,
      cssSnippet,
      previewText,
      controlMode,
      favorites,
      recent,
    });
  }, [
    controlMode,
    cssSnippet,
    favorites,
    fontSize,
    normalizedAxisValues,
    onChange,
    previewText,
    recent,
    selectedFont,
    variationSettings,
  ]);

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

  function chooseFamily(family) {
    const safeFamily = String(family || "").trim();
    if (!safeFamily || safeFamily === selectedFamily) return;
    if (confirmBeforeSwitch && typeof window !== "undefined") {
      const ok = window.confirm(`Load "${safeFamily}"?`);
      if (!ok) return;
    }
    setSelectedFamily(safeFamily);
    setRecent((previous) => pushUnique(previous, safeFamily));
  }

  function updateAxis(axis, rawValue) {
    setAxisValues((previous) => ({
      ...previous,
      [axis.tag]: normalizeAxisValue(rawValue, axis),
    }));
  }

  function resetAxis(axis) {
    updateAxis(axis, axis.default);
  }

  function resetAllAxes() {
    if (!selectedFont) return;
    setAxisValues(collectInitialAxisValues(selectedFont.axes || [], {}));
  }

  function toggleFavorite(family) {
    setFavorites((previous) =>
      previous.includes(family)
        ? previous.filter((row) => row !== family)
        : pushUnique(previous, family),
    );
  }

  function applySelection() {
    onApply?.({
      family: selectedFont?.family || "",
      category: selectedFont?.category || "",
      fontSize,
      axisValues: normalizedAxisValues,
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

        {favorites.length > 0 ? (
          <div className="rgfc-section">
            <div className="rgfc-section-title">Favorites</div>
            <div className="rgfc-similar">
              {favorites.map((family) => (
                <button
                  key={`fav-${family}`}
                  type="button"
                  className="rgfc-chip"
                  onClick={() => chooseFamily(family)}
                >
                  {family}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {recent.length > 0 ? (
          <div className="rgfc-section">
            <div className="rgfc-section-title">Recent</div>
            <div className="rgfc-similar">
              {recent.map((family) => (
                <button
                  key={`recent-${family}`}
                  type="button"
                  className="rgfc-chip"
                  onClick={() => chooseFamily(family)}
                >
                  {family}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rgfc-font-list">
          {filteredFonts.map((font) => (
            <button
              key={font.family}
              type="button"
              className={`rgfc-font-row ${
                selectedFont?.family === font.family ? "active" : ""
              }`}
              onClick={() => chooseFamily(font.family)}
            >
              <span className="rgfc-font-meta">
                <span className="rgfc-font-family">{font.family}</span>
                <span className="rgfc-font-sub">
                  {font.category} · {(font.axes || []).length} axes
                </span>
              </span>
              <span className="rgfc-row-actions">
                <button
                  type="button"
                  className={`rgfc-star ${
                    favorites.includes(font.family) ? "active" : ""
                  }`}
                  aria-label={
                    favorites.includes(font.family)
                      ? `Remove ${font.family} from favorites`
                      : `Add ${font.family} to favorites`
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFavorite(font.family);
                  }}
                >
                  {favorites.includes(font.family) ? "★" : "☆"}
                </button>
                <span
                  style={{
                    fontFamily: `'${font.family}', system-ui, sans-serif`,
                  }}
                >
                Aa
                </span>
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
        <div className="rgfc-bar">
          {allowAdvancedToggle ? (
            <div className="rgfc-mode-toggle" role="tablist" aria-label="Control mode">
              <button
                type="button"
                className={`rgfc-mode ${controlMode === "slider" ? "active" : ""}`}
                onClick={() => setControlMode("slider")}
              >
                Slider mode
              </button>
              <button
                type="button"
                className={`rgfc-mode ${controlMode === "knob" ? "active" : ""}`}
                onClick={() => setControlMode("knob")}
              >
                Knob mode
              </button>
            </div>
          ) : null}
          <button type="button" className="rgfc-button" onClick={resetAllAxes}>
            Reset all axes
          </button>
        </div>

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

        {controlMode === "knob" ? (
          <div className="rgfc-knob-grid">
            {(selectedFont?.axes || []).map((axis) => (
              <AxisKnob
                key={`knob-${axis.tag}`}
                axis={axis}
                value={normalizedAxisValues[axis.tag]}
                onChange={(next) => updateAxis(axis, next)}
                onReset={() => resetAxis(axis)}
              />
            ))}
          </div>
        ) : (
          <div className="rgfc-axes">
            {(selectedFont?.axes || []).map((axis) => (
              <div key={axis.tag} className="rgfc-axis">
                <div className="rgfc-axis-head">
                  <span>{axis.tag}</span>
                  <span>{normalizedAxisValues[axis.tag] ?? axis.default}</span>
                </div>
                <input
                  type="range"
                  min={axis.min}
                  max={axis.max}
                  step={axis.step || 1}
                  value={normalizedAxisValues[axis.tag] ?? axis.default}
                  onChange={(event) => updateAxis(axis, event.target.value)}
                />
                <button
                  type="button"
                  className="rgfc-axis-reset"
                  onClick={() => resetAxis(axis)}
                >
                  Reset
                </button>
              </div>
            ))}
          </div>
        )}

        {similarFonts.length > 0 ? (
          <div className="rgfc-section">
            <div className="rgfc-section-title">Similar fonts</div>
            <div className="rgfc-similar">
            {similarFonts.map((font) => (
              <button
                key={font.family}
                type="button"
                className="rgfc-chip"
                onClick={() => chooseFamily(font.family)}
              >
                {font.family}
              </button>
            ))}
          </div>
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
