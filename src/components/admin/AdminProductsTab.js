"use client";

import { useEffect, useMemo, useState } from "react";
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

function toCurrencyUnits(cents) {
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : "0.00";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)} ${units[index]}`;
}

function formatIsoDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch (_err) {
    return iso;
  }
}

function slugFromCategoryName(name) {
  return toCategorySlugs([name])[0] || "";
}

function parseVatPercent(value) {
  const numeric = Number.parseFloat(String(value || "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
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
    { key: "access", label: t("admin.productsTabAll", "All products") },
    { key: "settings", label: t("admin.visibleTypesTab", "Visible types") },
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
              ? "bg-white text-purple-800 shadow-sm"
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
}) {
  return (
    <ImageUploader
      value={imgUrl || ""}
      onUploaded={onUploaded}
      onError={onError}
      uploadBackend={uploadBackend}
      renderTrigger={(openPicker) => (
        <button
          type="button"
          onClick={openPicker}
          className="group relative z-10 pointer-events-auto flex h-28 w-28 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-gray-700 bg-gradient-to-br from-gray-100 to-gray-200 shadow-[inset_0_0_0_2px_rgba(17,24,39,0.35),0_1px_2px_rgba(0,0,0,0.18)] transition-colors hover:border-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
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

function PriceAccessForm({
  price,
  setPrice,
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
  const freeAccessEnabled = Number.isFinite(parsedPrice) && parsedPrice === 0;

  useEffect(() => {
    if (autoSaveTrigger) saveUnified();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveTrigger]);

  return (
    <div className="space-y-5">
      {/* Price row */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700">
          {t("admin.courseFee")} <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500">{t("admin.feeHint")}</p>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={freeAccessEnabled}
            onChange={(e) => {
              if (e.target.checked) {
                setPrice("0");
                return;
              }
              setPrice("");
            }}
            className="accent-purple-600"
          />
          <span>{t("admin.freeAccess")}</span>
        </label>
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
        <label className="text-sm font-semibold text-gray-700">
          {t("admin.vatOverrideLabel")}
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
        <label className="text-sm font-semibold text-gray-700">
          {t("admin.allowedUsers")}
        </label>
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
                    className="accent-purple-600"
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
                      className="accent-purple-600"
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
        className="w-full py-2 rounded bg-purple-700 text-white text-sm font-medium hover:bg-purple-800 disabled:opacity-50 transition-colors"
      >
        {loading ? t("admin.saving") : t("common.save", "Save")}
      </button>
    </div>
  );
}

// ── Tab: Shop Products ────────────────────────────────────────────────────────

function ProductsTab({
  products,
  selectedCourse,
  isShopSelection,
  selectedShopProduct,
  shopIndex,
  handleSelection,
  updateProduct,
  removeShopProduct,
  uploadFile,
  uploadingField,
  uploadBackend,
  runtime,
  showImageGen,
  setShowImageGen,
  setError,
  // price & access (for shop product pricing)
  price,
  setPrice,
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
  editFormRef,
}) {
  const [bucketObjects, setBucketObjects] = useState([]);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [bucketError, setBucketError] = useState("");
  const [bucketRefresh, setBucketRefresh] = useState(0);
  const supportsBucketListing = uploadBackend !== "wordpress";

  useEffect(() => {
    if (!supportsBucketListing) {
      setBucketObjects([]);
      setBucketError("");
      setBucketLoading(false);
      return undefined;
    }
    let cancelled = false;
    async function fetchObjects() {
      setBucketLoading(true);
      setBucketError("");
      try {
        const res = await fetch("/api/admin/storage-objects?limit=25");
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to list bucket objects");
        }
        setBucketObjects(json.objects || []);
      } catch (error) {
        if (!cancelled) {
          setBucketError(error.message || "Failed to list bucket objects");
        }
      } finally {
        if (!cancelled) {
          setBucketLoading(false);
        }
      }
    }
    fetchObjects();
    return () => {
      cancelled = true;
    };
  }, [supportsBucketListing, bucketRefresh]);

  const handleCopyUrl = (url) => {
    if (!url || typeof navigator === "undefined") return;
    navigator.clipboard?.writeText(url).catch(() => {});
  };

  const handleUseUrl = (url) => {
    if (!url) return;
    updateProduct(shopIndex, "fileUrl", url);
  };
  return (
    <div
      className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:min-h-[520px]"
    >
      {/* ── Left: product list ── */}
      <div className="border rounded flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b shrink-0">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {products.length} product{products.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => handleSelection("__new__")}
            className="text-xs font-medium text-purple-700 hover:underline"
          >
            + Add
          </button>
        </div>
        <div className="flex-1 overflow-auto divide-y">
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                </svg>
              </div>
              <p className="text-xs text-gray-400">No shop products yet.</p>
              <button
                type="button"
                onClick={() => handleSelection("__new__")}
                className="text-xs px-3 py-1.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                Add first product
              </button>
            </div>
          ) : (
            products.map((product, index) => {
              const isActive = selectedCourse === `__shop_${index}`;
              const productName = product.name || `Product ${index + 1}`;
              const priceText = product.priceCents
                ? `${toCurrencyUnits(product.priceCents)} ${product.currency || "SEK"}`
                : "no price set";
              return (
                <button
                  key={`shop-${index}`}
                  type="button"
                  onClick={() => handleSelection(`__shop_${index}`)}
                  title={productName}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white border-l-2 border-slate-300"
                      : "hover:bg-gray-50 border-l-2 border-transparent"
                  }`}
                >
                  {product.imageUrl ? (
                    <SafeProductImage
                      src={product.imageUrl}
                      alt=""
                      className="w-9 h-9 rounded object-cover shrink-0"
                      fallbackClassName="w-9 h-9 rounded bg-rose-50 shrink-0 flex items-center justify-center text-rose-400"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded border border-gray-700 bg-amber-100 shrink-0 flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 text-amber-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L2.5 11.06zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`admin-product-title text-sm font-medium truncate ${
                        isActive ? "text-white" : "text-gray-800"
                      }`}
                      title={productName}
                    >
                      {productName}
                    </p>
                    <p
                      className={`text-xs truncate ${
                        isActive ? "text-white/80" : "text-gray-400"
                      }`}
                      title={priceText}
                    >
                      {priceText}
                    </p>
                  </div>
                  {product.active === false && (
                    <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded shrink-0">
                      Off
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: edit form ── */}
      <div ref={editFormRef} className="border rounded overflow-auto min-w-0">
        {isShopSelection && selectedShopProduct ? (
          <div className="p-5 space-y-5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <ImagePickerButton
                  imgUrl={selectedShopProduct.imageUrl}
                  uploadBackend={uploadBackend}
                  onUploaded={(url) =>
                    updateProduct(shopIndex, "imageUrl", url)
                  }
                  onError={setError}
                />
                <div className="space-y-1">
                  <h3 className="admin-product-title text-lg font-bold break-words">
                    {selectedShopProduct.name || `Product ${shopIndex + 1}`}
                  </h3>
                  <span className="inline-block bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs">
                    {t("admin.shopProducts")}
                  </span>
                  {selectedShopProduct.slug && (
                    <p className="text-xs text-gray-400">
                      /shop/{selectedShopProduct.slug}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeShopProduct(shopIndex)}
                className="text-xs text-red-600 hover:underline shrink-0 mt-1"
              >
                {t("common.remove")}
              </button>
            </div>

            <hr />

            {/* Details grid */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Details
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={t("admin.namePlaceholder")}
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
                  <input
                    type="text"
                    placeholder={t("admin.slugPlaceholder")}
                    value={selectedShopProduct.slug}
                    onChange={(e) =>
                      updateProduct(shopIndex, "slug", e.target.value)
                    }
                    className="w-full border rounded px-3 py-2 text-sm"
                    title={t("admin.slugHint")}
                  />
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
                    <option value="digital_file">
                      {t("admin.digitalFile")}
                    </option>
                    <option value="course">{t("admin.courseProduct")}</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={selectedShopProduct.active !== false}
                      onChange={(e) =>
                        updateProduct(shopIndex, "active", e.target.checked)
                      }
                      className="accent-purple-600"
                    />
                    <span className="text-gray-700">
                      {t("admin.activeProduct")}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Description
              </label>
              <textarea
                rows="3"
                placeholder={t("admin.descriptionPlaceholder")}
                value={selectedShopProduct.description}
                onChange={(e) =>
                  updateProduct(shopIndex, "description", e.target.value)
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowImageGen((v) => !v)}
                className="mt-1 text-xs px-2.5 py-1 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
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

            <hr />

            {/* File / course URI */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                {selectedShopProduct.type === "digital_file"
                  ? "File"
                  : "Course URI"}
              </p>
              {selectedShopProduct.type === "digital_file" ? (
                <>
                  <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t("admin.fileUrlPlaceholder")}
                      value={selectedShopProduct.fileUrl}
                      onChange={(e) =>
                        updateProduct(shopIndex, "fileUrl", e.target.value)
                      }
                      className="flex-1 border rounded px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => uploadFile(shopIndex, "fileUrl")}
                      disabled={!!uploadingField}
                      className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap disabled:opacity-50"
                    >
                      {uploadingField === "fileUrl"
                        ? t("common.loading")
                        : t("admin.uploadFile")}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {t("admin.fileUrlHint")}
                  </p>
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
                  </div>
                  {supportsBucketListing && (
                  <div className="mt-4 border rounded-lg bg-white/90 p-3 space-y-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {t("admin.bucketContents")}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {t("admin.bucketContentsHint")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBucketRefresh((prev) => prev + 1)}
                        disabled={bucketLoading}
                        className="text-xs font-medium text-purple-700 hover:underline disabled:text-gray-400"
                      >
                        {bucketLoading
                          ? t("common.loading")
                          : t("admin.bucketRefresh")}
                      </button>
                    </div>
                    {bucketLoading ? (
                      <p className="text-xs text-gray-500">{t("common.loading")}</p>
                    ) : bucketError ? (
                      <p className="text-xs text-red-500">
                        {t("admin.bucketListError", { error: bucketError })}
                      </p>
                    ) : bucketObjects.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        {t("admin.bucketListEmpty")}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-auto">
                        {bucketObjects.map((obj, idx) => {
                          const title = obj.key || `object-${idx}`;
                          const hasUrl = Boolean(obj.url);
                          return (
                            <div
                              key={title}
                              className="border rounded-lg bg-gray-50 p-3 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {title}
                                </p>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyUrl(obj.url)}
                                    disabled={!hasUrl}
                                    className="px-2 py-0.5 rounded text-[11px] text-purple-600 border border-purple-200 hover:bg-purple-50 disabled:text-gray-400 disabled:border-gray-200"
                                  >
                                    {t("admin.bucketCopyUrl")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUseUrl(obj.url)}
                                    disabled={!hasUrl}
                                    className="px-2 py-0.5 rounded text-[11px] bg-purple-700 text-white hover:bg-purple-800 disabled:bg-gray-200"
                                  >
                                    {t("admin.bucketUseUrl")}
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
                                <span>
                                  {t("admin.bucketLastModified")} {formatIsoDate(obj.lastModified)}
                                </span>
                                <span>
                                  {t("admin.bucketSize")} {formatBytes(obj.size)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                </>
              ) : (
                <div>
                  <input
                    type="text"
                    placeholder={t("admin.courseUriPlaceholder")}
                    value={selectedShopProduct.courseUri}
                    onChange={(e) =>
                      updateProduct(shopIndex, "courseUri", e.target.value)
                    }
                    className="w-full border rounded px-3 py-2 text-sm"
                    title={t("admin.courseUriHint")}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t("admin.courseUriHint")}
                  </p>
                </div>
              )}
            </div>

            <hr />

            {/* Price & access (for shop products, here for convenience) */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Pricing & Access
              </p>
              <PriceAccessForm
                price={price}
                setPrice={setPrice}
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
              />
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
              <path d="M2.25 2.25a.75.75 0 000 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 00-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 000-1.5H5.378A2.25 2.25 0 017.5 15h11.218a.75.75 0 00.674-.421 60.358 60.358 0 002.96-7.228.75.75 0 00-.525-.965A60.864 60.864 0 005.68 4.509l-.232-.867A1.875 1.875 0 003.636 2.25H2.25zM3.75 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM16.5 20.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
            </svg>
            <p className="text-sm">Select a product to edit</p>
            <button
              type="button"
              onClick={() => handleSelection("__new__")}
              className="mt-2 text-xs px-3 py-1.5 rounded border border-purple-300 text-purple-600 hover:bg-purple-50"
            >
              + Add new product
            </button>
          </div>
        )}
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
  selectedCourse,
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
  selectedCourseActive,
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
  shopSettingsMessage,
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

  const TYPE_LABEL = { wc: "WC", lp: "LP", ev: "EV", shop: "SH", other: "URI" };
  const TYPE_COLOR = {
    wc: "bg-blue-100 text-blue-800",
    lp: "bg-indigo-100 text-indigo-800",
    ev: "bg-amber-100 text-amber-800",
    shop: "bg-green-100 text-green-800",
    other: "bg-gray-100 text-gray-600",
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

  // "Needs config" = no local config and no usable WordPress/shop price
  const isConfigured = (uri) => {
    if (uri.startsWith("__shop_")) {
      const idx = Number.parseInt(uri.replace("__shop_", ""), 10);
      const p = Number.isFinite(idx) ? products[idx] : null;
      return Boolean(p && Number(p.priceCents) > 0);
    }
    const cfg = courses[uri];
    if (cfg && typeof cfg.priceCents === "number" && cfg.priceCents > 0) {
      return true;
    }
    return wpPriceForUri(uri) > 0;
  };
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
    ? allWpContent.find((item) => item.uri === selectedCourse)
    : null;
  const selectedShopCategories =
    isShopSelection && selectedShopProduct
      ? deriveDigitalProductCategories(selectedShopProduct).categories
      : [];
  const selectedCategories = extractCategoryNames(
    selectedWpItem?.categories,
    selectedShopCategories,
  );

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
      setError(t("admin.vatInvalidRate"));
      return;
    }
    setVatDraft((prev) => ({ ...prev, [slug]: parsed }));
    setVatCategoryDraft("");
    setVatRateDraft("");
  }

  return (
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
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-purple-600 text-white border-purple-600"
                      : urgent
                        ? "text-amber-600 border-amber-300 hover:border-amber-500"
                        : "text-gray-500 border-gray-300 hover:border-purple-400"
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
                label: `Shop (${products.length})`,
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
                      ? "bg-purple-600 text-white border-purple-600"
                      : "text-gray-500 border-gray-300 hover:border-purple-400"
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

        <div className="flex-1 overflow-auto">
          {(() => {
            // Build flat list from all sources
            const flat = [
              ...wcProducts.map((p) => ({
                uri: p.uri,
                name: p.name,
                source: "wc",
                active: courses[p.uri]?.active,
                categories: p.categories,
              })),
              ...wpCourses.map((c) => ({
                uri: c.uri,
                name: c.title,
                source: "lp",
                active: courses[c.uri]?.active,
                categories: c.categories,
              })),
              ...wpEvents.map((e) => ({
                uri: e.uri,
                name: e.title,
                source: "ev",
                active: courses[e.uri]?.active,
                categories: e.categories,
              })),
              ...products.map((p, i) => ({
                uri: `__shop_${i}`,
                name: p.name || `Product ${i + 1}`,
                source: "shop",
                active: p.active,
                categories: deriveDigitalProductCategories(p).categories,
              })),
              ...otherCourseUris.map((uri) => ({
                uri,
                name: uri,
                source: "other",
                active: courses[uri]?.active,
                categories: [],
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
              const isActive = selectedCourse === item.uri;
              const configured = isConfigured(item.uri);
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
                  title={titleText}
                  className={`w-full text-left px-2 py-2 flex items-center gap-1.5 border-b last:border-b-0 transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white border-l-2 border-l-slate-300"
                      : "hover:bg-gray-50 border-l-2 border-l-transparent"
                  }`}
                >
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 w-9 text-center ${TYPE_COLOR[item.source]}`}
                  >
                    {TYPE_LABEL[item.source]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`admin-product-title block text-sm truncate ${
                        isActive ? "text-white" : "text-gray-800"
                      }`}
                      title={item.name || item.uri}
                    >
                      {item.name}
                    </span>
                    {categoriesPreview && (
                      <span
                        className={`block text-[10px] truncate ${
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
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      configured
                        ? isActive
                          ? "bg-white"
                          : "bg-purple-500"
                        : isActive
                          ? "bg-amber-200"
                          : "bg-amber-300"
                    }`}
                    title={
                      configured
                        ? t("admin.configuredBadge")
                        : t("admin.filterNeedsConfig", "Needs config")
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
          {selectedCourse === "__custom__" && (
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
                className="px-2 py-1.5 text-[11px] rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
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
            {/* WP item info card */}
            {isWpSelection &&
              (() => {
                const wpItem = allWpContent.find(
                  (item) => item.uri === selectedCourse,
                );
                if (!wpItem) return null;
                const imgUrl = wpItem?.featuredImage?.node?.sourceUrl;
                const wpPrice = (
                  wpItem?.price ||
                  wpItem?.priceRendered ||
                  ""
                ).replace(/&nbsp;/g, " ");
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
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-amber-100 text-amber-800";

                return (
                  <div>
                    {/* Item header */}
                    <div className="flex gap-4 mb-4">
                      <ImagePickerButton
                        imgUrl={imgUrl}
                        uploadBackend={uploadBackend}
                        onUploaded={(url) => {
                          const upd = (setter) =>
                            setter((prev) =>
                              prev.map((x) =>
                                x.uri === selectedCourse
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
                          {wpItem?.title || wpItem?.name || selectedCourse}
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
                          {(courses[selectedCourse] || wpParsedCents > 0) && (
                            <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                              {t("admin.configuredBadge")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {selectedCourse}
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
                      const cfg = courses[selectedCourse];
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
              <div className="mb-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ImagePickerButton
                      imgUrl={selectedShopProduct.imageUrl}
                      uploadBackend={uploadBackend}
                      onUploaded={(url) => updateProduct(shopIndex, "imageUrl", url)}
                      onError={setError}
                    />
                    <div className="min-w-0">
                      <p className="admin-product-title text-sm font-bold break-words">
                        {selectedShopProduct.name || `Product ${shopIndex + 1}`}
                      </p>
                      <p className="text-xs text-gray-400">
                        {t(
                          "admin.shopProductInlineHint",
                          "Shop product — edit details below in this panel.",
                        )}
                      </p>
                      {selectedShopCategories.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {t("admin.categoryLabel")}:{" "}
                          {selectedShopCategories.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeShopProduct(shopIndex)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    {t("common.remove")}
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
                    <input
                      type="text"
                      value={selectedShopProduct.slug}
                      onChange={(e) =>
                        updateProduct(shopIndex, "slug", e.target.value)
                      }
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
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
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                      <input
                        type="checkbox"
                        checked={selectedShopProduct.active !== false}
                        onChange={(e) =>
                          updateProduct(shopIndex, "active", e.target.checked)
                        }
                        className="accent-purple-600"
                      />
                      <span className="text-gray-700">
                        {t("admin.activeProduct")}
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
                    className="mt-1 text-xs px-2.5 py-1 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
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
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={selectedShopProduct.fileUrl}
                          onChange={(e) =>
                            updateProduct(shopIndex, "fileUrl", e.target.value)
                          }
                          className="flex-1 border rounded px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => uploadFile(shopIndex, "fileUrl")}
                          disabled={!!uploadingField}
                          className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap disabled:opacity-50"
                        >
                          {uploadingField === "fileUrl"
                            ? t("common.loading")
                            : t("admin.uploadFile")}
                        </button>
                      </div>
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
                    </>
                  ) : (
                    <input
                      type="text"
                      value={selectedShopProduct.courseUri}
                      onChange={(e) =>
                        updateProduct(shopIndex, "courseUri", e.target.value)
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
                  checked={selectedCourseActive !== false}
                  onChange={(e) => setSelectedCourseActive(e.target.checked)}
                  className="accent-purple-600"
                />
                <span>{t("admin.activeProduct", "Active product")}</span>
              </label>
            )}

            <PriceAccessForm
              price={price}
              setPrice={setPrice}
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

            <div className="admin-vat-panel rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-indigo-50 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="admin-product-title text-sm font-semibold text-purple-900">
                    {t("admin.vatMapTitle")}
                  </p>
                  <p className="admin-soft-yellow text-xs text-purple-700/90 mt-1">
                    {t("admin.vatMapHint")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateShopVatByCategory(vatDraft)}
                  disabled={shopSettingsSaving}
                  className="px-3 py-1.5 rounded-md bg-purple-700 text-white text-xs font-medium hover:bg-purple-800 disabled:opacity-50"
                >
                  {shopSettingsSaving
                    ? t("common.saving", "Saving…")
                    : t("admin.vatMapSave")}
                </button>
              </div>
              {shopSettingsMessage && (
                <p className="text-xs text-green-700">{shopSettingsMessage}</p>
              )}

              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedCategories.map((category) => {
                    const slug = slugFromCategoryName(category);
                    const mappedVat = slug ? vatDraft?.[slug] : undefined;
                    return (
                      <span
                        key={`${category}-${slug}`}
                        className="admin-vat-surface inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white px-2.5 py-1 text-[11px] text-purple-800"
                        title={slug ? `${category} (${slug})` : category}
                      >
                        <span className="font-medium">{category}</span>
                        <span className="text-purple-500">
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
                        className="admin-vat-surface grid grid-cols-[minmax(0,1fr)_92px_52px] gap-2 items-center rounded-lg border border-purple-100 bg-white px-2 py-1.5"
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
                  className="px-3 py-2 rounded border border-purple-300 text-purple-700 text-sm hover:bg-purple-50"
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
  );
}

// ── Tab: Settings ─────────────────────────────────────────────────────────────

function SettingsTab({
  shopVisibleTypes,
  toggleShopType,
  shopSettingsSaving,
  shopSettingsMessage,
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
        <p className="text-sm font-semibold text-gray-800">
          {t("admin.shopVisibility")}
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
                ? "bg-purple-50"
                : "bg-white hover:bg-gray-50"
            }`}
          >
            <input
              type="checkbox"
              checked={shopVisibleTypes.includes(key)}
              onChange={() => toggleShopType(key)}
              disabled={shopSettingsSaving}
              className="mt-0.5 accent-purple-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
          </label>
        ))}
      </div>
      {shopSettingsSaving && (
        <p className="text-xs text-purple-600">
          {t("common.saving", "Sparar…")}
        </p>
      )}
      {shopSettingsMessage && (
        <p className="text-xs text-green-700">{shopSettingsMessage}</p>
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
    shopSettingsMessage,
    wcProducts,
    wpCourses,
    wpEvents,
    products,
    courses,
    otherCourseUris,
    allWpContent,
    selectedCourse,
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
    selectedCourseActive,
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
          <h2 className="text-2xl font-semibold">{t("admin.contentAccess")}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("admin.contentAccessDesc")}
          </p>
        </div>
        {process.env.NEXT_PUBLIC_STRIPE_MODE !== "live" && (
          <a
            href="https://dashboard.stripe.com/test/payments"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-700 hover:underline shrink-0"
            title={t("admin.stripePaymentsTooltip")}
          >
            {t("admin.stripePayments")} &rarr;
          </a>
        )}
      </div>

      <InnerTabs active={innerTab} onChange={setInnerTab} />

      {innerTab === "products" && (
        <ProductsTab
          products={products}
          selectedCourse={selectedCourse}
          isShopSelection={isShopSelection}
          selectedShopProduct={selectedShopProduct}
          shopIndex={shopIndex}
          handleSelection={handleSelection}
          updateProduct={updateProduct}
          removeShopProduct={removeShopProduct}
          uploadFile={uploadFile}
          uploadingField={uploadingField}
          uploadBackend={uploadBackend}
          runtime={runtime}
          showImageGen={showImageGen}
          setShowImageGen={setShowImageGen}
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
          allowedUsers={allowedUsers}
          filteredUsers={filteredUsers}
          toggleUser={toggleUser}
          manualEmail={manualEmail}
          setManualEmail={setManualEmail}
          addManualEmail={addManualEmail}
          saveUnified={saveUnified}
          loading={loading}
          editFormRef={editFormRef}
        />
      )}

      {innerTab === "access" && (
        <>
          <AccessTab
            wcProducts={wcProducts}
            wpCourses={wpCourses}
            wpEvents={wpEvents}
            products={products}
            otherCourseUris={otherCourseUris}
            selectedCourse={selectedCourse}
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
            shopVatByCategory={shopVatByCategory}
            updateShopVatByCategory={updateShopVatByCategory}
            shopSettingsSaving={shopSettingsSaving}
            shopSettingsMessage={shopSettingsMessage}
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
          shopSettingsMessage={shopSettingsMessage}
        />
      )}
    </div>
  );
}
