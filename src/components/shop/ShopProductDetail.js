"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { t, tForLocale } from "@/lib/i18n";
import { resolveProductHref } from "@/lib/productRoutes";

function deriveBuyableUri(product) {
  if (product?.productMode === "asset" && product?.assetId) {
    return `/shop/${encodeURIComponent(product.assetId)}`;
  }
  return `/shop/${encodeURIComponent(product?.slug || "")}`;
}

function hasExternalBooking(product) {
  return (
    product?.externalBookingEnabled === true &&
    typeof product?.externalBookingUrl === "string" &&
    product.externalBookingUrl.trim().length > 0
  );
}

function resolveBuyableNoun(product) {
  const custom = String(product?.buyableNoun || "").trim();
  if (custom) return custom;
  const kind = String(product?.buyableKind || "").trim();
  if (kind) return kind;
  if (product?.type === "course" || product?.productMode === "manual_uri") {
    return "course";
  }
  if (product?.productMode === "asset") return "asset";
  return "download";
}

function formatScheduleRange(product) {
  const startRaw = String(product?.scheduleStart || "").trim();
  const endRaw = String(product?.scheduleEnd || "").trim();
  if (!startRaw && !endRaw) return "";

  const tz = String(product?.scheduleTimezone || "").trim();
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

function getViewMode(product) {
  const mime = String(product?.mimeType || "").trim().toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  return "";
}

function normalizeProductLanguage(value) {
  const safe = String(value || "").trim().toLowerCase();
  return safe === "en" || safe === "es" ? safe : "sv";
}

function getInlineViewLabel(viewMode, productLanguage) {
  if (viewMode === "video") {
    return tForLocale(productLanguage, "shop.viewVideo", "Stream");
  }
  if (viewMode === "audio") {
    return tForLocale(productLanguage, "shop.viewAudio", "Listen now");
  }
  if (viewMode === "image") {
    return tForLocale(productLanguage, "shop.viewImage", "View image");
  }
  return tForLocale(productLanguage, "shop.viewPdf", "Read now");
}

export default function ShopProductDetail({ product, stripeEnabled }) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageBroken, setImageBroken] = useState(false);
  const [user, setUser] = useState(null);
  const [owned, setOwned] = useState(false);
  const [accessCheckFailed, setAccessCheckFailed] = useState(false);
  const [ownershipLoaded, setOwnershipLoaded] = useState(false);
  const buyableUri = deriveBuyableUri(product);
  const boughtUri = resolveProductHref(product);
  const isFreeProduct =
    product?.free === true || Number(product?.priceCents || 0) <= 0;
  const externalCheckout = hasExternalBooking(product);
  const scheduleLabel = formatScheduleRange(product);
  const buyableNoun = resolveBuyableNoun(product);
  const productLanguage = normalizeProductLanguage(product?.language);
  const productT = (key, params) => tForLocale(productLanguage, key, params);
  const viewMode = getViewMode(product);
  const hasInlineViewer = Boolean(viewMode);
  const downloadHref = `/api/digital/download?productId=${encodeURIComponent(product.id)}`;
  const viewHref = `/api/digital/view?productId=${encodeURIComponent(product.id)}`;

  const checkoutStatus = searchParams.get("checkout") || "";
  const checkoutSessionId = searchParams.get("session_id") || "";

  useEffect(() => {
    if (externalCheckout) {
      setOwnershipLoaded(true);
      return () => {};
    }
    let cancelled = false;
    async function checkOwnership() {
      try {
        const body = {
          checkoutStatus,
          checkoutSessionId,
          checkoutProductId: checkoutStatus === "success" ? product.id : "",
        };
        const res = await fetch("/api/shop/ownership", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          if (!cancelled) setOwnershipLoaded(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.user) setUser(data.user);
        const productOwned =
          Array.isArray(data.ownedProductIds) &&
          data.ownedProductIds.includes(product.id);
        setOwned(productOwned);
        setAccessCheckFailed(Boolean(data.accessBatchFailed));
      } catch {
        if (!cancelled) setAccessCheckFailed(true);
      } finally {
        if (!cancelled) setOwnershipLoaded(true);
      }
    }
    checkOwnership();
    return () => {
      cancelled = true;
    };
  }, [product.id, checkoutStatus, checkoutSessionId, externalCheckout]);

  async function claimFreeProduct() {
    if (!user?.email) {
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(buyableUri)}`;
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/digital/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug: product.slug || product.id }),
      });
      const raw = await response.text().catch(() => "");
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = {};
      }
      if (response.status === 401) {
        window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(buyableUri)}`;
        return;
      }
      if (response.ok && json?.ok) {
        window.location.href =
          json.redirectUrl ||
          `/digital/${encodeURIComponent(product.slug || product.id)}`;
      } else {
        setError(
          json?.error ||
            t(
              "shop.claimFailed",
              "Could not claim free access right now. Please try again.",
            ),
        );
      }
    } catch {
      setError(
        t(
          "shop.claimFailed",
          "Could not claim free access right now. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function startCheckout() {
    if (!user?.email) {
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(buyableUri)}`;
      return;
    }
    if (isFreeProduct) {
      await claimFreeProduct();
      return;
    }
    if (!stripeEnabled) {
      setError(t("shop.paymentNotAvailable"));
      return;
    }

    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/digital/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug: product.slug }),
      });
      let json;
      try {
        json = await response.json();
      } catch {
        json = {};
      }
      if (
        response.status === 409 &&
        typeof json?.externalUrl === "string" &&
        json.externalUrl.trim()
      ) {
        window.open(json.externalUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (!response.ok || !json?.ok || !json?.url) {
        setError(json?.error || t("shop.checkoutFailed"));
        return;
      }
      window.location.href = json.url;
    } catch {
      setError(t("shop.checkoutFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6 px-6 py-16">
      <p>
        <Link
          href="/shop"
          className="text-sm text-[var(--color-primary)] hover:underline"
        >
          {t("shop.backToShop")}
        </Link>
      </p>

      {product.imageUrl && !imageBroken ? (
        <Image
          src={product.imageUrl}
          alt={product.name}
          width={1400}
          height={700}
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="max-h-[420px] w-full rounded-lg object-cover"
          onError={() => setImageBroken(true)}
        />
      ) : null}

      <h1 className="text-3xl font-bold">{product.name}</h1>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-amber-50 p-4 shadow-[0_16px_36px_-24px_rgba(15,23,42,0.45)] sm:p-5">
        <div className="rounded-xl border border-white/80 bg-white/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-4">
          <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {productT("shop.productDetailsLabel", "Details")}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 shadow-sm">
              {buyableNoun}
            </span>
            {scheduleLabel ? (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700 shadow-sm">
                {scheduleLabel}
              </span>
            ) : null}
            {product?.venueName ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 shadow-sm">
                {product.venueName}
              </span>
            ) : null}
          </div>
          {product?.venueAddress ? (
            <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              {product.venueAddress}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.45)]">
        <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {productT("shop.descriptionLabel", "Overview")}
        </p>
        <pre
          className="rounded-xl border border-slate-200 bg-slate-50/85 p-4 whitespace-pre-wrap font-serif text-[11pt] leading-relaxed text-[var(--color-foreground)]"
          style={{ wordWrap: "break-word" }}
        >
          {product.description}
        </pre>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.45)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {t("common.price")}
            </p>
            <p className="text-xl font-bold text-slate-900">
              {isFreeProduct
                ? t("shop.freeProduct")
                : `${(product.priceCents / 100).toFixed(2)} ${product.currency}`}
            </p>
          </div>
        </div>

        {checkoutStatus === "success" ? (
          <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {t("shop.paymentSuccess")}
          </p>
        ) : null}
        {checkoutStatus === "cancel" ? (
          <div className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50 p-3">
            <p className="text-yellow-800">{t("shop.paymentCancelledShort")}</p>
            <p className="mt-1 text-sm text-yellow-700">
              {t("shop.paymentCancelledRetry")}
            </p>
          </div>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {externalCheckout
                ? productT("shop.bookingLabel", "Booking")
                : owned
                  ? productT("shop.accessLabel", "Access")
                  : productT("shop.purchaseLabel", "Purchase")}
            </p>
            <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-sm">
              {owned
                ? productT("shop.statusOwned", "Owned")
                : isFreeProduct
                  ? productT("shop.statusFree", "Free")
                  : productT("shop.statusReady", "Available")}
            </span>
          </div>

          {externalCheckout ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <a
                href={product.externalBookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white shop-cta transition-colors hover:bg-slate-800"
              >
                {product.externalBookingLabel ||
                  t("shop.externalBookingCta", "Book externally")}
              </a>
              <p className="text-sm text-slate-600">
                {t(
                  "shop.externalBookingHint",
                  "Booking and payment are completed on an external provider page.",
                )}
              </p>
            </div>
          ) : !ownershipLoaded ? (
            <div className="h-12 w-48 animate-pulse rounded bg-[var(--color-muted)]" />
          ) : accessCheckFailed && user?.email ? (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-5">
              <p className="font-semibold text-amber-900">
                {t("errors.serviceTemporarilyUnavailable")}
              </p>
              <p className="text-sm text-amber-800">{t("errors.accessCheckFailed")}</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href=""
                  className="inline-flex items-center rounded bg-amber-700 px-4 py-2 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-amber-600"
                >
                  {t("errors.tryAgainReload")}
                </a>
                <Link
                  href="/inventory"
                  className="inline-flex items-center rounded border border-amber-400 px-4 py-2 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-amber-900 hover:bg-amber-100"
                >
                  {t("common.inventory", "Inventory")}
                </Link>
              </div>
            </div>
          ) : owned ? (
            boughtUri ? (
              product.productMode === "manual_uri" ? (
                <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/70 p-3">
                  <Link
                    href={boughtUri}
                    className="inline-flex items-center justify-center rounded bg-teal-700 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white shop-cta hover:bg-teal-600"
                  >
                    {productT("shop.openCourse")}
                  </Link>
                  <p className="text-sm text-teal-800">
                    {productT(
                      "shop.openContentHint",
                      "Open the protected content in a new page.",
                    )}
                  </p>
                </div>
              ) : hasInlineViewer ? (
                <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/70 p-3">
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={viewHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded bg-teal-700 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white shop-cta hover:bg-teal-600"
                    >
                      {getInlineViewLabel(viewMode, productLanguage)}
                    </a>
                    <a
                      href={downloadHref}
                      className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      {productT("shop.downloadAsset", "Download")}
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/70 p-3">
                  <a
                    href={downloadHref}
                    className="inline-flex items-center gap-2 rounded bg-teal-700 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white shop-cta hover:bg-teal-600"
                  >
                    {productT("shop.openPurchasedAsset", "Access")}
                  </a>
                  <p className="text-sm text-slate-600">
                    {productT(
                      "shop.downloadOwnedHint",
                      "Download the original file directly to your device.",
                    )}
                  </p>
                </div>
              )
            ) : (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-5">
                <p className="text-teal-800">{t("shop.courseAccessDescSimple")}</p>
              </div>
            )
          ) : isFreeProduct ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <button
                type="button"
                onClick={claimFreeProduct}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded bg-gray-800 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white shop-cta hover:bg-gray-700 disabled:opacity-50"
              >
                {loading && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {loading
                  ? productT("shop.claimingFree")
                  : productT("shop.claimFree")}
              </button>
              <p className="text-sm text-slate-600">
                {productT(
                  "shop.freeAccessHint",
                  "Claim access now and keep it in your account.",
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <button
                type="button"
                onClick={startCheckout}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded bg-gray-800 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-white shop-cta hover:bg-gray-700 disabled:opacity-50"
              >
                {loading && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {loading
                  ? productT("shop.sendingToStripe")
                  : productT("shop.buyProduct")}
              </button>
              <p className="text-sm text-slate-600">
                {productT(
                  "shop.purchaseHint",
                  "Complete checkout to unlock access in your account.",
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
