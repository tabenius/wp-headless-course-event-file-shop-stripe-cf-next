"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { t } from "@/lib/i18n";

function formatPrice(priceCents, currency) {
  if (!priceCents || priceCents <= 0) return null;
  return `${(priceCents / 100).toFixed(0)} ${String(currency || "SEK").toUpperCase()}`;
}

function typeLabel(item) {
  switch (item.type) {
    case "product": return t("shop.typeProduct", "Produkt");
    case "course": return t("shop.typeCourse");
    case "event": return t("shop.typeEvent", "Event");
    case "digital_file": return t("shop.typeDigitalFile");
    case "digital_course": return t("shop.typeCourse");
    default: return "";
  }
}

function typeBadgeColor(item) {
  switch (item.type) {
    case "product": return "bg-blue-100 text-blue-800";
    case "course": return "bg-green-100 text-green-800";
    case "event": return "bg-amber-100 text-amber-800";
    case "digital_file": return "bg-purple-100 text-purple-800";
    case "digital_course": return "bg-green-100 text-green-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

export default function ShopIndex({
  user,
  items,
  ownedProductIds,
  ownedUris,
  stripeEnabled,
  checkoutStatus,
}) {
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");

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
    const response = await fetch("/api/digital/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productSlug }),
    });
    const json = await response.json();
    setLoadingId("");
    if (!response.ok || !json?.ok || !json?.url) {
      setError(json?.error || t("shop.checkoutFailed"));
      return;
    }
    window.location.href = json.url;
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
        <p className="text-gray-600 mt-2">{t("shop.subtitle")}</p>
      </div>

      {checkoutStatus === "success" && (
        <p className="text-green-700">{t("shop.paymentSuccess")}</p>
      )}
      {checkoutStatus === "cancel" && (
        <p className="text-yellow-700">{t("shop.paymentCancelled")}</p>
      )}
      {error && <p className="text-red-600">{error}</p>}

      {items.length === 0 && (
        <p className="text-gray-500">{t("shop.noProducts", "Inga produkter tillgängliga just nu.")}</p>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => {
          const owned = isOwned(item);
          const loading = loadingId === item.slug;
          const isDigital = item.source === "digital";
          const priceDisplay =
            formatPrice(item.priceCents, item.currency) ||
            item.price ||
            "";

          return (
            <article
              key={item.id}
              className="border rounded-lg bg-white overflow-hidden flex flex-col"
            >
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  width={1200}
                  height={600}
                  unoptimized
                  className="w-full h-44 object-cover"
                />
              ) : (
                <div className="w-full h-44 bg-gray-100 flex items-center justify-center text-gray-300">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-12 h-12">
                    <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L2.5 11.06zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}

              <div className="p-5 space-y-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-xl font-semibold">{item.name}</h2>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${typeBadgeColor(item)}`}>
                    {typeLabel(item)}
                  </span>
                </div>

                {item.description && (
                  <p className="text-gray-700 line-clamp-3 text-sm">{item.description}</p>
                )}
                {item.duration && (
                  <p className="text-xs text-gray-500">{item.duration}</p>
                )}

                <div className="mt-auto pt-3">
                  {priceDisplay && (
                    <p className="text-gray-800 font-semibold mb-3">{priceDisplay}</p>
                  )}

                  <div className="flex gap-2 items-center">
                    <Link
                      href={item.uri}
                      className="px-3 py-2 rounded border hover:bg-gray-50 text-sm"
                    >
                      {t("common.view")}
                    </Link>
                    {owned ? (
                      <span className="text-green-700 text-sm font-semibold">
                        {t("shop.purchased")}
                      </span>
                    ) : isDigital ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => startDigitalCheckout(item.slug)}
                        className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50 text-sm"
                      >
                        {loading ? t("shop.sending") : t("common.buy")}
                      </button>
                    ) : (
                      <Link
                        href={item.uri}
                        className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700 text-sm"
                      >
                        {t("common.buy")}
                      </Link>
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
