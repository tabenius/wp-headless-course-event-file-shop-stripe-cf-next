"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const CATEGORIES = ["All", "sans-serif", "serif", "display", "handwriting", "monospace"];
const PREVIEW_TEXT_KEY = "ragbaz-font-preview-text";
const DEFAULT_PREVIEW = "The quick brown fox jumps over the lazy dog";
const PAGE_SIZE = 20;

/** Inject a Google Fonts CDN <link> for preview, replacing any pending (not-yet-loaded) link. */
function useGoogleFontsPreview() {
  const pendingLinkRef = useRef(null);
  const loadedFamilies = useRef(new Set());

  const previewFont = useCallback((family) => {
    if (loadedFamilies.current.has(family)) return;

    // Remove previous pending link if it hasn't fired load yet
    if (pendingLinkRef.current && !pendingLinkRef.current._loaded) {
      pendingLinkRef.current.remove();
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
    link._loaded = false;
    link.onload = () => {
      link._loaded = true;
      loadedFamilies.current.add(family);
    };
    document.head.appendChild(link);
    pendingLinkRef.current = link;
  }, []);

  // Cleanup: remove all preview links when modal unmounts
  const cleanup = useCallback(() => {
    // Remove all Google Fonts preview links added by this hook
    loadedFamilies.current.clear();
  }, []);

  return { previewFont, cleanup };
}

export default function AdminFontBrowserModal({ role, currentFamily, downloadedFamilies, onSelect, onClose, onDownloadStart, onDownloadEnd }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [variableOnly, setVariableOnly] = useState(false);
  const [previewText, setPreviewText] = useState(
    () => (typeof localStorage !== "undefined" && localStorage.getItem(PREVIEW_TEXT_KEY)) || DEFAULT_PREVIEW
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [catalogError, setCatalogError] = useState(null);
  const [downloading, setDownloading] = useState(new Set()); // families currently downloading
  const [downloaded, setDownloaded] = useState(new Set(downloadedFamilies || []));
  const [downloadErrors, setDownloadErrors] = useState({}); // family → error message
  const [weightPickerFamily, setWeightPickerFamily] = useState(null); // for non-variable download
  const [selectedWeights, setSelectedWeights] = useState([400, 700]);
  const sentinelRef = useRef(null);
  const { previewFont, cleanup } = useGoogleFontsPreview();

  // Fetch catalog
  const fetchCatalog = useCallback(() => {
    setLoading(true);
    setCatalogError(null);
    fetch("/api/admin/fonts/catalog")
      .then((r) => r.json())
      .then((data) => {
        setCatalog(data.fonts || []);
        setLoading(false);
      })
      .catch((err) => {
        setCatalogError(err?.message || "Failed to load fonts");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchCatalog();
    return () => cleanup();
  }, [fetchCatalog, cleanup]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount((c) => c + PAGE_SIZE); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Persist preview text
  useEffect(() => {
    try { localStorage.setItem(PREVIEW_TEXT_KEY, previewText); } catch (_) {}
  }, [previewText]);

  // Filtered + sliced list
  const filtered = catalog.filter((f) => {
    if (search && !f.family.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== "All" && f.category !== category) return false;
    if (variableOnly && !f.axes?.some((a) => a.tag === "wght")) return false;
    return true;
  });
  const visible = filtered.slice(0, visibleCount);

  async function downloadFont(family, weights) {
    setDownloading((d) => new Set([...d, family]));
    setDownloadErrors((e) => { const next = { ...e }; delete next[family]; return next; });
    if (onDownloadStart) onDownloadStart();
    try {
      const res = await fetch("/api/admin/fonts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family, weights }),
      });
      if (res.ok) {
        setDownloaded((d) => new Set([...d, family]));
      } else {
        const msg = await res.text().catch(() => `HTTP ${res.status}`);
        setDownloadErrors((e) => ({ ...e, [family]: msg || `HTTP ${res.status}` }));
      }
    } catch (err) {
      setDownloadErrors((e) => ({ ...e, [family]: err?.message || "Download failed" }));
    } finally {
      setDownloading((d) => { const s = new Set(d); s.delete(family); return s; });
      setWeightPickerFamily(null);
      if (onDownloadEnd) onDownloadEnd();
    }
  }

  function handleSelect(font) {
    const isVar = font.axes?.some((a) => a.tag === "wght");
    const roleObj = {
      type: "google",
      family: font.family,
      isVariable: isVar,
      ...(isVar ? { weightRange: [100, 900] } : { weights: [400, 700] }),
    };
    onSelect(roleObj);
    // Start background download if not yet downloaded (modal may unmount — callbacks keep parent in sync)
    if (!downloaded.has(font.family)) {
      downloadFont(font.family, isVar ? undefined : [400, 700]);
    }
  }

  const roleLabel = {
    fontDisplay: "Display", fontHeading: "Heading",
    fontSubheading: "Subheading", fontBody: "Body", fontButton: "Button",
  }[role] || role;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 pt-12 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Choose {roleLabel} Font</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-2xl leading-none">&times;</button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 px-6 py-3 border-b bg-gray-50">
          <input
            type="text"
            placeholder="Search fonts…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            className="flex-1 min-w-48 px-3 py-1.5 border rounded-lg text-sm"
          />
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setVisibleCount(PAGE_SIZE); }}
            className="px-3 py-1.5 border rounded-lg text-sm bg-white"
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={variableOnly}
              onChange={(e) => { setVariableOnly(e.target.checked); setVisibleCount(PAGE_SIZE); }}
              className="rounded"
            />
            Variable only
          </label>
        </div>

        {/* Preview text editor */}
        <div className="px-6 py-2 border-b bg-gray-50">
          <input
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value || DEFAULT_PREVIEW)}
            className="w-full text-sm text-gray-500 bg-transparent border-none outline-none"
          />
        </div>

        {/* Font list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading && <div className="p-8 text-center text-gray-400">Loading fonts…</div>}
          {!loading && catalogError && (
            <div className="p-8 text-center">
              <p className="text-red-600 text-sm mb-3">{catalogError}</p>
              <button
                onClick={fetchCatalog}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !catalogError && visible.length === 0 && (
            <div className="p-8 text-center text-gray-400">No fonts found.</div>
          )}
          {visible.map((font) => {
            const isVar = font.axes?.some((a) => a.tag === "wght");
            const isDl = downloaded.has(font.family);
            const isDling = downloading.has(font.family);
            const isCurrent = font.family === currentFamily;
            const dlError = downloadErrors[font.family];

            // Trigger CDN preview when font becomes visible
            // (IntersectionObserver on individual rows is overkill; trigger on render)
            previewFont(font.family);

            return (
              <div
                key={font.family}
                className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-50 ${isCurrent ? "ring-2 ring-inset ring-indigo-500" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 mb-1">
                    {font.family}
                    {isVar && <span className="ml-2 text-xs text-indigo-500">Variable</span>}
                  </div>
                  <div
                    className="text-base text-gray-700 truncate"
                    style={{ fontFamily: `'${font.family}', serif` }}
                  >
                    {previewText}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {dlError && (
                    <span className="text-xs text-red-500" title={dlError}>Download failed</span>
                  )}
                  <div className="flex items-center gap-2">
                  {isDl ? (
                    <span className="text-xs text-green-600 font-medium">◉ Downloaded</span>
                  ) : isVar ? (
                    <button
                      onClick={() => downloadFont(font.family)}
                      disabled={isDling}
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 disabled:opacity-50"
                    >
                      {isDling ? "…" : dlError ? "Retry" : "Download"}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setWeightPickerFamily(font.family); setSelectedWeights([400, 700]); }}
                      disabled={isDling}
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 disabled:opacity-50"
                    >
                      {isDling ? "…" : dlError ? "Retry" : "Download"}
                    </button>
                  )}
                  <button
                    onClick={() => handleSelect(font)}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Select
                  </button>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-4" />
        </div>

        {/* Weight picker popover (non-variable fonts) */}
        {weightPickerFamily && (() => {
          const wf = catalog.find((f) => f.family === weightPickerFamily);
          const availableWeights = wf
            ? wf.variants
                .map((v) => (v === "regular" ? 400 : parseInt(v, 10)))
                .filter((n) => !isNaN(n))
            : [400, 700];
          return (
            <div className="border-t p-6">
              <div className="font-medium text-sm text-gray-800 mb-3">
                Select weights for {weightPickerFamily}
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {availableWeights.map((w) => (
                  <label key={w} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedWeights.includes(w)}
                      onChange={(e) =>
                        setSelectedWeights((ws) =>
                          e.target.checked ? [...ws, w] : ws.filter((x) => x !== w)
                        )
                      }
                    />
                    {w}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadFont(weightPickerFamily, selectedWeights)}
                  disabled={selectedWeights.length === 0}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Download
                </button>
                <button
                  onClick={() => setWeightPickerFamily(null)}
                  className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
