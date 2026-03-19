"use client";

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

export default function AdminProductsTab({
  // Shop visibility
  shopVisibleTypes,
  toggleShopType,
  shopSettingsSaving,
  shopSettingsMessage,
  // Content lists
  wcProducts,
  wpCourses,
  wpEvents,
  products,
  courses,
  otherCourseUris,
  allWpContent,
  // Selection
  selectedCourse,
  setSelectedCourse,
  handleSelection,
  isWpSelection,
  isShopSelection,
  selectedShopProduct,
  shopIndex,
  showDetail,
  // Edit form ref
  editFormRef,
  // Product ops
  updateProduct,
  removeShopProduct,
  uploadFile,
  uploadingField,
  uploadBackend,
  runtime,
  // Image gen
  showImageGen,
  setShowImageGen,
  // WP image updaters
  setWpEvents,
  setWcProducts,
  setWpCourses,
  setError,
  // Price & access
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
  // User access panel helper
  joinMeta,
  storage,
}) {
  return (
    <div className="border rounded p-5 space-y-4">
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

      {/* Shop visibility toggles */}
      <div className="space-y-3 bg-gray-50 rounded-lg p-4 border">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            {t("admin.shopVisibility")}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t("admin.shopVisibilityDesc")}
          </p>
        </div>
        <div className="space-y-2">
          {[
            {
              key: "product",
              label: "WooCommerce",
              desc: t("admin.shopTypeProductDesc"),
            },
            {
              key: "course",
              label: "LearnPress",
              desc: t("admin.shopTypeCourseDesc"),
            },
            {
              key: "event",
              label: "Events",
              desc: t("admin.shopTypeEventDesc"),
            },
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
          ].map(({ key, label, desc }) => (
            <label
              key={key}
              className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                shopVisibleTypes.includes(key) ? "bg-purple-50" : "bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={shopVisibleTypes.includes(key)}
                onChange={() => toggleShopType(key)}
                disabled={shopSettingsSaving}
                className="mt-0.5 accent-purple-600"
              />
              <div className="min-w-0">
                <span className="text-sm font-medium text-gray-800">
                  {label}
                </span>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </label>
          ))}
        </div>
        {shopSettingsSaving && (
          <p className="text-xs text-purple-600">
            {t("common.saving", "Sparar...")}
          </p>
        )}
        {shopSettingsMessage && (
          <p className="text-xs text-green-700">{shopSettingsMessage}</p>
        )}
      </div>

      {/* All products list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            {t("admin.selectContent")}
          </label>
          <button
            type="button"
            onClick={() => handleSelection("__new__")}
            className="text-sm text-purple-700 hover:underline"
          >
            + {t("admin.addProduct")}
          </button>
        </div>

        <div className="space-y-0">
          <ProductSection
            label="WooCommerce"
            items={wcProducts}
            renderItem={(product, index) => {
              const isActive = selectedCourse === product.uri;
              const configured = courses[product.uri];
              const category =
                product.productCategories?.edges?.[0]?.node?.name;
              const meta = joinMeta([
                product.price ? product.price.replace(/&nbsp;/g, " ") : "",
                category,
                product.uri,
              ]);
              const image = product.featuredImage?.node?.sourceUrl ? (
                <img
                  src={product.featuredImage.node.sourceUrl}
                  alt=""
                  className="w-40 h-40 rounded object-cover shrink-0"
                />
              ) : (
                <div className="w-40 h-40 rounded bg-gray-100 shrink-0" />
              );
              return (
                <ProductRow
                  key={`wc-${product.uri}`}
                  rowIndex={index}
                  title={product.name}
                  meta={meta}
                  image={image}
                  active={isActive}
                  configured={configured}
                  onClick={() => handleSelection(product.uri)}
                  badgeNode={
                    configured ? (
                      <span
                        title={t("admin.configuredBadgeTooltip")}
                        className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded shrink-0"
                      >
                        {t("admin.configuredBadge")}
                      </span>
                    ) : undefined
                  }
                />
              );
            }}
          />
          <ProductSection
            label="LearnPress"
            items={wpCourses}
            renderItem={(course, index) => {
              const isActive = selectedCourse === course.uri;
              const configured = courses[course.uri];
              const meta = joinMeta([
                course.priceRendered,
                course.duration,
                course.uri,
              ]);
              const image = (
                <div className="w-40 h-40 rounded bg-blue-50 shrink-0 flex items-center justify-center text-blue-400 text-base font-bold">
                  LP
                </div>
              );
              return (
                <ProductRow
                  key={`lp-${course.uri}`}
                  rowIndex={index}
                  title={course.title}
                  meta={meta}
                  image={image}
                  active={isActive}
                  configured={configured}
                  onClick={() => handleSelection(course.uri)}
                  badgeNode={
                    configured ? (
                      <span
                        title={t("admin.configuredBadgeTooltip")}
                        className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded shrink-0"
                      >
                        {t("admin.configuredBadge")}
                      </span>
                    ) : undefined
                  }
                />
              );
            }}
          />
          <p className="text-xs text-gray-400 px-1">
            WooCommerce and LearnPress prices are imported automatically from
            WordPress. Use the &ldquo;Use WP price&rdquo; button to lock in a
            price, or type a different value.
          </p>
          <ProductSection
            label="Events"
            items={wpEvents}
            renderItem={(event, index) => {
              const isActive = selectedCourse === event.uri;
              const configured = courses[event.uri];
              const dateStr = event.startDate
                ? new Date(event.startDate).toLocaleDateString("sv-SE")
                : null;
              const meta = joinMeta([dateStr, event.uri]);
              const image = event.featuredImage?.node?.sourceUrl ? (
                <img
                  src={event.featuredImage.node.sourceUrl}
                  alt=""
                  className="w-40 h-40 rounded object-cover shrink-0"
                />
              ) : (
                <div className="w-40 h-40 rounded bg-amber-50 shrink-0 flex items-center justify-center text-amber-400 text-base font-bold">
                  EV
                </div>
              );
              return (
                <ProductRow
                  key={`ev-${event.uri}`}
                  rowIndex={index}
                  title={event.title}
                  meta={meta}
                  image={image}
                  active={isActive}
                  configured={configured}
                  onClick={() => handleSelection(event.uri)}
                  badgeNode={
                    configured ? (
                      <span
                        title={t("admin.configuredBadgeTooltip")}
                        className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded shrink-0"
                      >
                        {t("admin.configuredBadge")}
                      </span>
                    ) : undefined
                  }
                />
              );
            }}
          />
          <p className="text-xs text-gray-400 px-1">
            Event Organiser has no built-in price field &mdash; price must be
            set manually in the config panel below.
          </p>
          <ProductSection
            label={t("admin.shopProducts")}
            items={products}
            renderItem={(product, index) => {
              const isActive = selectedCourse === `__shop_${index}`;
              const priceText = product.priceCents
                ? `${toCurrencyUnits(product.priceCents)} ${product.currency || "SEK"}`
                : "—";
              const meta = joinMeta([
                priceText,
                product.type === "course"
                  ? t("admin.courseProduct")
                  : t("admin.digitalFile"),
                product.slug ? `/${product.slug}` : "",
              ]);
              const image = product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  className="w-32 h-32 rounded object-cover shrink-0"
                />
              ) : (
                <div className="w-32 h-32 rounded bg-amber-50 shrink-0 flex items-center justify-center text-amber-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-8 h-8"
                  >
                    <path
                      fillRule="evenodd"
                      d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L2.5 11.06zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
                    />
                  </svg>
                </div>
              );
              return (
                <ProductRow
                  key={`shop-${index}`}
                  rowIndex={index}
                  title={product.name || `${t("admin.product")} ${index + 1}`}
                  meta={meta}
                  image={image}
                  active={isActive}
                  onClick={() => handleSelection(`__shop_${index}`)}
                  showBuyableIcon={false}
                  badgeNode={
                    product.active === false ? (
                      <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded shrink-0">
                        Inactive
                      </span>
                    ) : undefined
                  }
                />
              );
            }}
          />
          <p className="text-xs text-gray-400 px-1">
            Digital file and course products have no WordPress source &mdash;
            price is set here and stored locally.
          </p>
          <ProductSection
            label="Other"
            items={otherCourseUris}
            renderItem={(courseUri, index) => (
              <ProductRow
                key={courseUri}
                rowIndex={index}
                title={courseUri}
                meta=""
                image={
                  <div className="w-40 h-40 rounded bg-gray-100 shrink-0 flex items-center justify-center text-gray-400 text-base font-bold">
                    URI
                  </div>
                }
                active={selectedCourse === courseUri}
                showBuyableIcon={false}
                onClick={() => handleSelection(courseUri)}
              />
            )}
          />
          {/* Manual entry */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => handleSelection("__new__")}
              className="px-3 py-1.5 rounded border text-sm text-purple-700 hover:bg-purple-50"
            >
              + {t("admin.addProduct")}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCourse("__custom__")}
              className="px-3 py-1.5 rounded border text-sm text-gray-600 hover:bg-gray-50"
            >
              {t("admin.manualEntry")}
            </button>
          </div>
          {selectedCourse === "__custom__" && (
            <input
              type="text"
              value=""
              onChange={(e) => setSelectedCourse(e.target.value)}
              placeholder={t("admin.courseUriInputPlaceholder")}
              className="w-full border rounded px-3 py-2 text-sm"
              autoFocus
            />
          )}
        </div>
      </div>

      <div ref={editFormRef} />
      {/* ── WP item info card ── */}
      {isWpSelection &&
        (() => {
          const wpItem = allWpContent.find(
            (item) => item.uri === selectedCourse,
          );
          if (!wpItem) return null;
          const imgUrl = wpItem?.featuredImage?.node?.sourceUrl;
          const desc = wpItem?.shortDescription || wpItem?.content || "";
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
                  ? "WordPress Event"
                  : "Manual";
          const typeLabel =
            wpItem?._type === "product"
              ? t("common.product")
              : wpItem?._type === "course"
                ? t("common.course")
                : wpItem?._type === "event"
                  ? t("common.event")
                  : "Content";

          return (
            <div className="border rounded p-4 space-y-4 bg-gray-50">
              <div className="flex gap-4">
                <ImageUploader
                  value={imgUrl || ""}
                  onUploaded={(url) => {
                    setWpEvents((prev) =>
                      prev.map((ev) =>
                        ev.uri === selectedCourse
                          ? {
                              ...ev,
                              featuredImage: { node: { sourceUrl: url } },
                            }
                          : ev,
                      ),
                    );
                    setWcProducts((prev) =>
                      prev.map((p) =>
                        p.uri === selectedCourse
                          ? {
                              ...p,
                              featuredImage: { node: { sourceUrl: url } },
                            }
                          : p,
                      ),
                    );
                    setWpCourses((prev) =>
                      prev.map((c) =>
                        c.uri === selectedCourse
                          ? {
                              ...c,
                              featuredImage: { node: { sourceUrl: url } },
                            }
                          : c,
                      ),
                    );
                  }}
                  onError={(msg) => setError(msg)}
                  renderTrigger={(openPicker) => (
                    <button
                      type="button"
                      onClick={openPicker}
                      className="relative w-36 h-36 rounded border shrink-0 overflow-hidden group bg-gray-100"
                      title={t("admin.uploadImage")}
                    >
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-40 h-40"
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
                          className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                        </svg>
                      </div>
                    </button>
                  )}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="text-lg font-semibold truncate">
                    {wpItem?.title || wpItem?.name || selectedCourse}
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      {sourceLabel}
                    </span>
                    <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                      {typeLabel}
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
                  <p className="text-xs text-gray-500 truncate">
                    URI: {selectedCourse}
                  </p>
                </div>
              </div>
              {(() => {
                const cfg = courses[selectedCourse];
                const hasPriceCents =
                  cfg &&
                  typeof cfg.priceCents === "number" &&
                  cfg.priceCents > 0;
                if (!hasPriceCents) {
                  const wpParsedCents = parsePriceCents(wpPrice);
                  return (
                    <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 space-y-2">
                      <div className="flex items-start gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5 shrink-0 mt-0.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div>
                          <p className="font-semibold">
                            {t("admin.notBuyableTitle")}
                          </p>
                          <p className="text-xs mt-0.5">
                            {t("admin.notBuyableHint")}
                          </p>
                        </div>
                      </div>
                      {wpPrice && wpParsedCents > 0 && (
                        <div className="flex items-center gap-3 pt-1 border-t border-amber-200">
                          <span className="text-xs">
                            WordPress price: <strong>{wpPrice}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPrice((wpParsedCents / 100).toFixed(2));
                            }}
                            className="px-2 py-0.5 rounded border border-amber-400 bg-white text-amber-800 text-xs hover:bg-amber-100 shrink-0"
                          >
                            Use WP price
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
              {desc && (
                <div
                  className="text-sm text-gray-600 max-h-24 overflow-auto prose prose-sm"
                  dangerouslySetInnerHTML={{ __html: desc }}
                />
              )}
            </div>
          );
        })()}

      {/* ── Shop product edit form ── */}
      {isShopSelection && selectedShopProduct && (
        <div className="border rounded p-4 space-y-4 bg-amber-50">
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-start gap-4">
              <ImageUploader
                value={selectedShopProduct.imageUrl}
                onUploaded={(url) => updateProduct(shopIndex, "imageUrl", url)}
                onError={(msg) => setError(msg)}
                renderTrigger={(openPicker) => (
                  <button
                    type="button"
                    onClick={openPicker}
                    className="relative w-36 h-36 rounded border shrink-0 overflow-hidden group bg-gray-100"
                    title={t("admin.uploadImage")}
                  >
                    {selectedShopProduct.imageUrl ? (
                      <img
                        src={selectedShopProduct.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-40 h-40"
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
                        className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                    </div>
                  </button>
                )}
              />
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">
                  {selectedShopProduct.name ||
                    `${t("admin.product")} ${shopIndex + 1}`}
                </h3>
                <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded text-xs">
                  {t("admin.shopProducts")}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeShopProduct(shopIndex)}
              className="text-red-700 text-sm hover:underline"
            >
              {t("common.remove")}
            </button>
          </div>

          <p className="text-xs text-gray-500">{t("admin.shopProductsDesc")}</p>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("admin.namePlaceholder")}{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder={t("admin.namePlaceholder")}
                value={selectedShopProduct.name}
                onChange={(e) =>
                  updateProduct(shopIndex, "name", e.target.value)
                }
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <input
                type="text"
                placeholder={t("admin.slugPlaceholder")}
                value={selectedShopProduct.slug}
                onChange={(e) =>
                  updateProduct(shopIndex, "slug", e.target.value)
                }
                className="w-full border rounded px-3 py-2"
                title={t("admin.slugHint")}
              />
              <p className="text-[11px] text-gray-400 mt-0.5">
                {t("admin.slugHint")}
              </p>
            </div>
            <div>
              <select
                value={selectedShopProduct.type}
                onChange={(e) =>
                  updateProduct(shopIndex, "type", e.target.value)
                }
                className="w-full border rounded px-3 py-2"
                title={t("admin.productTypeHint")}
              >
                <option value="digital_file">{t("admin.digitalFile")}</option>
                <option value="course">{t("admin.courseProduct")}</option>
              </select>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {t("admin.productTypeHint")}
              </p>
            </div>
            <label
              className="flex items-center gap-2 text-sm"
              title={t("admin.activeProductHint")}
            >
              <input
                type="checkbox"
                checked={selectedShopProduct.active !== false}
                onChange={(e) =>
                  updateProduct(shopIndex, "active", e.target.checked)
                }
              />
              {t("admin.activeProduct")}
              <span className="text-[11px] text-gray-400 font-normal">
                &mdash; {t("admin.activeProductHint")}
              </span>
            </label>
          </div>

          <textarea
            rows="3"
            placeholder={t("admin.descriptionPlaceholder")}
            value={selectedShopProduct.description}
            onChange={(e) =>
              updateProduct(shopIndex, "description", e.target.value)
            }
            className="w-full border rounded px-3 py-2"
          />
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowImageGen((v) => !v)}
              className="text-xs px-3 py-1 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
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

          {selectedShopProduct.type === "digital_file" ? (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t("admin.fileUrlPlaceholder")}
                  value={selectedShopProduct.fileUrl}
                  onChange={(e) =>
                    updateProduct(shopIndex, "fileUrl", e.target.value)
                  }
                  className="flex-1 border rounded px-3 py-2"
                  title={t("admin.fileUrlHint")}
                />
                <button
                  type="button"
                  onClick={() => uploadFile(shopIndex, "fileUrl")}
                  className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
                  title={t("admin.uploadSizeHint")}
                  disabled={!!uploadingField}
                >
                  {uploadingField === "fileUrl"
                    ? t("common.loading")
                    : t("admin.uploadFile")}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {t("admin.fileUrlHint")}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {t("admin.uploadBackendCurrent")}:{" "}
                <span className="font-semibold text-gray-700">
                  {uploadBackend === "wordpress"
                    ? "WordPress Media"
                    : uploadBackend === "r2"
                      ? "Cloudflare R2 (edge-signed)"
                      : "S3/Spaces (Node SDK)"}
                </span>
                .{" "}
                {t(
                  "admin.uploadSizeHintShort",
                  "Direct uploads up to ~95 MB; larger files use multipart automatically.",
                )}{" "}
                {runtime === "edge"
                  ? t(
                      "admin.uploadEdgeLimit",
                      "Edge R2 path: single PUT up to 100 MB, multipart for bigger files.",
                    )
                  : t(
                      "admin.uploadNodeLimit",
                      "Node path: multipart upload for large files.",
                    )}
              </p>
              <p className="text-[11px] text-gray-500">
                {t(
                  "admin.uploadAltLarge",
                  "For very large files (e.g. >2 GB), upload via an S3/R2 client like WinSCP or Cyberduck to your bucket and paste the public URL here.",
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
                className="w-full border rounded px-3 py-2"
                title={t("admin.courseUriHint")}
              />
              <p className="text-[11px] text-gray-400 mt-0.5">
                {t("admin.courseUriHint")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Price & access config (shown for all selected items) ── */}
      {showDetail && (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                {t("admin.courseFee")} <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-600">{t("admin.feeHint")}</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="w-full border rounded px-3 py-2"
                  title={t("admin.feeHint")}
                />
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-24 border rounded px-3 py-2"
                  maxLength={5}
                  title={t("admin.currencyHint")}
                />
              </div>
              <p className="text-xs text-gray-400">
                {t("admin.priceSavedLocally")}
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                {t("admin.allowedUsers")}
              </label>
              <p className="text-xs text-gray-600">
                {t("admin.allowedUsersHint")}
              </p>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full border rounded px-3 py-1.5 text-sm mb-1"
              />
              <div className="border rounded p-3 max-h-56 overflow-auto space-y-2 bg-white">
                {users.length === 0 && allowedUsers.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    {t("admin.noUsersFound")}
                  </p>
                ) : (
                  <>
                    {filteredUsers.map((user) => (
                      <label
                        key={user.email}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={allowedUsers.includes(user.email)}
                          onChange={() => toggleUser(user.email)}
                        />
                        <span>
                          {user.name} ({user.email})
                        </span>
                      </label>
                    ))}
                    {allowedUsers
                      .filter((email) => !users.some((u) => u.email === email))
                      .map((email) => (
                        <label
                          key={email}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => toggleUser(email)}
                          />
                          <span>{email}</span>
                        </label>
                      ))}
                  </>
                )}
              </div>
              <div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), addManualEmail())
                    }
                    placeholder={t("admin.addEmailPlaceholder")}
                    className="w-full border rounded px-3 py-2 text-sm"
                    title={t("admin.addEmailHint")}
                  />
                  <button
                    type="button"
                    onClick={addManualEmail}
                    className="px-3 py-2 rounded border hover:bg-gray-50 text-sm whitespace-nowrap"
                  >
                    {t("common.add")}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {t("admin.addEmailHint")}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={saveUnified}
            className="px-6 py-2 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? t("admin.saving") : t("admin.saveCourseAccess")}
          </button>
        </>
      )}
      {/* User management — reverse access view */}
      <div className="space-y-3">
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
    </div>
  );
}
