"use client";

import { useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";

export default function Paywall({
  courseUri,
  courseTitle,
  courseContent,
  coursePriceRendered,
  courseDuration,
  userEmail,
  priceCents,
  currency,
  stripeEnabled,
  contentKind = "course",
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isLoggedIn = Boolean(userEmail);
  const kindLabel = contentKind === "event"
    ? t("common.event").toLowerCase()
    : t("common.course").toLowerCase();

  // Show LP price if available, otherwise fall back to access config price
  const displayPrice = coursePriceRendered
    || (priceCents != null ? `${(priceCents / 100).toFixed(2)} ${currency.toUpperCase()}` : "");

  async function checkout() {
    setError("");
    if (!stripeEnabled) {
      setError(t("paywall.paymentNotAvailable"));
      return;
    }
    setLoading(true);
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentUri: courseUri,
        contentTitle: courseTitle,
        contentKind,
      }),
    });
    const json = await response.json();
    setLoading(false);
    if (!response.ok || !json?.ok || !json?.url) {
      setError(json?.error || t("paywall.checkoutFailed"));
      return;
    }
    window.location.href = json.url;
  }

  return (
    <article className="max-w-2xl mx-auto px-6 py-24 space-y-6">
      <h1 className="text-4xl font-bold text-center">{courseTitle || t("paywall.content")}</h1>

      {(displayPrice || courseDuration) && (
        <div className="flex justify-center gap-6 text-lg text-gray-700">
          {displayPrice && (
            <span><strong>{t("paywall.fee")}:</strong> {displayPrice}</span>
          )}
          {courseDuration && (
            <span><strong>{t("paywall.duration")}:</strong> {courseDuration}</span>
          )}
        </div>
      )}

      {courseContent && (
        <div
          className="text-gray-800 prose prose-p:my-4 max-w-none wp-content text-xl"
          dangerouslySetInnerHTML={{ __html: courseContent }}
        />
      )}

      <div className="text-center space-y-4 pt-4 border-t">
        {isLoggedIn ? (
          <>
            <p className="text-gray-700">
              {t("paywall.loggedInAs", { email: userEmail, contentKind: kindLabel })}
            </p>
            <button
              type="button"
              onClick={checkout}
              disabled={loading}
              className="px-8 py-3 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading
                ? t("paywall.redirectingToStripe")
                : contentKind === "event" ? t("paywall.payAndUnlockEvent") : t("paywall.payAndUnlockCourse")}
            </button>
          </>
        ) : (
          <Link
            href={`/auth/signin?callbackUrl=${encodeURIComponent(courseUri)}`}
            className="inline-block px-8 py-3 rounded bg-gray-800 text-white hover:bg-gray-700"
          >
            {t("paywall.buyNow")}
          </Link>
        )}

        {error ? <p className="text-red-600">{error}</p> : null}
      </div>
    </article>
  );
}
