"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { parsePriceCents } from "@/lib/parsePrice";
import ImageUploader from "./ImageUploader";
import ProductRow from "./ProductRow";
import ProductSection from "./ProductSection";
import ImageGenerationPanel from "./ImageGenerationPanel";
import UserAccessPanel from "./UserAccessPanel";

function toCurrencyUnits(cents) {
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : "0.00";
}

// ── Inner tab nav ────────────────────────────────────────────────────────────

function InnerTabs({ active, onChange }) {
  const tabs = [
    { key: "products", label: "Shop Products" },
    { key: "access", label: "Access & Pricing" },
    { key: "settings", label: "Settings" },
  ];
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
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

function ImagePickerButton({ imgUrl, onUploaded, onError }) {
  return (
    <ImageUploader
      value={imgUrl || ""}
      onUploaded={onUploaded}
      onError={onError}
      renderTrigger={(openPicker) => (
        <button
          type="button"
          onClick={openPicker}
          className="relative w-28 h-28 rounded-lg border shrink-0 overflow-hidden group bg-gray-100"
          title={t("admin.uploadImage")}
        >
          {imgUrl ? (
            <img src={imgUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-10 h-10"
              >
                <path
                  fillRule="evenodd"
                  d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </div>
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
        <div className="flex gap-2">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min="0"
            step="0.01"
            placeholder="0.00"
            className="flex-1 border rounded px-3 py-2 text-sm"
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
  return (
    <div
      className="grid grid-cols-[240px_1fr] gap-4"
      style={{ minHeight: 520 }}
    >
      {/* ── Left: product list ── */}
      <div className="border rounded flex flex-col overflow-hidden">
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
              const priceText = product.priceCents
                ? `${toCurrencyUnits(product.priceCents)} ${product.currency || "SEK"}`
                : "no price set";
              return (
                <button
                  key={`shop-${index}`}
                  type="button"
                  onClick={() => handleSelection(`__shop_${index}`)}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
                    isActive
                      ? "bg-purple-50 border-l-2 border-purple-500"
                      : "hover:bg-gray-50 border-l-2 border-transparent"
                  }`}
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="w-9 h-9 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-amber-100 shrink-0 flex items-center justify-center">
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
                    <p className="text-sm font-medium truncate text-gray-800">
                      {product.name || `Product ${index + 1}`}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
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
      <div ref={editFormRef} className="border rounded overflow-auto">
        {isShopSelection && selectedShopProduct ? (
          <div className="p-5 space-y-5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <ImagePickerButton
                  imgUrl={selectedShopProduct.imageUrl}
                  onUploaded={(url) =>
                    updateProduct(shopIndex, "imageUrl", url)
                  }
                  onError={setError}
                />
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">
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
  setWpEvents,
  setWcProducts,
  setWpCourses,
  setError,
  price,
  setPrice,
  currency,
  setCurrency,
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
  joinMeta,
  storage,
  editFormRef,
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  // Incrementing this triggers PriceAccessForm to auto-save after price state settles
  const [autoSaveTrigger, setAutoSaveTrigger] = useState(0);

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

  // "Needs config" = no priceCents set yet
  const isConfigured = (uri) => {
    const cfg = courses[uri];
    return cfg && typeof cfg.priceCents === "number" && cfg.priceCents > 0;
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

  return (
    <div
      className="grid grid-cols-[260px_1fr] gap-4"
      style={{ minHeight: 520 }}
    >
      {/* ── Left: content list ── */}
      <div className="border rounded flex flex-col overflow-hidden">
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
              })),
              ...wpCourses.map((c) => ({
                uri: c.uri,
                name: c.title,
                source: "lp",
              })),
              ...wpEvents.map((e) => ({
                uri: e.uri,
                name: e.title,
                source: "ev",
              })),
              ...products.map((p, i) => ({
                uri: `__shop_${i}`,
                name: p.name || `Product ${i + 1}`,
                source: "shop",
                active: p.active,
              })),
              ...otherCourseUris.map((uri) => ({
                uri,
                name: uri,
                source: "other",
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
              return (
                <button
                  key={item.uri}
                  type="button"
                  onClick={() => handleSelection(item.uri)}
                  className={`w-full text-left px-2 py-2 flex items-center gap-1.5 border-b last:border-b-0 transition-colors ${isActive ? "bg-purple-50 border-l-2 border-l-purple-500" : "hover:bg-gray-50 border-l-2 border-l-transparent"}`}
                >
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 w-9 text-center ${TYPE_COLOR[item.source]}`}
                  >
                    {TYPE_LABEL[item.source]}
                  </span>
                  <span className="text-sm truncate flex-1 text-gray-800">
                    {item.name}
                  </span>
                  {item.active === false && (
                    <span className="text-[9px] bg-red-50 text-red-500 px-1 rounded shrink-0">
                      Off
                    </span>
                  )}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${configured ? "bg-purple-500" : "bg-amber-300"}`}
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
            onClick={() => setSelectedCourse("__custom__")}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            + Enter URI manually
          </button>
          {selectedCourse === "__custom__" && (
            <input
              type="text"
              value=""
              onChange={(e) => setSelectedCourse(e.target.value)}
              placeholder={t("admin.courseUriInputPlaceholder")}
              className="mt-1 w-full border rounded px-2 py-1.5 text-xs"
              autoFocus
            />
          )}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      <div ref={editFormRef} className="border rounded overflow-auto">
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
                        <h3 className="text-base font-semibold truncate">
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
                          {courses[selectedCourse] && (
                            <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                              {t("admin.configuredBadge")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {selectedCourse}
                        </p>
                      </div>
                    </div>

                    {/* "Not buyable" warning */}
                    {(() => {
                      const cfg = courses[selectedCourse];
                      const hasPriceCents =
                        cfg &&
                        typeof cfg.priceCents === "number" &&
                        cfg.priceCents > 0;
                      if (hasPriceCents) return null;
                      const wpParsedCents = parsePriceCents(wpPrice);
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

            {/* Shop product mini-info */}
            {isShopSelection && selectedShopProduct && (
              <div className="flex items-center gap-3 mb-2">
                {selectedShopProduct.imageUrl ? (
                  <img
                    src={selectedShopProduct.imageUrl}
                    alt=""
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-amber-50 flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-5 h-5 text-amber-300"
                    >
                      <path
                        fillRule="evenodd"
                        d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L2.5 11.06zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold">
                    {selectedShopProduct.name || `Product ${shopIndex + 1}`}
                  </p>
                  <p className="text-xs text-gray-400">
                    Shop product — edit details in the Shop Products tab
                  </p>
                </div>
                <hr className="mt-2" />
              </div>
            )}

            <PriceAccessForm
              price={price}
              setPrice={setPrice}
              currency={currency}
              setCurrency={setCurrency}
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
            <p className="text-sm">Select an item to configure access</p>
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
  const [innerTab, setInnerTab] = useState("products");

  const {
    shopVisibleTypes,
    toggleShopType,
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
    joinMeta,
    storage,
  } = props;

  return (
    <div className="border rounded p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
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
            setWpEvents={setWpEvents}
            setWcProducts={setWcProducts}
            setWpCourses={setWpCourses}
            setError={setError}
            price={price}
            setPrice={setPrice}
            currency={currency}
            setCurrency={setCurrency}
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
            joinMeta={joinMeta}
            storage={storage}
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
