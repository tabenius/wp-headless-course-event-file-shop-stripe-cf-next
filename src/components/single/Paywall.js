"use client";

import { useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { transformContent } from "@/lib/transformContent";
import { decodeEntities } from "@/lib/decodeEntities";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Paywall({
  courseUri,
  courseTitle,
  courseContent,
  coursePriceRendered,
  courseDuration,
  courseImage,
  userEmail,
  priceCents,
  currency,
  stripeEnabled,
  contentKind = "course",
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestEmailConfirm, setGuestEmailConfirm] = useState("");
  const [imageBroken, setImageBroken] = useState(false);
  const isLoggedIn = Boolean(userEmail);
  const kindLabel =
    contentKind === "event"
      ? t("common.event").toLowerCase()
      : contentKind === "product"
        ? t("common.product").toLowerCase()
        : t("common.course").toLowerCase();

  // Checkout requires a positive price configured in admin
  const canBuy =
    stripeEnabled && typeof priceCents === "number" && priceCents > 0;

  // Normalize all prices to "750 SEK" format
  function normalizePrice() {
    if (priceCents != null && priceCents > 0) {
      return `${(priceCents / 100).toFixed(0)} ${(currency || "SEK").toUpperCase()}`;
    }
    if (coursePriceRendered) {
      const decoded = decodeEntities(coursePriceRendered).replace(
        /&nbsp;/g,
        " ",
      );
      const num = parseFloat(
        decoded.replace(/[^0-9.,]/g, "").replace(",", "."),
      );
      if (Number.isFinite(num) && num > 0) {
        return `${Math.round(num)} ${(currency || "SEK").toUpperCase()}`;
      }
      return decoded;
    }
    return "";
  }
  const displayPrice = normalizePrice();

  const buyLabel = loading
    ? t("paywall.redirectingToStripe")
    : contentKind === "event"
      ? t("paywall.payAndUnlockEvent")
      : contentKind === "product"
        ? t("paywall.payAndUnlockProduct")
        : t("paywall.payAndUnlockCourse");

  async function checkout(emailOverride) {
    setError("");
    if (!stripeEnabled) {
      setError(t("paywall.paymentNotAvailable"));
      return;
    }

    const email = emailOverride || undefined;

    setLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentUri: courseUri,
          contentTitle: courseTitle,
          contentKind,
          ...(email ? { guestEmail: email } : {}),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok || !json?.url) {
        setError(json?.error || t("paywall.checkoutFailed"));
        setLoading(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError(t("paywall.checkoutFailed"));
      setLoading(false);
    }
  }

  function handleGuestCheckout() {
    const email = guestEmail.trim().toLowerCase();
    const confirm = guestEmailConfirm.trim().toLowerCase();

    if (!email || !EMAIL_REGEX.test(email)) {
      setError(t("paywall.emailRequired"));
      return;
    }
    if (email !== confirm) {
      setError(t("paywall.emailMismatch"));
      return;
    }
    checkout(email);
  }

  return (
    <article className="mx-auto max-w-2xl space-y-6 px-6 py-24 text-[var(--color-foreground)]">
      {courseImage && !imageBroken && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={courseImage}
            alt={courseTitle || ""}
            className="max-h-64 rounded-lg shadow-md object-cover"
            onError={() => setImageBroken(true)}
          />
        </div>
      )}
      <h1 className="text-4xl font-bold text-center">
        {courseTitle || t("paywall.content")}
      </h1>

      {(displayPrice || courseDuration) && (
        <div className="flex justify-center gap-6 text-lg text-[var(--color-foreground)]">
          {displayPrice && (
            <span>
              <strong>{t("paywall.fee")}:</strong> {displayPrice}
            </span>
          )}
          {courseDuration && !/^0\s/.test(courseDuration) && (
            <span>
              <strong>{t("paywall.duration")}:</strong> {courseDuration}
            </span>
          )}
        </div>
      )}

      {courseContent && (
        <div
          className="prose prose-p:my-4 max-w-none wp-content text-xl text-[var(--color-foreground)]"
          dangerouslySetInnerHTML={{ __html: transformContent(courseContent) }}
        />
      )}

      <div className="space-y-4 border-t border-[var(--color-muted)] pt-4 text-center">
        {!canBuy ? (
          <p className="italic text-[var(--color-foreground)]">
            {t("paywall.priceNotConfigured")}
          </p>
        ) : isLoggedIn ? (
          <>
            <p className="text-[var(--color-foreground)]">
              {t("paywall.loggedInNeedPurchase", {
                email: userEmail,
                contentKind: kindLabel,
              })}
            </p>
            <button
              type="button"
              onClick={() => checkout()}
              disabled={loading}
              className="px-8 py-3 rounded bg-[var(--color-primary)] hover:opacity-85 disabled:opacity-50 inline-flex items-center gap-2"
              style={{ color: "#fff" }}
            >
              {loading && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {buyLabel}
            </button>
          </>
        ) : (
          <div className="max-w-md mx-auto space-y-4">
            <p className="text-sm text-[var(--color-foreground)]">
              {t("paywall.guestBuyHint")}
            </p>

            <div className="space-y-3">
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder={t("paywall.enterEmail")}
                className="w-full rounded border border-[var(--color-muted)] bg-[var(--color-background)] px-4 py-3 text-center text-[var(--color-foreground)] placeholder:text-[var(--color-foreground)]"
                autoComplete="email"
              />
              <input
                type="email"
                value={guestEmailConfirm}
                onChange={(e) => setGuestEmailConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGuestCheckout()}
                placeholder={t("paywall.confirmEmail")}
                className="w-full rounded border border-[var(--color-muted)] bg-[var(--color-background)] px-4 py-3 text-center text-[var(--color-foreground)] placeholder:text-[var(--color-foreground)]"
                autoComplete="email"
              />
            </div>

            <button
              type="button"
              onClick={handleGuestCheckout}
              disabled={loading}
              className="w-full px-8 py-3 rounded bg-[var(--color-primary)] hover:opacity-85 disabled:opacity-50 text-lg inline-flex items-center justify-center gap-2"
              style={{ color: "#fff" }}
            >
              {loading && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {buyLabel}
            </button>

            <p className="text-sm text-[var(--color-foreground)]">
              {t("paywall.alreadyHaveAccount")}{" "}
              <Link
                href={`/auth/signin?callbackUrl=${encodeURIComponent(courseUri)}`}
                className="text-[var(--color-primary)] underline"
              >
                {t("common.signIn")}
              </Link>
            </p>
          </div>
        )}

        {error ? <p className="text-red-600">{error}</p> : null}
      </div>
    </article>
  );
}
