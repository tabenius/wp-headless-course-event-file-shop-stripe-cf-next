"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n";

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

function typeLabel(item) {
  switch (item.type) {
    case "product":
      return t("shop.typeProduct");
    case "course":
      return t("shop.typeCourse");
    case "event":
      return t("shop.typeEvent");
    case "digital_file":
      return t("shop.typeDigitalFile");
    case "digital_course":
      return t("shop.typeCourse");
    default:
      return "";
  }
}

function typeBadgeColor(item) {
  switch (item.type) {
    case "product":
      return "bg-blue-100 text-blue-800";
    case "course":
      return "bg-green-100 text-green-800";
    case "event":
      return "bg-amber-100 text-amber-800";
    case "digital_file":
      return "bg-purple-100 text-purple-800";
    case "digital_course":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function deriveBoughtUri(item) {
  if (item?.productMode === "asset" && item?.assetId) {
    return `/inventory/${encodeURIComponent(item.assetId)}`;
  }
  return "";
}

function ShopIndexContent({
  items,
  stripeEnabled,
}) {
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
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");
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
        .filter((item) => item.source !== "digital" && typeof item.uri === "string")
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

  // Digital product checkout via /api/digital/checkout
  async function startDigitalCheckout(productSlug) {
    if (!user?.email) {
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent("/shop")}`;
      return;
    }
    if (!stripeEnabled) {
      setError(t("shop.paymentNotAvailable"));
      return;
    }
    setError("");
    setLoadingId(productSlug);
    try {
      const response = await fetch("/api/digital/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok || !json?.url) {
        setError(json?.error || t("shop.checkoutFailed"));
        return;
      }
      window.location.href = json.url;
    } catch {
      setError(t("shop.checkoutFailed"));
    } finally {
      setLoadingId("");
    }
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
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-red-800">{error}</p>
          <p className="text-red-600 text-sm mt-1">
            {t("shop.checkoutRetryHint")}
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

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              : 1200;
          const imageHeight =
            Number.isFinite(Number(imageSources?.height)) &&
            Number(imageSources?.height) > 0
              ? Number(imageSources.height)
              : 600;
          const imageLoader = buildImageLoader(imageSources, imageUrl);
          const showImage = imageUrl && !brokenImages[item.id];
          const owned = isOwned(item);
          const loading = loadingId === item.slug;
          const isDigital = item.source === "digital";
          const boughtUri = deriveBoughtUri(item);
          const effectiveCents =
            item.priceCents > 0 ? item.priceCents : parseWpPrice(item.price);
          const priceDisplay = formatPrice(effectiveCents, item.currency) || "";

          return (
            <article
              key={item.id}
              className="flex flex-col overflow-hidden rounded-lg border border-[var(--color-muted)] bg-[var(--color-background)]"
            >
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
                    "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  }
                  className="w-full h-44 object-cover"
                  onError={() =>
                    setBrokenImages((prev) => ({ ...prev, [item.id]: true }))
                  }
                />
              ) : (
                <div className="flex h-44 w-full items-center justify-center bg-[var(--color-muted)] text-[var(--color-background)]">
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

              <div className="p-5 space-y-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
                    {item.name}
                  </h2>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${typeBadgeColor(item)}`}
                  >
                    {typeLabel(item)}
                  </span>
                </div>

                {item.description && (
                  <p className="line-clamp-3 text-sm text-[var(--color-foreground)]">
                    {item.description}
                  </p>
                )}
                {item.duration && !/^0\s/.test(item.duration) && (
                  <p className="text-xs text-[var(--color-foreground)]">
                    {item.duration}
                  </p>
                )}

                <div className="mt-auto pt-3">
                  {priceDisplay && (
                    <p className="mb-3 font-semibold text-[var(--color-foreground)]">
                      {priceDisplay}
                    </p>
                  )}

                  <div className="flex gap-2 items-center">
                    {owned ? (
                      boughtUri ? (
                        <Link
                          href={boughtUri}
                          className="px-4 py-2 rounded bg-teal-700 text-white shop-cta hover:bg-teal-600 text-sm"
                        >
                          {t("shop.openPurchasedAsset", "Open purchased asset")}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                          {t("shop.purchased")}
                        </span>
                      )
                    ) : (
                      ownershipPending ? (
                        <span className="inline-block h-8 w-24 animate-pulse rounded bg-[var(--color-muted)]" />
                      ) : (
                        <Link
                          href={item.uri}
                          className="px-4 py-2 rounded bg-gray-800 text-white shop-cta hover:bg-gray-700 text-sm"
                        >
                          {t("shop.viewAndBuy")}
                        </Link>
                      )
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
