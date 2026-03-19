"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { t } from "@/lib/i18n";

function formatPrice(priceCents, currency) {
  return `${(priceCents / 100).toFixed(0)} ${String(currency || "SEK").toUpperCase()}`;
}

export default function ShopProductDetail({
  user,
  product,
  owned,
  stripeEnabled,
  checkoutStatus,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageBroken, setImageBroken] = useState(false);

  async function startCheckout() {
    if (!user?.email) {
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(`/shop/${product.slug}`)}`;
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
        <Link href="/shop" className="text-sm text-teal-800 hover:underline">
          {t("shop.backToShop")}
        </Link>
      </p>

      {product.imageUrl && !imageBroken ? (
        <Image
          src={product.imageUrl}
          alt={product.name}
          width={1400}
          height={700}
          unoptimized
          className="w-full max-h-[420px] object-cover rounded-lg"
          onError={() => setImageBroken(true)}
        />
      ) : null}

      <h1 className="text-3xl font-bold">{product.name}</h1>
      <p className="text-gray-600">{product.description}</p>
      <p className="text-gray-700 font-semibold">
        {t("common.price")}: {formatPrice(product.priceCents, product.currency)}
      </p>

      {checkoutStatus === "success" ? (
        <p className="text-green-700">{t("shop.paymentSuccess")}</p>
      ) : null}
      {checkoutStatus === "cancel" ? (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-yellow-800">{t("shop.paymentCancelledShort")}</p>
          <p className="text-yellow-700 text-sm mt-1">
            {t("shop.paymentCancelledRetry")}
          </p>
        </div>
      ) : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {owned ? (
        product.type === "digital_file" ? (
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
