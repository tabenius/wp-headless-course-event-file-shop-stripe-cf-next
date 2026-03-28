"use client";
import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";

const CATEGORIES = ["All", "sans-serif", "serif", "display", "handwriting", "monospace"];
const PREVIEW_TEXT_KEY = "ragbaz-font-preview-text";
const DEFAULT_PREVIEW = "The quick brown fox jumps over the lazy dog";
const PAGE_SIZE = 20;

/** Optimized Hook for Google Fonts CDN injection */
function useGoogleFontsPreview() {
  const loadedFamilies = useRef(new Set());

  const previewFont = useCallback((family) => {
    if (loadedFamilies.current.has(family)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
    link.onload = () => loadedFamilies.current.add(family);
    document.head.appendChild(link);
  }, []);

  const cleanup = useCallback(() => {
    loadedFamilies.current.clear();
  }, []);

  return { previewFont, cleanup };
}

/** Memoized Individual Row to prevent massive re-renders */
const FontRow = memo(({
  font, previewText, isCurrent, isDl, isDling, dlError, usedByRoles,
  onSelect, onDownload, onOpenWeightPicker, previewFont
}) => {
  const rowRef = useRef(null);
  const isVar = font.axes?.some((a) => a.tag === "wght");

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        previewFont(font.family);
        observer.disconnect();
      }
    }, { rootMargin: "100px" });

    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, [font.family, previewFont]);

  return (
    <div
      ref={rowRef}
      className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors ${
        isCurrent ? "ring-2 ring-inset ring-indigo-500 bg-indigo-50/30" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-2 flex-wrap">
          {font.family}
          {isVar && <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded text-[10px]">Variable</span>}
          {usedByRoles && usedByRoles.map((r) => (
            <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{r}</span>
          ))}
        </div>
        <div
          className="text-lg text-gray-800 truncate"
          style={{ fontFamily: `'${font.family}', sans-serif` }}
        >
          {previewText}
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-1 shrink-0">
        {dlError && <span className="text-[10px] text-red-500">Error: {dlError}</span>}
        <div className="flex items-center gap-2">
          {isDl ? (
            <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">Downloaded</span>
          ) : (
            <button
              onClick={() => isVar ? onDownload(font.family) : onOpenWeightPicker(font.family)}
              disabled={isDling}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-white hover:border-gray-400 disabled:opacity-50 transition-all"
            >
              {isDling ? "..." : "Download"}
            </button>
          )}
          <button
            onClick={() => onSelect(font)}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm active:scale-95 transition-all"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
});
FontRow.displayName = "FontRow";

export default function AdminFontBrowserModal({ role, currentFamily, downloadedFamilies, usedFonts = [], onSelect, onClose, onDownloadStart, onDownloadEnd }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [variableOnly, setVariableOnly] = useState(false);
  const [previewText, setPreviewText] = useState(() => 
    (typeof localStorage !== "undefined" && localStorage.getItem(PREVIEW_TEXT_KEY)) || DEFAULT_PREVIEW
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [catalogError, setCatalogError] = useState(null);
  const [downloading, setDownloading] = useState(new Set());
  const [downloaded, setDownloaded] = useState(new Set(downloadedFamilies || []));
  const [downloadErrors, setDownloadErrors] = useState({});
  const [weightPickerFamily, setWeightPickerFamily] = useState(null);
  const [selectedWeights, setSelectedWeights] = useState([400, 700]);
  
  const sentinelRef = useRef(null);
  const { previewFont, cleanup } = useGoogleFontsPreview();

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setCatalogError(null);
    try {
      const r = await fetch("/api/admin/fonts/catalog");
      const data = await r.json();
      setCatalog(data.fonts || []);
    } catch (err) {
      setCatalogError("Failed to load fonts catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
    return () => cleanup();
  }, [fetchCatalog, cleanup]);

  // Infinite Scroll Logic
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount(prev => prev + PAGE_SIZE);
    }, { rootMargin: "300px" });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  // Persist preview text
  useEffect(() => {
    localStorage.setItem(PREVIEW_TEXT_KEY, previewText);
  }, [previewText]);

  // Optimized filtering
  const filtered = useMemo(() => {
    return catalog.filter((f) => {
      const matchesSearch = !search || f.family.toLowerCase().includes(search.toLowerCase());
      const matchesCat = category === "All" || f.category === category;
      const matchesVar = !variableOnly || f.axes?.some((a) => a.tag === "wght");
      return matchesSearch && matchesCat && matchesVar;
    });
  }, [catalog, search, category, variableOnly]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  async function downloadFont(family, weights) {
    setDownloading(d => new Set([...d, family]));
    if (onDownloadStart) onDownloadStart();
    try {
      const res = await fetch("/api/admin/fonts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family, weights }),
      });
      if (res.ok) {
        setDownloaded(d => new Set([...d, family]));
      } else {
        setDownloadErrors(e => ({ ...e, [family]: "Download failed" }));
      }
    } catch (err) {
      setDownloadErrors(e => ({ ...e, [family]: err.message }));
    } finally {
      setDownloading(d => { const s = new Set(d); s.delete(family); return s; });
      setWeightPickerFamily(null);
      if (onDownloadEnd) onDownloadEnd();
    }
  }

  const handleSelect = (font) => {
    const isVar = font.axes?.some((a) => a.tag === "wght");
    onSelect({
      type: "google",
      family: font.family,
      isVariable: isVar,
      ...(isVar ? { weightRange: [100, 900] } : { weights: [400, 700] }),
    });
    if (!downloaded.has(font.family)) downloadFont(font.family, isVar ? undefined : [400, 700]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 pt-12 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">Font Browser <span className="font-normal text-gray-400">({role})</span></h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black transition-colors text-2xl">&times;</button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-4 bg-gray-50 border-b">
          <input
            type="text"
            placeholder="Search fonts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            className="px-3 py-2 border rounded-xl text-sm focus:ring-2 ring-indigo-500 outline-none"
          />
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setVisibleCount(PAGE_SIZE); }}
            className="px-3 py-2 border rounded-xl text-sm bg-white cursor-pointer"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <div className="flex items-center px-2">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={variableOnly}
                onChange={(e) => { setVariableOnly(e.target.checked); setVisibleCount(PAGE_SIZE); }}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              Variable Fonts
            </label>
          </div>
        </div>

        {/* Live Preview Input */}
        <div className="px-6 py-3 border-b bg-white">
          <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Preview Text</label>
          <input
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            className="w-full text-sm text-gray-600 focus:text-indigo-600 outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          {loading ? (
            <div className="p-12 text-center animate-pulse text-gray-400">Fetching Google Fonts...</div>
          ) : (
            <>
              {visible.map((font) => (
                <FontRow
                  key={font.family}
                  font={font}
                  previewText={previewText}
                  isCurrent={font.family === currentFamily}
                  isDl={downloaded.has(font.family)}
                  isDling={downloading.has(font.family)}
                  dlError={downloadErrors[font.family]}
                  usedByRoles={usedFonts.filter(u => u.family === font.family).map(u => u.role)}
                  onSelect={handleSelect}
                  onDownload={downloadFont}
                  onOpenWeightPicker={setWeightPickerFamily}
                  previewFont={previewFont}
                />
              ))}
              <div ref={sentinelRef} className="h-20" />
            </>
          )}
        </div>

        {/* Weight Picker Modal Overlay */}
        {weightPickerFamily && (
          <div className="absolute inset-x-0 bottom-0 bg-white border-t p-6 shadow-up-lg z-10 animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center mb-4">
              <p className="font-bold text-gray-900">Weights for {weightPickerFamily}</p>
              <button onClick={() => setWeightPickerFamily(null)} className="text-gray-400">&times;</button>
            </div>
            <div className="flex flex-wrap gap-3 mb-6">
              {[300, 400, 500, 600, 700, 800].map(w => (
                <button
                  key={w}
                  onClick={() => setSelectedWeights(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w])}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                    selectedWeights.includes(w) ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-200 text-gray-600"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
            <button
              onClick={() => downloadFont(weightPickerFamily, selectedWeights)}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold"
            >
              Download Selected Weights
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
