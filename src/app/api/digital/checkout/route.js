import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDigitalProductBySlug } from "@/lib/digitalProducts";
import { createStripePaymentSession, isStripeEnabled } from "@/lib/stripe";
import { t } from "@/lib/i18n";

function hasExternalBooking(product) {
  return (
    product?.externalBookingEnabled === true &&
    typeof product?.externalBookingUrl === "string" &&
    product.externalBookingUrl.trim().length > 0
  );
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.loginRequired") },
      { status: 401 },
    );
  }
  if (!isStripeEnabled()) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.stripeUnavailable") },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const productSlug =
      typeof body?.productSlug === "string" ? body.productSlug.trim() : "";
    if (!productSlug) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.productNotReady") },
        { status: 400 },
      );
    }

    const product = await getDigitalProductBySlug(productSlug);
    if (!product || !product.active || product.priceCents <= 0) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.productNotAvailable") },
        { status: 400 },
      );
    }
    if (hasExternalBooking(product)) {
      return NextResponse.json(
        {
          ok: false,
          error: t(
            "apiErrors.externalBookingOnly",
            "This item uses external booking and cannot be purchased here.",
          ),
          externalUrl: product.externalBookingUrl,
        },
        { status: 409 },
      );
    }

    const baseUrl = new URL(request.url).origin;
    const buyablePath =
      product.productMode === "asset" && product.assetId
        ? `/shop/${encodeURIComponent(product.assetId)}`
        : `/shop/${encodeURIComponent(product.slug)}`;
    const successUrl = `${baseUrl}${buyablePath}?checkout=success&product_id=${encodeURIComponent(product.id)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}${buyablePath}?checkout=cancel&product_id=${encodeURIComponent(product.id)}`;
    const purchaseKind =
      product.productMode === "asset"
        ? "asset_product"
        : product.type === "course"
          ? "course_product"
          : "digital_file";

    const checkout = await createStripePaymentSession({
      itemName: product.name,
      description: `Digital product: ${product.name || product.id}`,
      priceCents: product.priceCents,
      currency: product.currency,
      email: session.user.email,
      successUrl,
      cancelUrl,
      metadata: {
        purchase_kind: purchaseKind,
        digital_product_id: product.id,
        product_name: product.name || "",
        product_slug: product.slug || "",
        ...(product.assetId ? { asset_id: product.assetId } : {}),
        ...(typeof product.vatPercent === "number" &&
        Number.isFinite(product.vatPercent)
          ? { vat_percent: String(product.vatPercent) }
          : {}),
        ...(product.contentUri ? { course_uri: product.contentUri } : {}),
      },
    });

    return NextResponse.json({ ok: true, url: checkout.url, id: checkout.id });
  } catch (error) {
    console.error("Digital checkout failed:", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.checkoutFailed") },
      { status: 400 },
    );
  }
}
