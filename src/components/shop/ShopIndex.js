"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { t, tForLocale } from "@/lib/i18n";
import { resolveProductHref } from "@/lib/productRoutes";

const OWNERSHIP_MAX_ATTEMPTS = 3;
const OWNERSHIP_TIMEOUT_MS = 8000;
const OWNERSHIP_RETRY_BASE_MS = 350;

function formatPrice(priceCents, currency) {
  if (!priceCents || priceCents <= 0) return null;
  return `${(priceCents / 100).toFixed(0)} ${String(currency || "SEK").toUpperCase()}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a WordPress-rendered price like "kr750.00" or "750,00&nbsp;kr" into cents */
function parseWpPrice(priceStr) {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.,]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function pickVariantUrlByWidth(variants, width, fallbackUrl) {
  const safeVariants = (Array.isArray(variants) ? variants : [])
    .filter(
      (variant) =>
        variant &&
        typeof variant.url === "string" &&
        variant.url &&
        Number.isFinite(Number(variant.width)),
    )
    .map((variant) => ({
      ...variant,
      width: Number(variant.width),
    }))
    .sort((left, right) => left.width - right.width);
  if (safeVariants.length === 0) return fallbackUrl;
  const target = Number.isFinite(width) && width > 0 ? width : 1200;
  for (const variant of safeVariants) {
    if (variant.width >= target) return variant.url;
  }
  return safeVariants[safeVariants.length - 1].url;
}

function buildImageLoader(imageSources, fallbackUrl) {
  const variants = Array.isArray(imageSources?.variants)
    ? imageSources.variants
    : [];
  if (variants.length === 0) return undefined;
  return ({ src, width }) =>
    pickVariantUrlByWidth(variants, width, fallbackUrl || src || "");
}

function normalizeProductLanguage(value) {
  const safe = String(value || "").trim().toLowerCase();
  return safe === "en" || safe === "es" ? safe : "sv";
}

function itemT(item, key, fallback) {
  if (item?.source === "digital") {
    return tForLocale(normalizeProductLanguage(item.language), key, fallback);
  }
  return t(key, fallback);
}

function translateBuyableKind(item, kind) {
  switch (String(kind || "").trim().toLowerCase()) {
    case "download":
    case "digital_file":
    case "asset":
      return itemT(item, "shop.downloadProduct", "Download");
    case "course":
      return itemT(item, "common.course", "Course");
    case "event":
      return itemT(item, "common.event", "Event");
    case "product":
    case "service":
      return itemT(item, "common.product", "Product");
    case "workshop":
      return itemT(item, "shop.typeEvent", "Event");
    default:
      return String(kind || "").trim();
  }
}

function typeLabel(item) {
  switch (item.type) {
    case "product":
      return itemT(item, "shop.typeProduct", "Product");
    case "course":
      return itemT(item, "shop.typeCourse", "Course");
    case "event":
      return itemT(item, "shop.typeEvent", "Event");
    case "digital_file":
      return itemT(item, "shop.downloadProduct", "Download");
    case "digital_course":
      return itemT(item, "shop.typeCourse", "Course");
    default:
      return "";
  }
}

function typeBadgeColor(item) {
  switch (item.type) {
    case "product":
      return "bg-blue-300 text-blue-800 badge";
    case "course":
      return "bg-green-300 text-green-800 badge";
    case "event":
      return "bg-amber-300 text-amber-800 badge";
    case "digital_file":
      return "bg-purple-300 text-purple-800 badge";
    case "digital_course":
      return "bg-green-300 text-green-800 badge";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function resolveBuyableNoun(item) {
  const custom = String(item?.buyableNoun || "").trim();
  if (custom) return custom;
  const translatedType = String(typeLabel(item) || "").trim().toLowerCase();
  const translatedKind = translateBuyableKind(item, item?.buyableKind);
  const safeKind = String(translatedKind || "").trim();
  if (!safeKind) return "";
  if (safeKind.toLowerCase() === translatedType) return "";
  return safeKind;
}

function formatScheduleLabel(item) {
  const startRaw = String(item?.scheduleStart || "").trim();
  const endRaw = String(item?.scheduleEnd || "").trim();
  if (!startRaw && !endRaw) return "";
  const tz = String(item?.scheduleTimezone || "").trim();
  const format = (raw) => {
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return raw;
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(tz ? { timeZone: tz } : {}),
      }).format(parsed);
    } catch {
      return parsed.toLocaleString();
    }
  };
  if (startRaw && endRaw) return `${format(startRaw)} - ${format(endRaw)}`;
  return format(startRaw || endRaw);
}

function resolveShopBrowseHref(item) {
  const uri = typeof item?.uri === "string" ? item.uri.trim() : "";
  if (uri) return uri;
  const slug = typeof item?.slug === "string" ? item.slug.trim() : "";
  return slug ? `/shop/${encodeURIComponent(slug)}` : "";
}

function resolveShopOwnedHref(item) {
  if (item?.source === "digital") {
    return resolveProductHref(item);
  }
  return resolveShopBrowseHref(item);
}

function ShopIndexContent({ items }) {
  const searchParams = useSearchParams();
  const checkoutStatus =
    typeof searchParams?.get("checkout") === "string"
      ? searchParams.get("checkout")
      : "";
  const checkoutSessionId =
    typeof searchParams?.get("session_id") === "string"
      ? searchParams.get("session_id")
      : "";
  const checkoutProductId =
    typeof searchParams?.get("product_id") === "string"
      ? searchParams.get("product_id")
      : "";
  const [brokenImages, setBrokenImages] = useState({});
  const [ownershipReady, setOwnershipReady] = useState(false);
  const [user, setUser] = useState(null);
  const [ownedProductIds, setOwnedProductIds] = useState([]);
  const [ownedUris, setOwnedUris] = useState([]);
  const [accessBatchFailed, setAccessBatchFailed] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const [ownershipError, setOwnershipError] = useState("");
  const [ownershipRetryTick, setOwnershipRetryTick] = useState(0);
  const wpUris = useMemo(
    () =>
      items
        .filter(
          (item) => item.source !== "digital" && typeof item.uri === "string",
        )
        .map((item) => item.uri),
    [items],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadOwnership() {
      setOwnershipReady(false);
      setOwnershipError("");
      try {
        let lastError = null;
        for (let attempt = 1; attempt <= OWNERSHIP_MAX_ATTEMPTS; attempt += 1) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(
              () => controller.abort(),
              OWNERSHIP_TIMEOUT_MS,
            );
            const response = await fetch("/api/shop/ownership", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uris: wpUris,
                checkoutStatus,
                checkoutSessionId,
                checkoutProductId,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const json = await response.json().catch(() => ({}));
            if (!response.ok || !json?.ok) {
              throw new Error(json?.error || "Ownership lookup failed");
            }
            if (cancelled) return;
            setUser(json.user || null);
            setOwnedProductIds(
              Array.isArray(json.ownedProductIds) ? json.ownedProductIds : [],
            );
            setOwnedUris(Array.isArray(json.ownedUris) ? json.ownedUris : []);
            setAccessBatchFailed(Boolean(json.accessBatchFailed));
            setCheckoutError(Boolean(json.checkoutError));
            setOwnershipError("");
            return;
          } catch (err) {
            lastError = err;
            if (attempt < OWNERSHIP_MAX_ATTEMPTS) {
              await sleep(OWNERSHIP_RETRY_BASE_MS * 2 ** (attempt - 1));
              continue;
            }
            throw lastError;
          }
        }
      } catch (err) {
        console.error("Shop ownership enrichment failed:", err);
        if (cancelled) return;
        setUser(null);
        setOwnedProductIds([]);
        setOwnedUris([]);
        setAccessBatchFailed(false);
        setCheckoutError(checkoutStatus === "success");
        setOwnershipError(
          t(
            "shop.ownershipLookupFailed",
            "Could not verify ownership right now. You can retry in a moment.",
          ),
        );
      } finally {
        if (!cancelled) setOwnershipReady(true);
      }
    }
    loadOwnership();
    return () => {
      cancelled = true;
    };
  }, [
    checkoutProductId,
    checkoutSessionId,
    checkoutStatus,
    wpUris,
    ownershipRetryTick,
  ]);

  const ownershipPending = !ownershipReady;

  function retryOwnershipLookup() {
    setOwnershipRetryTick((current) => current + 1);
  }

  function isOwned(item) {
    if (item.source === "digital") {
      return ownedProductIds?.includes(item.id);
    }
    return ownedUris?.includes(item.uri);
  }

  return (
    <section className="max-w-6xl mx-auto px-6 py-16 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("shop.title")}</h1>
        <p className="mt-2 text-[var(--color-foreground)]">
          {t("shop.subtitle")}
        </p>
      </div>

      {accessBatchFailed && user?.email && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-amber-900 font-medium">
            {t("errors.serviceTemporarilyUnavailable")}
          </p>
          <p className="text-amber-800 text-sm mt-1">
            {t("errors.accessCheckFailed")}
          </p>
        </div>
      )}

      {checkoutStatus === "success" && checkoutError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-amber-800 font-medium">
            {t("shop.paymentVerifyFailed")}
          </p>
          <p className="text-amber-700 text-sm mt-1">
            {t("shop.paymentVerifyHint")}
          </p>
        </div>
      )}
      {checkoutStatus === "success" && !checkoutError && ownershipReady && (
        <p className="text-green-700">{t("shop.paymentSuccess")}</p>
      )}
      {checkoutStatus === "cancel" && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-yellow-800">{t("shop.paymentCancelled")}</p>
          <p className="text-yellow-700 text-sm mt-1">
            {t("shop.paymentCancelledRetry")}
          </p>
        </div>
      )}
      {ownershipPending && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {t(
            "shop.ownershipLookupLoading",
            "Checking your ownership and access state…",
          )}
        </div>
      )}
      {ownershipError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{ownershipError}</p>
          <button
            type="button"
            onClick={retryOwnershipLookup}
            className="mt-2 rounded border border-amber-500 px-3 py-1.5 text-xs hover:bg-amber-100"
          >
            {t("shop.retryOwnershipLookup", "Retry ownership check")}
          </button>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-[var(--color-foreground)]">{t("shop.noProducts")}</p>
      )}

      <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-6">
        {items.map((item) => {
          const imageSources =
            item.imageSources && typeof item.imageSources === "object"
              ? item.imageSources
              : null;
          const imageUrl = imageSources?.src || item.imageUrl || "";
          const imageWidth =
            Number.isFinite(Number(imageSources?.width)) &&
            Number(imageSources?.width) > 0
              ? Number(imageSources.width)
              : 600;
          const imageHeight =
            Number.isFinite(Number(imageSources?.height)) &&
            Number(imageSources?.height) > 0
              ? Number(imageSources.height)
              : 800;
          const imageLoader = buildImageLoader(imageSources, imageUrl);
          const showImage = imageUrl && !brokenImages[item.id];
          const owned = isOwned(item);
          const ownedHref = resolveShopOwnedHref(item);
          const browseHref = resolveShopBrowseHref(item);
          const effectiveCents =
            item.priceCents > 0 ? item.priceCents : parseWpPrice(item.price);
          const priceDisplay = formatPrice(effectiveCents, item.currency) || "";
          const scheduleLabel = formatScheduleLabel(item);
          const buyableNoun = resolveBuyableNoun(item);
          const hasExternalBooking =
            item?.externalBookingEnabled === true &&
            typeof item?.externalBookingUrl === "string" &&
            item.externalBookingUrl.trim().length > 0;
          const cardHref = !owned && !ownershipPending ? browseHref : "";

          // .bg-white when in .dark-mode is #2A2A2A !IMPORTANT
          return (
            <article
              key={item.id}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_12px_28px_-22px_rgba(15,23,42,0.55)] transition-all duration-200 sm:flex-row ${
                cardHref
                  ? "border-[var(--color-muted)] hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-[0_20px_42px_-24px_rgba(217,119,6,0.45)]"
                  : "border-amber-300"
              }`}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/80 to-transparent" />
              {hasExternalBooking && (
                <span className="pointer-events-none absolute right-3 top-3 z-[15] rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                  {t("shop.externalBadge", "External booking")}
                </span>
              )}
              {showImage ? (
                <Image
                  src={imageUrl}
                  alt={item.name}
                  width={imageWidth}
                  height={imageHeight}
                  loader={imageLoader}
                  unoptimized={Boolean(imageLoader)}
                  sizes={
                    imageSources?.sizes ||
                    "(max-width: 768px) 100vh, (max-width: 1200px) 50vh, 33vh"
                    // basis-1/2 since we are in a flex-col s.t. the vertical is the main axis
                  }
                  className="h-56 w-full object-cover object-top border-b border-black/10 sm:h-auto sm:w-[44%] sm:basis-[44%] sm:border-b-0 sm:border-r"
                  onError={() =>
                    setBrokenImages((prev) => ({ ...prev, [item.id]: true }))
                  }
                />
              ) : (
                <div className="flex h-56 w-full items-center justify-center bg-[var(--color-muted)] text-[var(--color-background)] sm:h-auto sm:w-[44%] sm:basis-[44%]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-12 h-12"
                  >
                    <path
                      fillRule="evenodd"
                      d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L2.5 11.06zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}

              <div className="relative z-10 flex flex-1 flex-col gap-2 p-5">
                <h2
                  className="text-[1.08rem] leading-snug"
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 550,
                  }}
                >
                  {item.name}
                </h2>
                <div className="flex shrink-0 items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span
                      className={`px-2 py-0.5 rounded whitespace-nowrap border border-black font-sans text-[11px] font-semibold uppercase tracking-[0.14em] ${typeBadgeColor(item)}`}
                    >
                      {typeLabel(item)}
                    </span>
                    {buyableNoun ? (
                      <span className="rounded whitespace-nowrap border border-slate-300 bg-slate-100 px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                        {buyableNoun}
                      </span>
                    ) : null}
                  </div>
                  {priceDisplay ? (
                    <p className="px-1 text-sm font-semibold tracking-[0.04em] text-slate-700">
                      {priceDisplay}
                    </p>
                  ) : null}
                </div>
                {(scheduleLabel || item.venueName) && (
                  <div className="flex flex-wrap gap-1.5">
                    {scheduleLabel ? (
                      <p className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                        {scheduleLabel}
                      </p>
                    ) : null}
                    {item.venueName ? (
                      <p className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        {item.venueName}
                      </p>
                    ) : null}
                  </div>
                )}

                {item.description && (
                  <pre
                    className="line-clamp-6 text-[10.5pt] text-slate-700"
                    style={{
                      whiteSpace: "pre-wrap",
                      wordWrap: "break-word",
                    }}
                  >
                    {item.description}
                  </pre>
                )}
                {item.duration && !/^0\s/.test(item.duration) && (
                  <p className="text-xs text-slate-600">{item.duration}</p>
                )}

                <div className="mt-auto border-t border-slate-200/80 pt-3">
                  <div className="flex items-center gap-2">
                    {owned ? (
                      ownedHref ? (
                        <Link
                          href={ownedHref}
                          className="rounded-lg bg-teal-700 px-4 py-2 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white shop-cta hover:bg-teal-600"
                        >
                          {itemT(item, "shop.openPurchasedAsset", "Access")}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                          {t("shop.purchased")}
                        </span>
                      )
                    ) : ownershipPending ? (
                      <span className="inline-block h-8 w-24 animate-pulse rounded bg-[var(--color-muted)]" />
                    ) : cardHref ? (
                      <Link
                        href={cardHref}
                        className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white shop-cta hover:bg-slate-800"
                      >
                        {hasExternalBooking
                          ? t("shop.viewDetails", "View details")
                          : t("shop.viewAndBuy")}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-[var(--color-primary)] underline-offset-4 group-hover:underline">
                        {hasExternalBooking
                          ? t("shop.viewDetails", "View details")
                          : t("shop.viewAndBuy")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ShopIndexFallback() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("shop.title")}</h1>
        <p className="mt-2 text-[var(--color-foreground)]">
          {t("shop.subtitle")}
        </p>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        {t(
          "shop.ownershipLookupLoading",
          "Checking your ownership and access state…",
        )}
      </div>
    </section>
  );
}

export default function ShopIndex(props) {
  return (
    <Suspense fallback={<ShopIndexFallback />}>
      <ShopIndexContent {...props} />
    </Suspense>
  );
}
