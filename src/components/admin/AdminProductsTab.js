"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { parsePriceCents } from "@/lib/parsePrice";
import {
  deriveDigitalProductCategories,
  extractCategoryNames,
  toCategorySlugs,
} from "@/lib/contentCategories";
import ImageUploader from "./ImageUploader";
import ImageGenerationPanel from "./ImageGenerationPanel";
import UserAccessPanel from "./UserAccessPanel";
import AdminDocsContextLinks from "./AdminDocsContextLinks";
import AdminFieldHelpLink from "./AdminFieldHelpLink";
import CyberduckBookmarkPanel from "./CyberduckBookmarkPanel";
import { resolveSlugPrefix } from "@/lib/productRoutes";

function toCurrencyUnits(cents) {
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : "0.00";
}

function slugFromCategoryName(name) {
  return toCategorySlugs([name])[0] || "";
}

function parseVatPercent(value) {
  const numeric = Number.parseFloat(String(value || "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

function normalizeMode(product = {}) {
  const explicit = String(product?.productMode || "")
    .trim()
    .toLowerCase();
  if (explicit === "asset" || explicit === "manual_uri" || explicit === "digital_file") {
    return explicit;
  }
  if (product?.type === "course") return "manual_uri";
  if (String(product?.assetId || "").trim()) return "asset";
  return "digital_file";
}

function digitalConfigReasons(product = {}) {
  const reasons = [];
  const mode = normalizeMode(product);
  const isFree = product?.free === true;
  const priceCents = Number(product?.priceCents || 0);

  if (!isFree && !(Number.isFinite(priceCents) && priceCents > 0)) {
    reasons.push(
      t(
        "admin.needsConfigReasonMissingPrice",
        "Set a price or mark this product as free.",
      ),
    );
  }

  if (mode === "digital_file" && !String(product?.fileUrl || "").trim()) {
    reasons.push(
      t(
        "admin.needsConfigReasonMissingFileUrl",
        "Add a downloadable file URL for delivery.",
      ),
    );
  }

  if (mode === "manual_uri" && !String(product?.contentUri || "").trim()) {
    reasons.push(
      t(
        "admin.needsConfigReasonMissingContentUri",
        "Set a protected content URI for this product.",
      ),
    );
  }

  if (mode === "asset" && !String(product?.assetId || "").trim()) {
    reasons.push(
      t(
        "admin.needsConfigReasonMissingAssetId",
        "Select an asset ID for this asset-based product.",
      ),
    );
  }

  return reasons;
}

function normalizeAssetId(value) {
  const safe = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe.slice(0, 96);
}

function fallbackAssetIdFromItem(item) {
  const native = normalizeAssetId(item?.asset?.assetId || "");
  if (native) return native;
  const source = normalizeAssetId(item?.source || "asset") || "asset";
  const token = normalizeAssetId(
    item?.key ||
      item?.sourceId ||
      item?.title ||
      item?.url ||
      Math.random().toString(36).slice(2),
  );
  return `${source}-${token}`.slice(0, 96);
}

function formatSize(bytes) {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 B";
  if (numeric >= 1024 * 1024 * 1024) return `${(numeric / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (numeric >= 1024 * 1024) return `${(numeric / (1024 * 1024)).toFixed(1)} MB`;
  if (numeric >= 1024) return `${(numeric / 1024).toFixed(1)} KB`;
  return `${numeric} B`;
}

function BrokenImageIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M1.5 6A2.5 2.5 0 014 3.5h16A2.5 2.5 0 0122.5 6v12a2.5 2.5 0 01-2.5 2.5H4A2.5 2.5 0 011.5 18V6zm2.75 0a.75.75 0 00-.75.75v8.88l4.17-4.17a1.5 1.5 0 012.12 0l2.11 2.11 2.65-2.65a1.5 1.5 0 012.12 0l2.83 2.83V6.75a.75.75 0 00-.75-.75h-16zm16 12a.75.75 0 00.75-.75v-.38l-3.89-3.89-2.65 2.65a1.5 1.5 0 01-2.12 0l-2.11-2.11-4.73 4.73h14.75z"
        clipRule="evenodd"
      />
      <path d="m18.53 3.47 2 2-15.06 15.06-2-2L18.53 3.47z" />
    </svg>
  );
}

function SafeProductImage({ src, alt = "", className, fallbackClassName }) {
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    setIsBroken(false);
  }, [src]);

  if (!src || isBroken) {
    return (
      <div
        className={
          fallbackClassName ||
          "w-full h-full flex items-center justify-center rounded bg-rose-50 text-rose-400"
        }
      >
        <BrokenImageIcon className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setIsBroken(true)}
    />
  );
}

// ── Inner tab nav ────────────────────────────────────────────────────────────

function InnerTabs({ active, onChange }) {
  const tabs = [
    { key: "access", label: t("admin.productsTabAll", "Products") },
    { key: "settings", label: t("admin.visibleTypesTab", "Types") },
  ];
  return (
    <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 min-w-0">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`min-w-[8.5rem] flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            active === key
              ? "bg-white text-slate-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Shared: image upload button ───────────────────────────────────────────────

function ImagePickerButton({
  imgUrl,
  onUploaded,
  onError,
  uploadBackend = "wordpress",
  uploadOptions = [],
  sizeClass = "h-28 w-28",
}) {
  return (
    <ImageUploader
      value={imgUrl || ""}
      onUploaded={onUploaded}
      onError={onError}
      uploadBackend={uploadBackend}
      uploadOptions={uploadOptions}
      renderTrigger={(openPicker) => (
        <button
          type="button"
          onClick={openPicker}
          className={`group relative z-10 pointer-events-auto flex ${sizeClass} shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-gray-700 bg-gradient-to-br from-gray-100 to-gray-200 shadow-[inset_0_0_0_2px_rgba(17,24,39,0.35),0_1px_2px_rgba(0,0,0,0.18)] transition-colors hover:border-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1`}
          title={t("admin.uploadImage")}
          aria-label={t("admin.uploadImage")}
        >
          {imgUrl ? (
            <SafeProductImage
              src={imgUrl}
              alt=""
              className="w-full h-full object-cover"
              fallbackClassName="w-full h-full flex items-center justify-center bg-rose-50 text-rose-400"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-10 h-10 text-gray-500"
              >
                <path
                  fillRule="evenodd"
                  d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </div>
          <span className="pointer-events-none absolute inset-[2px] z-[1] rounded-md border border-gray-800/80" />
          <span className="pointer-events-none absolute top-1 right-1 z-[2] inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/60 bg-black/70 text-white shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </span>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-black/65 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            {t("admin.uploadImage")}
          </span>
        </button>
      )}
    />
  );
}

// ── Shared: price + access form ───────────────────────────────────────────────

function CopyEmailsButton({ emails }) {
  const [copied, setCopied] = useState(false);
  if (!emails || emails.length === 0) return null;

  function handleCopy() {
    const text = emails.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs px-2 py-0.5 rounded border hover:bg-gray-50 transition-colors"
      title={`Copy ${emails.length} email address${emails.length === 1 ? "" : "es"}`}
    >
      {copied ? "Copied!" : `Copy emails (${emails.length})`}
    </button>
  );
}

function PriceAccessForm({
  price,
  setPrice,
  free,
  setFree,
  currency,
  setCurrency,
  vatPercent,
  setVatPercent,
  userSearch,
  setUserSearch,
  users,
  allowedUsers,
  filteredUsers,
  toggleUser,
  manualEmail,
  setManualEmail,
  addManualEmail,
  saveUnified,
  loading,
  // Incrementing this counter triggers an auto-save after price state settles
  autoSaveTrigger,
}) {
  const parsedPrice = Number.parseFloat(String(price || "").replace(",", "."));
  const freeAccessEnabled = Boolean(free);
  const latestSaveUnifiedRef = useRef(saveUnified);

  useEffect(() => {
    latestSaveUnifiedRef.current = saveUnified;
  }, [saveUnified]);

  useEffect(() => {
    if (!autoSaveTrigger) return;
    latestSaveUnifiedRef.current?.();
  }, [autoSaveTrigger]);

  return (
    <div className="space-y-5">
      {/* Price row */}
      <div className="space-y-2">
        <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <span>
            {t("admin.courseFee")} <span className="text-red-500">*</span>
          </span>
          <AdminFieldHelpLink slug="product-value" />
        </label>
        {freeAccessEnabled && (
          <p className="text-xs text-green-600">{t("admin.productFreeHint")}</p>
        )}
        {!freeAccessEnabled && Number.isFinite(parsedPrice) && parsedPrice === 0 && (
          <p className="text-xs text-amber-600">{t("admin.productPriceAmbiguous")}</p>
        )}
        <div className="flex gap-2">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min="0"
            step="0.01"
            placeholder="0.00"
            disabled={freeAccessEnabled}
            className={`flex-1 border rounded px-3 py-2 text-sm ${
              freeAccessEnabled
                ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                : ""
            }`}
          />
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className="w-20 border rounded px-3 py-2 text-sm"
            maxLength={5}
            title={t("admin.currencyHint")}
          />
        </div>
        <p className="text-xs text-gray-400">{t("admin.priceSavedLocally")}</p>
      </div>

      {/* VAT override */}
      <div className="space-y-2">
        <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <span>{t("admin.vatOverrideLabel")}</span>
          <AdminFieldHelpLink slug="technical-manual" />
        </label>
        <p className="text-xs text-gray-500">{t("admin.vatOverrideHint")}</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={vatPercent}
            onChange={(e) => setVatPercent(e.target.value)}
            min="0"
            max="100"
            step="0.1"
            placeholder={t("admin.vatOverridePlaceholder")}
            className="w-36 border rounded px-3 py-2 text-sm"
          />
          <span className="text-sm text-gray-500">%</span>
          <button
            type="button"
            onClick={() => setVatPercent("")}
            className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
          >
            {t("admin.vatClearOverride")}
          </button>
        </div>
      </div>

      {/* User access */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-semibold text-gray-700">
            {t("admin.allowedUsers")}
          </label>
          <CopyEmailsButton emails={allowedUsers} />
        </div>
        <p className="text-xs text-gray-500">{t("admin.allowedUsersHint")}</p>
        <input
          type="text"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Search users…"
          className="w-full border rounded px-3 py-1.5 text-sm"
        />
        <div className="border rounded p-3 max-h-44 overflow-auto space-y-1.5 bg-white text-sm">
          {users.length === 0 && allowedUsers.length === 0 ? (
            <p className="text-gray-400">{t("admin.noUsersFound")}</p>
          ) : (
            <>
              {filteredUsers.map((user) => (
                <label
                  key={user.email}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={allowedUsers.includes(user.email)}
                    onChange={() => toggleUser(user.email)}
                    className="accent-slate-600"
                  />
                  <span>
                    {user.name}{" "}
                    <span className="text-gray-400">({user.email})</span>
                  </span>
                </label>
              ))}
              {allowedUsers
                .filter((email) => !users.some((u) => u.email === email))
                .map((email) => (
                  <label
                    key={email}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggleUser(email)}
                      className="accent-slate-600"
                    />
                    <span>{email}</span>
                  </label>
                ))}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), addManualEmail())
            }
            placeholder={t("admin.addEmailPlaceholder")}
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addManualEmail}
            className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
          >
            {t("common.add")}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={saveUnified}
        disabled={loading}
        className="w-full py-2 rounded bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
      >
        {loading ? t("admin.saving") : t("common.save", "Save")}
      </button>
    </div>
  );
}

function AssetPickerModal({ open, onClose, onSelect }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const loadItems = useCallback(async (searchText = "") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        source: "all",
        limit: "80",
      });
      if (searchText.trim()) params.set("search", searchText.trim());
      const response = await fetch(`/api/admin/media-library?${params.toString()}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || t("admin.imageBrowseLibraryLoadFailed"));
      }
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (loadError) {
      setItems([]);
      setError(loadError?.message || t("admin.imageBrowseLibraryLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadItems("");
  }, [open, loadItems]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      loadItems(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, loadItems]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose?.();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4"
      data-admin-modal="true"
    >
      <div className="w-full max-w-3xl max-h-[82vh] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {t("admin.productAssetPickerTitle", "Choose asset")}
            </h3>
            <p className="text-xs text-slate-500">
              {t(
                "admin.productAssetPickerHint",
                "Select an item from the asset library. If no asset ID exists, one is generated from source and object key.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            {t("common.close", "Close")}
          </button>
        </div>

        <div className="border-b border-slate-200 px-4 py-3">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              "admin.productAssetPickerSearch",
              "Search by title, key, mime type or URL",
            )}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="max-h-[56vh] overflow-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-slate-500">{t("common.loading")}</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t("admin.imageBrowseLibraryEmpty")}
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const assetId = fallbackAssetIdFromItem(item);
                const safeUrl = String(item?.url || "").trim();
                const canUse = Boolean(assetId && safeUrl);
                const sizeText = formatSize(item?.sizeBytes);
                return (
                  <div
                    key={item.id || `${item.source}-${item.key || item.url || item.title}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {item?.title || item?.key || item?.url || "Untitled asset"}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {assetId} · {item?.mimeType || "application/octet-stream"} ·{" "}
                          {sizeText} · {item?.source || "source"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!canUse}
                        onClick={() =>
                          onSelect?.({
                            assetId,
                            url: safeUrl,
                            mimeType: item?.mimeType || "",
                            title: item?.title || "",
                          })
                        }
                        className="shrink-0 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("admin.productAssetPickerUse", "Use asset")}
                      </button>
                    </div>
                    {safeUrl ? (
                      <p className="mt-1 truncate text-[11px] text-slate-500">{safeUrl}</p>
                    ) : (
                      <p className="mt-1 text-[11px] text-amber-700">
                        {t(
                          "admin.productAssetMissingUrl",
                          "This asset has no public URL yet. Upload/annotate first.",
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Access & Pricing ─────────────────────────────────────────────────────

function AccessTab({
  wcProducts,
  wpCourses,
  wpEvents,
  products,
  otherCourseUris,
  selectedContent,
  handleSelection,
  setSelectedCourse,
  courses,
  allWpContent,
  isWpSelection,
  isShopSelection,
  selectedShopProduct,
  shopIndex,
  showDetail,
  updateProduct,
  removeShopProduct,
  uploadFile,
  uploadingField,
  uploadBackend,
  uploadInfo,
  uploadInfoDetails,
  runtime,
  showImageGen,
  setShowImageGen,
  setWpEvents,
  setWcProducts,
  setWpCourses,
  setError,
  price,
  setPrice,
  currency,
  setCurrency,
  vatPercent,
  setVatPercent,
  userSearch,
  setUserSearch,
  users,
  selectedContentActive,
  setSelectedCourseActive,
  allowedUsers,
  filteredUsers,
  toggleUser,
  manualEmail,
  setManualEmail,
  addManualEmail,
  saveUnified,
  shopVatByCategory,
  updateShopVatByCategory,
  shopSettingsSaving,
  loading,
  editFormRef,
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [manualUriInput, setManualUriInput] = useState("");
  // Incrementing this triggers PriceAccessForm to auto-save after price state settles
  const [autoSaveTrigger, setAutoSaveTrigger] = useState(0);
  const [vatDraft, setVatDraft] = useState({});
  const [vatCategoryDraft, setVatCategoryDraft] = useState("");
  const [vatRateDraft, setVatRateDraft] = useState("");
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerProductIndex, setAssetPickerProductIndex] = useState(-1);
  const imageUploadOptions = [
    {
      id: "wordpress",
      label: t("admin.uploadTargetWordpress"),
      enabled: true,
    },
    {
      id: "r2",
      label: t("admin.uploadTargetR2"),
      enabled: Boolean(uploadInfo?.r2),
    },
    ...(uploadInfo?.s3Enabled
      ? [
          {
            id: "s3",
            label: t("admin.uploadTargetS3"),
            enabled: Boolean(uploadInfo?.s3),
          },
        ]
      : []),
  ];

  useEffect(() => {
    setVatDraft(
      shopVatByCategory && typeof shopVatByCategory === "object"
        ? shopVatByCategory
        : {},
    );
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

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };
  const SortArrow = ({ field }) =>
    sortField === field ? (
      <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  const TYPE_LABEL = { wc: "WC", lp: "LP", ev: "EV", shop: "DL", other: "URI" };
  const TYPE_COLOR = {
    wc: "admin-status-pill admin-status-pill-info",
    lp: "admin-status-pill admin-status-pill-muted",
    ev: "admin-status-pill admin-status-pill-warning",
    shop: "admin-status-pill admin-status-pill-success",
    other: "admin-status-pill admin-status-pill-muted",
  };

  const allItemsCount =
    wcProducts.length +
    wpCourses.length +
    wpEvents.length +
    products.length +
    otherCourseUris.length;

  function wpPriceForUri(uri) {
    const item = allWpContent.find((entry) => entry.uri === uri);
    if (!item) return 0;
    const raw =
      item.priceRendered || item.price || item.regularPrice || item.priceText;
    return parsePriceCents(raw || "");
  }

  const configReasonsForUri = (uri) => {
    if (uri.startsWith("__shop_")) {
      const idx = Number.parseInt(uri.replace("__shop_", ""), 10);
      const p = Number.isFinite(idx) ? products[idx] : null;
      if (!p) {
        return [t("admin.needsConfigReasonMissingProduct", "Product entry is missing.")];
      }
      return digitalConfigReasons(p);
    }
    const cfg = courses[uri];
    const hasConfiguredPrice =
      cfg && typeof cfg.priceCents === "number" && cfg.priceCents > 0;
    if (hasConfiguredPrice || wpPriceForUri(uri) > 0) return [];
    return [
      t(
        "admin.needsConfigReasonNoWpPrice",
        "No local or upstream price is configured for this item.",
      ),
    ];
  };
  const isConfigured = (uri) => configReasonsForUri(uri).length === 0;
  const needsConfigCount = [
    ...wcProducts.map((p) => p.uri),
    ...wpCourses.map((c) => c.uri),
    ...wpEvents.map((e) => e.uri),
    ...products.map((_, i) => `__shop_${i}`),
    ...otherCourseUris,
  ].filter((uri) => !isConfigured(uri)).length;

  const showItem = (uri, source) => {
    if (typeFilter === "needs-config") return !isConfigured(uri);
    if (typeFilter === "configured") return isConfigured(uri);
    if (typeFilter === "wc") return source === "wc";
    if (typeFilter === "lp") return source === "lp";
    if (typeFilter === "ev") return source === "ev";
    if (typeFilter === "shop") return source === "shop";
    return true; // "all"
  };

  function applyManualUri() {
    const trimmed = manualUriInput.trim();
    if (!trimmed) return;
    const normalized = `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
    setSelectedCourse(normalized);
    setManualUriInput("");
  }

  const selectedWpItem = isWpSelection
    ? allWpContent.find((item) => item.uri === selectedContent)
    : null;
  const selectedShopCategories =
    isShopSelection && selectedShopProduct
      ? deriveDigitalProductCategories(selectedShopProduct).categories
      : [];
  const selectedShopMode =
    selectedShopProduct?.productMode ||
    (selectedShopProduct?.assetId ? "asset" : "digital_file");
  const selectedCategories = extractCategoryNames(
    selectedWpItem?.categories,
    selectedShopCategories,
  );
  const selectedConfigReasons = selectedContent
    ? configReasonsForUri(selectedContent)
    : [];

  useEffect(() => {
    if (!isShopSelection) {
      setAssetPickerOpen(false);
      setAssetPickerProductIndex(-1);
    }
  }, [isShopSelection]);

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

  const listContainerRef = useRef(null);
  const didInitialListFocusRef = useRef(false);

  const focusProductList = useCallback((preferredUri = "") => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const container = listContainerRef.current;
      if (!container) return;
      const buttons = Array.from(
        container.querySelectorAll("button[data-product-list-item='true']"),
      );
      const target =
        buttons.find((button) => button.dataset.productUri === preferredUri) ||
        buttons[0] ||
        container;
      if (typeof target.focus === "function") {
        target.focus();
      }
      if (
        target !== container &&
        typeof target.scrollIntoView === "function"
      ) {
        target.scrollIntoView({ block: "nearest" });
      }
    });
  }, []);

  useEffect(() => {
    if (didInitialListFocusRef.current || typeof window === "undefined") return;

    const delays = [0, 80, 180, 320];
    const timers = delays.map((delay) =>
      window.setTimeout(() => {
        if (didInitialListFocusRef.current) return;
        focusProductList(selectedContent);

        const container = listContainerRef.current;
        const active = document.activeElement;
        if (
          container &&
          active &&
          (active === container || container.contains(active))
        ) {
          didInitialListFocusRef.current = true;
        }
      }, delay),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [focusProductList, selectedContent]);

  useEffect(() => {
    function handleEscapeToCloseEditor(event) {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      if (!showDetail || !selectedContent) return;
      if (
        typeof document !== "undefined" &&
        document.querySelector("[data-admin-modal='true']")
      ) {
        return;
      }
      event.preventDefault();
      const closedUri = selectedContent;
      setSelectedCourse("");
      focusProductList(closedUri);
    }

    window.addEventListener("keydown", handleEscapeToCloseEditor);
    return () => window.removeEventListener("keydown", handleEscapeToCloseEditor);
  }, [focusProductList, selectedContent, setSelectedCourse, showDetail]);

  const handleListKeyDown = useCallback(
    (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const container = listContainerRef.current;
      if (!container) return;
      const buttons = Array.from(
        container.querySelectorAll("button[data-product-list-item='true']"),
      );
      if (buttons.length === 0) return;

      event.preventDefault();

      const activeUri = document.activeElement?.dataset?.productUri || "";
      let currentIndex = buttons.findIndex(
        (button) => button.dataset.productUri === activeUri,
      );

      if (currentIndex < 0 && selectedContent) {
        currentIndex = buttons.findIndex(
          (button) => button.dataset.productUri === selectedContent,
        );
      }

      if (currentIndex < 0) {
        currentIndex = event.key === "ArrowDown" ? -1 : buttons.length;
      }

      const step = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.max(
        0,
        Math.min(buttons.length - 1, currentIndex + step),
      );
      const nextButton = buttons[nextIndex];
      const nextUri = nextButton?.dataset?.productUri;
      if (!nextUri) return;

      handleSelection(nextUri);
      window.requestAnimationFrame(() => {
        nextButton.focus();
        nextButton.scrollIntoView({ block: "nearest" });
      });
    },
    [handleSelection, selectedContent],
  );

  function openAssetPicker(index) {
    setAssetPickerProductIndex(index);
    setAssetPickerOpen(true);
  }

  function applyAssetSelection(selection) {
    if (!selection || assetPickerProductIndex < 0) return;
    updateProduct(assetPickerProductIndex, "productMode", "asset");
    updateProduct(assetPickerProductIndex, "assetId", selection.assetId || "");
    updateProduct(assetPickerProductIndex, "fileUrl", selection.url || "");
    updateProduct(assetPickerProductIndex, "mimeType", selection.mimeType || "");
    if ((products?.[assetPickerProductIndex]?.name || "").trim() === "" && selection.title) {
      updateProduct(assetPickerProductIndex, "name", selection.title);
    }
    setAssetPickerOpen(false);
    setAssetPickerProductIndex(-1);
  }

  return (
    <>
    <div
      className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:min-h-[520px]"
    >
      {/* ── Left: content list ── */}
      <div className="border rounded flex flex-col overflow-hidden min-w-0">
        {/* Filter pills */}
        <div className="p-2 border-b bg-gray-50 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {[
              {
                key: "all",
                label: `${t("admin.filterAll", "All")} (${allItemsCount})`,
              },
              needsConfigCount > 0 && {
                key: "needs-config",
                label: `${t("admin.filterNeedsConfig", "Needs config")} (${needsConfigCount})`,
                urgent: true,
              },
              allItemsCount - needsConfigCount > 0 && {
                key: "configured",
                label: `${t("admin.filterConfigured", "Configured")} (${allItemsCount - needsConfigCount})`,
              },
            ]
              .filter(Boolean)
              .map(({ key, label, urgent }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                    typeFilter === key
                      ? urgent
                        ? "admin-pill-attention-active"
                        : "admin-pill-active"
                      : urgent
                        ? "admin-pill-attention"
                        : "admin-pill-subtle"
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              wcProducts.length > 0 && {
                key: "wc",
                label: `WC (${wcProducts.length})`,
              },
              wpCourses.length > 0 && {
                key: "lp",
                label: `LP (${wpCourses.length})`,
              },
              wpEvents.length > 0 && {
                key: "ev",
                label: `Events (${wpEvents.length})`,
              },
              products.length > 0 && {
                key: "shop",
                label: `${t("admin.downloadsLabel", "Downloads")} (${products.length})`,
              },
            ]
              .filter(Boolean)
              .map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                    typeFilter === key
                      ? "admin-pill-active"
                      : "admin-pill-subtle"
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>

        {/* Sortable column header */}
        <div className="flex items-center px-2 py-1 border-b bg-gray-50 text-[10px] font-semibold text-gray-500 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => toggleSort("source")}
            className="w-9 shrink-0 text-left hover:text-gray-800"
          >
            {t("admin.colType", "Type")}
            <SortArrow field="source" />
          </button>
          <button
            type="button"
            onClick={() => toggleSort("name")}
            className="flex-1 text-left hover:text-gray-800"
          >
            {t("admin.colName", "Name")}
            <SortArrow field="name" />
          </button>
          <button
            type="button"
            onClick={() => toggleSort("status")}
            className="w-5 text-right hover:text-gray-800"
            title={t("admin.colStatus", "Status")}
          >
            <SortArrow field="status" />●
          </button>
        </div>

        <div
          ref={listContainerRef}
          className="flex-1 overflow-auto focus:outline-none"
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          aria-label={t("admin.productList", "Product list")}
        >
          {(() => {
            // Build flat list from all sources
            const flat = [
              ...wcProducts.map((p) => ({
                uri: p.uri,
                name: p.name,
                source: "wc",
                active: courses[p.uri]?.active,
                categories: p.categories,
                imageUrl:
                  p?.featuredImage?.node?.sourceUrl ||
                  p?.image?.sourceUrl ||
                  p?.image ||
                  "",
              })),
              ...wpCourses.map((c) => ({
                uri: c.uri,
                name: c.title,
                source: "lp",
                active: courses[c.uri]?.active,
                categories: c.categories,
                imageUrl:
                  c?.featuredImage?.node?.sourceUrl ||
                  c?.image?.sourceUrl ||
                  c?.image ||
                  "",
              })),
              ...wpEvents.map((e) => ({
                uri: e.uri,
                name: e.title,
                source: "ev",
                active: courses[e.uri]?.active,
                categories: e.categories,
                imageUrl:
                  e?.featuredImage?.node?.sourceUrl ||
                  e?.image?.sourceUrl ||
                  e?.image ||
                  "",
              })),
              ...products.map((p, i) => ({
                uri: `__shop_${i}`,
                name: p.name || `Product ${i + 1}`,
                source: "shop",
                active: p.active,
                categories: deriveDigitalProductCategories(p).categories,
                imageUrl: p.imageUrl || "",
                free: p.free,
                priceCents: p.priceCents,
              })),
              ...otherCourseUris.map((uri) => ({
                uri,
                name: uri,
                source: "other",
                active: courses[uri]?.active,
                categories: [],
                imageUrl: "",
              })),
            ];

            // Apply filter
            const filtered = flat.filter((item) =>
              showItem(item.uri, item.source),
            );

            // Sort
            const sorted = [...filtered].sort((a, b) => {
              let va, vb;
              if (sortField === "source") {
                va = a.source;
                vb = b.source;
              } else if (sortField === "status") {
                va = isConfigured(a.uri) ? 1 : 0;
                vb = isConfigured(b.uri) ? 1 : 0;
              } else {
                va = (a.name || "").toLowerCase();
                vb = (b.name || "").toLowerCase();
              }
              if (va < vb) return sortDir === "asc" ? -1 : 1;
              if (va > vb) return sortDir === "asc" ? 1 : -1;
              return 0;
            });

            if (sorted.length === 0)
              return (
                <p className="text-xs text-gray-400 p-4 text-center">
                  {allItemsCount === 0
                    ? "No content found."
                    : "No items match the current filter."}
                </p>
              );

            return sorted.map((item) => {
              const isActive = selectedContent === item.uri;
              const configured = isConfigured(item.uri);
              const configReasons = configured ? [] : configReasonsForUri(item.uri);
              const categoriesPreview = extractCategoryNames(item.categories)
                .slice(0, 2)
                .join(", ");
              const titleText = categoriesPreview
                ? `${item.name || item.uri} · ${categoriesPreview}`
                : item.name || item.uri;
              return (
                <button
                  key={item.uri}
                  type="button"
                  onClick={() => handleSelection(item.uri)}
                  data-product-list-item="true"
                  data-product-uri={item.uri}
                  title={titleText}
                  className={`w-full text-left px-2 py-2.5 flex min-h-[78px] items-center gap-2 border-b last:border-b-0 transition-colors ${
                    isActive
                      ? "bg-blue-700 text-white border-l-2 border-l-blue-300"
                      : "hover:bg-gray-50 border-l-2 border-l-transparent"
                  }`}
                >
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 w-9 text-center ${TYPE_COLOR[item.source]}`}
                  >
                    {TYPE_LABEL[item.source]}
                  </span>
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-gray-300 bg-gray-100">
                    <SafeProductImage
                      src={item.imageUrl}
                      alt={item.name || item.uri}
                      className="h-full w-full object-cover"
                      fallbackClassName="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400"
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`admin-product-title block text-base truncate ${
                        isActive ? "text-white" : "text-gray-800"
                      }`}
                      title={item.name || item.uri}
                    >
                      {item.name}
                    </span>
                    {categoriesPreview && (
                      <span
                        className={`block text-xs truncate ${
                          isActive ? "text-white/75" : "text-gray-400"
                        }`}
                      >
                        {categoriesPreview}
                      </span>
                    )}
                  </div>
                  {item.active === false && (
                    <span
                      className={`text-[9px] px-1 rounded shrink-0 ${
                        isActive
                          ? "bg-red-200 text-red-800"
                          : "bg-red-50 text-red-500"
                      }`}
                    >
                      Off
                    </span>
                  )}
                  {!item.free && item.priceCents === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">
                      {t("admin.productPriceAmbiguous")}
                    </span>
                  )}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      configured
                        ? isActive
                          ? "bg-white"
                          : "bg-slate-500"
                        : isActive
                          ? "bg-amber-200"
                          : "bg-amber-300"
                    }`}
                    title={
                      configured
                        ? t("admin.configuredBadge")
                        : `${t("admin.filterNeedsConfig", "Needs config")}: ${configReasons[0] || ""}`
                    }
                  />
                </button>
              );
            });
          })()}
        </div>

        {/* Manual entry */}
        <div className="border-t p-2 bg-gray-50">
          <button
            type="button"
            onClick={() => {
              setSelectedCourse("__custom__");
              setManualUriInput("");
            }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            + Enter URI manually
          </button>
          {selectedContent === "__custom__" && (
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                value={manualUriInput}
                onChange={(e) => setManualUriInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  applyManualUri();
                }}
                placeholder={t("admin.courseUriInputPlaceholder")}
                className="w-full border rounded px-2 py-1.5 text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={applyManualUri}
                className="px-2 py-1.5 text-[11px] rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {t("common.use", "Use")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      <div ref={editFormRef} className="border rounded overflow-auto min-w-0">
        {showDetail ? (
          <div className="p-5 space-y-5">
            {selectedConfigReasons.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">
                  {t("admin.filterNeedsConfig", "Needs config")}
                </p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {selectedConfigReasons.map((reason, idx) => (
                    <li key={`${selectedContent}-config-${idx}`}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* WP item info card */}
            {isWpSelection &&
              (() => {
                const wpItem = allWpContent.find(
                  (item) => item.uri === selectedContent,
                );
                if (!wpItem) return null;
                const imgUrl = wpItem?.featuredImage?.node?.sourceUrl;
                const rawPrice = wpItem?.price || wpItem?.priceRendered || "";
                const wpPrice = (typeof rawPrice === "string" ? rawPrice : String(rawPrice)).replace(/&nbsp;/g, " ");
                const wpParsedCents = parsePriceCents(wpPrice);
                const wpCategories = extractCategoryNames(wpItem?.categories);
                const sourceLabel =
                  wpItem?._source === "woocommerce"
                    ? "WooCommerce"
                    : wpItem?._source === "learnpress"
                      ? "LearnPress"
                      : wpItem?._source === "wordpress"
                        ? "Event"
                        : "Manual";
                const sourceColor =
                  wpItem?._source === "woocommerce"
                    ? "bg-blue-100 text-blue-800"
                    : wpItem?._source === "learnpress"
                      ? "bg-slate-100 text-slate-800"
                      : "bg-amber-100 text-amber-800";

                return (
                  <div>
                    {/* Item header */}
                    <div className="flex gap-4 mb-4">
                    <ImagePickerButton
                      imgUrl={imgUrl}
                      sizeClass="h-56 w-56"
                      uploadBackend="wordpress"
                      uploadOptions={imageUploadOptions}
                      onUploaded={(url) => {
                          const upd = (setter) =>
                            setter((prev) =>
                              prev.map((x) =>
                                x.uri === selectedContent
                                  ? {
                                      ...x,
                                      featuredImage: {
                                        node: { sourceUrl: url },
                                      },
                                    }
                                  : x,
                              ),
                            );
                          upd(setWpEvents);
                          upd(setWcProducts);
                          upd(setWpCourses);
                        }}
                        onError={setError}
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <h3 className="admin-product-title text-base font-bold break-words">
                          {wpItem?.title || wpItem?.name || selectedContent}
                        </h3>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded ${sourceColor}`}
                          >
                            {sourceLabel}
                          </span>
                          {wpPrice && (
                            <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                              WP: {wpPrice}
                            </span>
                          )}
                          {(courses[selectedContent] || wpParsedCents > 0) && (
                            <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                              {t("admin.configuredBadge")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {selectedContent}
                        </p>
                        {wpCategories.length > 0 && (
                          <p className="text-xs text-gray-500 truncate">
                            {t("admin.categoryLabel")}: {wpCategories.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* "Not buyable" warning */}
                    {(() => {
                      const cfg = courses[selectedContent];
                      const hasPriceCents =
                        cfg &&
                        typeof cfg.priceCents === "number" &&
                        cfg.priceCents > 0;
                      if (hasPriceCents || wpParsedCents > 0) return null;
                      return (
                        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 mb-4">
                          <div className="flex items-start gap-2">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="w-4 h-4 shrink-0 mt-0.5"
                            >
                              <path
                                fillRule="evenodd"
                                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <div>
                              <p className="font-semibold text-xs">
                                {t("admin.notBuyableTitle")}
                              </p>
                              <p className="text-xs mt-0.5 text-amber-700">
                                {t("admin.notBuyableHint")}
                              </p>
                            </div>
                          </div>
                          {wpPrice && wpParsedCents > 0 && (
                            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-amber-200">
                              <span className="text-xs">
                                WP price: <strong>{wpPrice}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPrice((wpParsedCents / 100).toFixed(2));
                                  setAutoSaveTrigger((n) => n + 1);
                                }}
                                className="px-2 py-0.5 rounded border border-amber-400 bg-white text-amber-800 text-xs hover:bg-amber-100"
                              >
                                {t("admin.notBuyableUseWpPrice")}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <hr />
                  </div>
                );
              })()}

            {/* Shop product full details (merged from Digital Downloads tab) */}
            {isShopSelection && selectedShopProduct && (
              <div className="mb-4 space-y-4 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ImagePickerButton
                      imgUrl={selectedShopProduct.imageUrl}
                      sizeClass="h-56 w-56"
                      uploadBackend="wordpress"
                      uploadOptions={imageUploadOptions}
                      onUploaded={(url) => updateProduct(shopIndex, "imageUrl", url)}
                      onError={setError}
                    />
                    <div className="min-w-0">
                      <p className="admin-product-title font-sans text-base font-semibold text-amber-700 break-words">
                        {selectedShopProduct.name || `Product ${shopIndex + 1}`}
                      </p>
                      {selectedShopCategories.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {selectedShopCategories.map((category) => (
                            <span
                              key={`${selectedShopProduct.id || shopIndex}-${category}`}
                              className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-sans text-slate-700"
                            >
                              {category}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeShopProduct(shopIndex)}
                    className="shrink-0 rounded border border-slate-300 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
                    aria-label={t("common.remove")}
                    title={t("common.remove")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.75 2.5a1.75 1.75 0 00-1.75 1.75v.25H4.75a.75.75 0 000 1.5h.37l.69 9.11A2 2 0 007.8 17h4.4a2 2 0 001.99-1.89l.69-9.11h.37a.75.75 0 000-1.5H13v-.25A1.75 1.75 0 0011.25 2.5h-2.5zm3 2v-.25a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25v.25h3zM8 8a.75.75 0 011.5 0v5a.75.75 0 01-1.5 0V8zm3.5-.75a.75.75 0 00-.75.75v5a.75.75 0 001.5 0V8a.75.75 0 00-.75-.75z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={selectedShopProduct.name}
                      onChange={(e) =>
                        updateProduct(shopIndex, "name", e.target.value)
                      }
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Slug
                    </label>
                    {(() => {
                      const wpType = allWpContent.find((item) => item.uri === selectedShopProduct.contentUri)?._type ?? null;
                      const prefix = resolveSlugPrefix(selectedShopMode, wpType);
                      const base = prefix && selectedShopProduct.slug.startsWith(prefix)
                        ? selectedShopProduct.slug.slice(prefix.length)
                        : selectedShopProduct.slug;
                      return (
                        <div className="flex items-center border rounded overflow-hidden text-sm">
                          {prefix && (
                            <span className="px-2 py-2 bg-gray-100 text-gray-500 border-r shrink-0 select-none font-mono text-xs">
                              {prefix}
                            </span>
                          )}
                          <input
                            type="text"
                            value={base}
                            onChange={(e) => updateProduct(shopIndex, "slug", e.target.value)}
                            className="flex-1 px-3 py-2 min-w-0"
                          />
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Type
                    </label>
                    <select
                      value={selectedShopProduct.type}
                      onChange={(e) =>
                        updateProduct(shopIndex, "type", e.target.value)
                      }
                      className="w-full border rounded px-3 py-2 text-sm"
                    >
                      <option value="digital_file">{t("admin.digitalFile")}</option>
                      <option value="course">{t("admin.courseProduct")}</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-5 pb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedShopProduct.active !== false}
                        onChange={(e) =>
                          updateProduct(shopIndex, "active", e.target.checked)
                        }
                        className="accent-slate-600"
                      />
                      <span className="text-gray-700">
                        {t("admin.activeProduct")}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedShopProduct.free === true}
                        onChange={(e) => {
                          const val = e.target.checked;
                          updateProduct(shopIndex, "free", val);
                          setPrice(val ? "0" : "");
                        }}
                        className="accent-slate-600"
                      />
                      <span className="text-gray-700">
                        {t("admin.productFree")}
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Description
                  </label>
                  <textarea
                    rows="3"
                    value={selectedShopProduct.description}
                    onChange={(e) =>
                      updateProduct(shopIndex, "description", e.target.value)
                    }
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowImageGen((v) => !v)}
                    className="mt-1 text-xs px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    {t("admin.generateImages")}
                  </button>
                  {showImageGen && (
                    <div className="mt-2">
                      <ImageGenerationPanel
                        description={
                          selectedShopProduct.description ||
                          selectedShopProduct.name ||
                          ""
                        }
                        onSave={(url) => updateProduct(shopIndex, "imageUrl", url)}
                        context="editor"
                        uploadBackend={uploadBackend}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {selectedShopProduct.type === "digital_file"
                      ? "File"
                      : "Course URI"}
                  </p>
                  {selectedShopProduct.type === "digital_file" ? (
                    <>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            {t("admin.productSourceLabel", "Delivery source")}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              updateProduct(shopIndex, "productMode", "asset");
                              updateProduct(shopIndex, "contentUri", "");
                              updateProduct(shopIndex, "fileUrl", "");
                            }}
                            className={`rounded-full border px-2.5 py-1 text-[11px] ${
                              selectedShopMode === "asset"
                                ? "admin-pill-active"
                                : "admin-pill-subtle"
                            }`}
                          >
                            {t("admin.productSourceAsset", "Asset")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateProduct(shopIndex, "productMode", "digital_file");
                              updateProduct(shopIndex, "contentUri", "");
                              updateProduct(shopIndex, "assetId", "");
                            }}
                            className={`rounded-full border px-2.5 py-1 text-[11px] ${
                              selectedShopMode === "digital_file"
                                ? "admin-pill-active"
                                : "admin-pill-subtle"
                            }`}
                          >
                            {t("admin.productSourceDirectUrl", "Direct URL")}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openAssetPicker(shopIndex)}
                            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            {selectedShopProduct.assetId
                              ? t("admin.productAssetChange", "Change asset")
                              : t("admin.productAssetChoose", "Choose asset")}
                          </button>
                          <button
                            type="button"
                            onClick={() => uploadFile(shopIndex, "fileUrl")}
                            disabled={!!uploadingField}
                            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {uploadingField === "fileUrl"
                              ? t("common.loading")
                              : t("admin.uploadFile")}
                          </button>
                        </div>

                        {selectedShopProduct.assetId ? (
                          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-2">
                            <p>
                              <span className="font-semibold">
                                {t("admin.productAssetId", "Asset ID")}:
                              </span>{" "}
                              <span className="font-mono">{selectedShopProduct.assetId}</span>
                            </p>
                            {selectedShopProduct.fileUrl && (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold shrink-0">
                                  {t("admin.fileUrl", "File URL")}:
                                </span>
                                <span className="font-mono tracking-widest text-slate-400 select-none">
                                  {"•".repeat(12)}
                                </span>
                                <button
                                  type="button"
                                  title={t("common.copy", "Copy")}
                                  onClick={() =>
                                    navigator.clipboard?.writeText(selectedShopProduct.fileUrl)
                                  }
                                  className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                  </svg>
                                </button>
                                <a
                                  href={selectedShopProduct.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={t("common.openInNewTab", "Open in new tab")}
                                  className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/>
                                    <line x1="10" y1="14" x2="21" y2="3"/>
                                  </svg>
                                </a>
                              </div>
                            )}
                          </div>
                        ) : selectedShopMode === "asset" ? (
                          <p className="text-[11px] text-amber-700">
                            {t(
                              "admin.productAssetRequired",
                              "Asset mode requires an asset selection.",
                            )}
                          </p>
                        ) : null}

                        {selectedShopMode === "digital_file" && (
                          <>
                            <input
                              type="text"
                              value={selectedShopProduct.fileUrl}
                              onChange={(e) =>
                                updateProduct(shopIndex, "fileUrl", e.target.value)
                              }
                              placeholder={t("admin.fileUrlPlaceholder")}
                              className="w-full border rounded px-3 py-2 text-sm"
                            />
                            <p className="text-[11px] text-slate-500">
                              {t(
                                "admin.productUrlValidateOnSave",
                                "This URL is validated with a HEAD check before save.",
                              )}
                            </p>
                          </>
                        )}
                      </div>
                      {!selectedShopProduct.assetId && (
                        <>
                          <p className="text-[11px] text-gray-500">
                            Backend:{" "}
                            <strong className="text-gray-700">
                              {uploadBackend === "wordpress"
                                ? "WordPress Media"
                                : uploadBackend === "r2"
                                  ? "Cloudflare R2"
                                  : "S3/Spaces"}
                            </strong>
                            .{" "}
                            {runtime === "edge"
                              ? t(
                                  "admin.uploadEdgeLimit",
                                  "Single PUT ≤100 MB, multipart for larger.",
                                )
                              : t(
                                  "admin.uploadNodeLimit",
                                  "Multipart upload for large files.",
                              )}
                          </p>
                          <CyberduckBookmarkPanel
                            uploadBackend={uploadBackend}
                            uploadInfo={uploadInfo}
                            uploadInfoDetails={uploadInfoDetails}
                            className="mt-2"
                          />
                        </>
                      )}
                    </>
                  ) : (
                    <input
                      type="text"
                      value={selectedShopProduct.contentUri}
                      onChange={(e) =>
                        updateProduct(shopIndex, "contentUri", e.target.value)
                      }
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  )}
                </div>
              </div>
            )}

            {!isShopSelection && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedContentActive !== false}
                  onChange={(e) => setSelectedCourseActive(e.target.checked)}
                  className="accent-slate-600"
                />
                <span>{t("admin.activeProduct", "Active product")}</span>
              </label>
            )}

            <PriceAccessForm
              price={price}
              setPrice={setPrice}
              free={selectedShopProduct?.free ?? false}
              setFree={(val) => updateProduct(shopIndex, "free", val)}
              currency={currency}
              setCurrency={setCurrency}
              vatPercent={vatPercent}
              setVatPercent={setVatPercent}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              users={users}
              allowedUsers={allowedUsers}
              filteredUsers={filteredUsers}
              toggleUser={toggleUser}
              manualEmail={manualEmail}
              setManualEmail={setManualEmail}
              addManualEmail={addManualEmail}
              saveUnified={saveUnified}
              loading={loading}
              autoSaveTrigger={autoSaveTrigger}
            />

            <div className="admin-vat-panel rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="admin-product-title text-sm font-semibold text-slate-900">
                    {t("admin.vatMapTitle")}
                  </p>
                  <p className="admin-soft-yellow text-xs text-slate-700/90 mt-1">
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
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedCategories.map((category) => {
                    const slug = slugFromCategoryName(category);
                    const mappedVat = slug ? vatDraft?.[slug] : undefined;
                    return (
                      <span
                        key={`${category}-${slug}`}
                        className="admin-vat-surface inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-800"
                        title={slug ? `${category} (${slug})` : category}
                      >
                        <span className="font-medium">{category}</span>
                        <span className="text-slate-500">
                          {Number.isFinite(mappedVat)
                            ? `${mappedVat}%`
                            : t("admin.vatNotSet")}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_92px_52px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-1">
                  <span>{t("admin.categoryLabel")}</span>
                  <span>{t("admin.vatPercent")}</span>
                  <span>{t("admin.actionsLabel")}</span>
                </div>
                <div className="space-y-1 max-h-44 overflow-auto pr-1">
                  {vatRows.length === 0 ? (
                    <p className="text-xs text-gray-500 px-1 py-2">
                      {t("admin.vatMapEmpty")}
                    </p>
                  ) : (
                    vatRows.map((row) => (
                      <div
                        key={row.slug}
                        className="admin-vat-surface grid grid-cols-[minmax(0,1fr)_92px_52px] gap-2 items-center rounded-lg border border-slate-100 bg-white px-2 py-1.5"
                      >
                        <span className="text-sm text-gray-700 truncate" title={row.slug}>
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
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-300 p-8">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-10 h-10"
            >
              <path
                fillRule="evenodd"
                d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-gray-500 admin-soft-yellow">
              {t("admin.selectItemToConfigureAccess")}
            </p>
          </div>
        )}
      </div>
    </div>
    <AssetPickerModal
      open={assetPickerOpen}
      onClose={() => {
        setAssetPickerOpen(false);
        setAssetPickerProductIndex(-1);
      }}
      onSelect={applyAssetSelection}
    />
    </>
  );
}

// ── Tab: Settings ─────────────────────────────────────────────────────────────

function SettingsTab({
  shopVisibleTypes,
  toggleShopType,
  shopSettingsSaving,
}) {
  const types = [
    {
      key: "product",
      label: "WooCommerce",
      desc: t("admin.shopTypeProductDesc"),
    },
    { key: "course", label: "LearnPress", desc: t("admin.shopTypeCourseDesc") },
    { key: "event", label: "Events", desc: t("admin.shopTypeEventDesc") },
    {
      key: "digital_file",
      label: t("admin.digitalFile"),
      desc: t("admin.shopTypeDigitalFileDesc"),
    },
    {
      key: "digital_course",
      label: t("admin.courseProduct"),
      desc: t("admin.shopTypeDigitalCourseDesc"),
    },
  ];
  return (
    <div className="max-w-lg space-y-4">
      <div>
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <span>{t("admin.shopVisibility")}</span>
          <AdminFieldHelpLink slug="product-value" />
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {t("admin.shopVisibilityDesc")}
        </p>
      </div>
      <div className="border rounded overflow-hidden divide-y">
        {types.map(({ key, label, desc }) => (
          <label
            key={key}
            className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
              shopVisibleTypes.includes(key)
                ? "bg-slate-100 border-l-4 border-l-slate-500"
                : "bg-white border-l-4 border-l-transparent hover:bg-gray-50"
            }`}
          >
            <input
              type="checkbox"
              checked={shopVisibleTypes.includes(key)}
              onChange={() => toggleShopType(key)}
              disabled={shopSettingsSaving}
              className="mt-0.5 accent-slate-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
          </label>
        ))}
      </div>
      {shopSettingsSaving && (
        <p className="text-xs text-slate-600">
          {t("common.saving", "Sparar…")}
        </p>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AdminProductsTab(props) {
  const [innerTab, setInnerTab] = useState("access");

  const {
    shopVisibleTypes,
    toggleShopType,
    shopVatByCategory,
    updateShopVatByCategory,
    shopSettingsSaving,
    wcProducts,
    wpCourses,
    wpEvents,
    products,
    courses,
    otherCourseUris,
    allWpContent,
    selectedContent,
    setSelectedCourse,
    handleSelection,
    isWpSelection,
    isShopSelection,
    selectedShopProduct,
    shopIndex,
    showDetail,
    editFormRef,
    updateProduct,
    removeShopProduct,
    uploadFile,
    uploadingField,
    uploadBackend,
    uploadInfo,
    uploadInfoDetails,
    runtime,
    showImageGen,
    setShowImageGen,
    setWpEvents,
    setWcProducts,
    setWpCourses,
    setError,
    price,
    setPrice,
    currency,
    setCurrency,
    vatPercent,
    setVatPercent,
    userSearch,
    setUserSearch,
    users,
    selectedContentActive,
    setSelectedCourseActive,
    allowedUsers,
    filteredUsers,
    toggleUser,
    manualEmail,
    setManualEmail,
    addManualEmail,
    saveUnified,
    loading,
    storage,
  } = props;

  return (
    <div className="border rounded p-4 sm:p-5 space-y-4 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-2xl font-semibold">
            <span>{t("admin.contentAccess")}</span>
            <AdminFieldHelpLink slug="product-value" className="h-5 w-5 text-xs" />
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("admin.contentAccessDesc")}
          </p>
        </div>
        <AdminDocsContextLinks tab="products" compact />
      </div>

      <InnerTabs active={innerTab} onChange={setInnerTab} />

      {innerTab === "access" && (
        <>
          <AccessTab
            wcProducts={wcProducts}
            wpCourses={wpCourses}
            wpEvents={wpEvents}
            products={products}
            otherCourseUris={otherCourseUris}
            selectedContent={selectedContent}
            handleSelection={handleSelection}
            setSelectedCourse={setSelectedCourse}
            courses={courses}
            allWpContent={allWpContent}
            isWpSelection={isWpSelection}
            isShopSelection={isShopSelection}
            selectedShopProduct={selectedShopProduct}
            shopIndex={shopIndex}
            showDetail={showDetail}
            updateProduct={updateProduct}
            removeShopProduct={removeShopProduct}
            uploadFile={uploadFile}
            uploadingField={uploadingField}
            uploadBackend={uploadBackend}
            uploadInfo={uploadInfo}
            uploadInfoDetails={uploadInfoDetails}
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
            selectedContentActive={selectedContentActive}
            setSelectedCourseActive={setSelectedCourseActive}
            allowedUsers={allowedUsers}
            filteredUsers={filteredUsers}
            toggleUser={toggleUser}
            manualEmail={manualEmail}
            setManualEmail={setManualEmail}
            addManualEmail={addManualEmail}
            saveUnified={saveUnified}
            shopVatByCategory={shopVatByCategory}
            updateShopVatByCategory={updateShopVatByCategory}
            shopSettingsSaving={shopSettingsSaving}
            loading={loading}
            editFormRef={editFormRef}
          />

          {/* User access overview — reverse view */}
          <div className="border rounded p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {t("admin.userAccessOverview")}
            </h3>
            <p className="text-xs text-gray-500">
              {t("admin.userAccessOverviewDesc")}
            </p>
            <UserAccessPanel
              users={users}
              courses={courses}
              allWpContent={allWpContent}
              products={products}
              storage={storage}
            />
          </div>
        </>
      )}

      {innerTab === "settings" && (
        <SettingsTab
          shopVisibleTypes={shopVisibleTypes}
          toggleShopType={toggleShopType}
          shopSettingsSaving={shopSettingsSaving}
        />
      )}
    </div>
  );
}
