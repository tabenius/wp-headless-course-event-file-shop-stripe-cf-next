"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n";

function formatPrice(priceCents, currency) {
  return `${(priceCents / 100).toFixed(0)} ${String(currency || "SEK").toUpperCase()}`;
}

function deriveBuyableUri(product) {
  if (product?.productMode === "asset" && product?.assetId) {
    return `/shop/${encodeURIComponent(product.assetId)}`;
  }
  return `/shop/${encodeURIComponent(product?.slug || "")}`;
}

function deriveBoughtUri(product) {
  if (product?.productMode === "asset" && product?.assetId) {
    return `/inventory/${encodeURIComponent(product.assetId)}`;
  }
  return "";
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
  const boughtUri = deriveBoughtUri(product);

  const checkoutStatus = searchParams.get("checkout") || "";
  const checkoutSessionId = searchParams.get("session_id") || "";

  useEffect(() => {
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
  }, [product.id, checkoutStatus, checkoutSessionId]);

  async function startCheckout() {
    if (!user?.email) {
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(buyableUri)}`;
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
    <section className="max-w-4xl mx-auto px-6 py-16 space-y-6">
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
          className="w-full max-h-[420px] object-cover rounded-lg"
          onError={() => setImageBroken(true)}
        />
      ) : null}

      <h1 className="text-3xl font-bold">{product.name}</h1>
      <p className="text-[var(--color-foreground)]">{product.description}</p>
      <p className="font-semibold text-[var(--color-foreground)]">
        {t("common.price")}: {formatPrice(product.priceCents, product.currency)}
      </p>

      {checkoutStatus === "success" ? (
        <p className="text-green-700 dark:text-green-300">
          {t("shop.paymentSuccess")}
        </p>
      ) : null}
      {checkoutStatus === "cancel" ? (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-yellow-800">{t("shop.paymentCancelledShort")}</p>
          <p className="text-yellow-700 text-sm mt-1">
            {t("shop.paymentCancelledRetry")}
          </p>
        </div>
      ) : null}
      {error ? <p className="text-red-600 dark:text-red-300">{error}</p> : null}

      {!ownershipLoaded ? (
        <div className="h-12 w-48 animate-pulse rounded bg-[var(--color-muted)]" />
      ) : accessCheckFailed && user?.email ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 space-y-3">
          <p className="font-semibold text-amber-900">
            {t("errors.serviceTemporarilyUnavailable")}
          </p>
          <p className="text-amber-800 text-sm">
            {t("errors.accessCheckFailed")}
          </p>
          <a
            href=""
            className="inline-block px-4 py-2 rounded bg-amber-700 text-white text-sm hover:bg-amber-600"
          >
            {t("errors.tryAgainReload")}
          </a>
        </div>
      ) : owned ? (
        product.productMode === "asset" && boughtUri ? (
          <Link
            href={boughtUri}
            className="inline-block px-5 py-3 rounded bg-teal-700 text-white shop-cta hover:bg-teal-600"
          >
            {t("shop.openPurchasedAsset", "Open purchased asset")}
          </Link>
        ) : product.type === "digital_file" ? (
          <a
            href={`/api/digital/download?productId=${encodeURIComponent(product.id)}`}
            className="inline-block px-5 py-3 rounded bg-teal-700 text-white shop-cta hover:bg-teal-600"
          >
            {t("shop.downloadFile")}
          </a>
        ) : (
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-5 space-y-4">
            <h2 className="text-xl font-semibold text-teal-900">
              {t("shop.courseAccessTitle")}
            </h2>
            <p className="text-teal-800">{t("shop.courseAccessDescSimple")}</p>
            {product.courseUri && (
              <Link
                href={product.courseUri}
                className="inline-block px-5 py-3 rounded bg-teal-700 text-white shop-cta hover:bg-teal-600 font-semibold"
              >
                {t("shop.openCourse")}
              </Link>
            )}
          </div>
        )
      ) : (
        <button
          type="button"
          onClick={startCheckout}
          disabled={loading}
          className="px-5 py-3 rounded bg-gray-800 text-white shop-cta hover:bg-gray-700 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading && (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? t("shop.sendingToStripe") : t("shop.buyProduct")}
        </button>
      )}
    </section>
  );
}
