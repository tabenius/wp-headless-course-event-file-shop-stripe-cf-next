"use client";

import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import {
  deriveDigitalProductCategories,
  extractCategoryNames,
  toCategorySlugs,
} from "@/lib/contentCategories";

function slugFromCategoryName(name) {
  return toCategorySlugs([name])[0] || "";
}

function parseVatPercent(value) {
  const numeric = Number.parseFloat(String(value || "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

export default function AdminVatTab({
  shopVatByCategory,
  updateShopVatByCategory,
  shopSettingsSaving,
  wcProducts,
  wpCourses,
  wpEvents,
  products,
}) {
  const [vatDraft, setVatDraft] = useState({});
  const [vatCategoryDraft, setVatCategoryDraft] = useState("");
  const [vatRateDraft, setVatRateDraft] = useState("");

  useEffect(() => {
    if (shopVatByCategory && typeof shopVatByCategory === "object") {
      setVatDraft(shopVatByCategory);
    }
  }, [shopVatByCategory]);

  const knownCategoryNames = useMemo(
    () =>
      extractCategoryNames(
        ...wcProducts.map((item) => item.categories),
        ...wpCourses.map((item) => item.categories),
        ...wpEvents.map((item) => item.categories),
        ...products.map(
          (product) => deriveDigitalProductCategories(product).categories,
        ),
      ),
    [wcProducts, wpCourses, wpEvents, products],
  );

  const vatRows = useMemo(() => {
    const rows = knownCategoryNames
      .map((name) => ({
        name,
        slug: slugFromCategoryName(name),
      }))
      .filter((row) => row.slug);
    const seen = new Set(rows.map((row) => row.slug));
    for (const slug of Object.keys(vatDraft || {})) {
      if (seen.has(slug)) continue;
      rows.push({
        name: slug.replace(/-/g, " "),
        slug,
      });
      seen.add(slug);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [knownCategoryNames, vatDraft]);

  function setVatRateForSlug(slug, rawValue) {
    setVatDraft((prev) => {
      const next = { ...prev };
      if (rawValue === "") {
        delete next[slug];
        return next;
      }
      const parsed = parseVatPercent(rawValue);
      if (parsed === null) return prev;
      next[slug] = parsed;
      return next;
    });
  }

  function removeVatCategory(slug) {
    setVatDraft((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  }

  function addVatCategoryRow() {
    const name = vatCategoryDraft.trim();
    const slug = slugFromCategoryName(name);
    if (!slug) return;
    const parsed = parseVatPercent(vatRateDraft);
    if (parsed === null) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { type: "error", message: t("admin.vatInvalidRate") },
        }),
      );
      return;
    }
    setVatDraft((prev) => ({ ...prev, [slug]: parsed }));
    setVatCategoryDraft("");
    setVatRateDraft("");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {t("admin.vatMapTitle")}
            </p>
            <p className="text-xs text-slate-700/90 mt-1">
              {t("admin.vatMapHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateShopVatByCategory(vatDraft)}
            disabled={shopSettingsSaving}
            className="px-3 py-1.5 rounded-md bg-slate-700 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {shopSettingsSaving
              ? t("common.saving", "Saving…")
              : t("admin.vatMapSave")}
          </button>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_92px_52px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-1">
            <span>{t("admin.categoryLabel")}</span>
            <span>{t("admin.vatPercent")}</span>
            <span>{t("admin.actionsLabel")}</span>
          </div>
          <div className="space-y-1 max-h-72 overflow-auto pr-1">
            {vatRows.length === 0 ? (
              <p className="text-xs text-gray-500 px-1 py-2">
                {t("admin.vatMapEmpty")}
              </p>
            ) : (
              vatRows.map((row) => (
                <div
                  key={row.slug}
                  className="grid grid-cols-[minmax(0,1fr)_92px_52px] gap-2 items-center rounded-lg border border-slate-100 bg-white px-2 py-1.5"
                >
                  <span
                    className="text-sm text-gray-700 truncate"
                    title={row.slug}
                  >
                    {row.name}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={vatDraft?.[row.slug] ?? ""}
                    onChange={(e) =>
                      setVatRateForSlug(row.slug, e.target.value)
                    }
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeVatCategory(row.slug)}
                    className="text-xs text-red-600 hover:underline"
                    title={t("admin.vatRemoveCategory")}
                  >
                    {t("common.remove")}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_90px_auto] gap-2">
          <input
            type="text"
            value={vatCategoryDraft}
            onChange={(e) => setVatCategoryDraft(e.target.value)}
            placeholder={t("admin.vatNewCategoryPlaceholder")}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={vatRateDraft}
            onChange={(e) => setVatRateDraft(e.target.value)}
            placeholder="25"
            className="border rounded px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addVatCategoryRow}
            className="px-3 py-2 rounded border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
          >
            {t("common.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
