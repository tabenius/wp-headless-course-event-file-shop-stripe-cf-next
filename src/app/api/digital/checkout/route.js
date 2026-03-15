import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDigitalProductBySlug } from "@/lib/digitalProducts";
import { createStripePaymentSession, isStripeEnabled } from "@/lib/stripe";
import { t } from "@/lib/i18n";

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
    const productSlug = typeof body?.productSlug === "string" ? body.productSlug.trim() : "";
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

    const baseUrl = new URL(request.url).origin;
    const successUrl = `${baseUrl}/shop?checkout=success&product_id=${encodeURIComponent(product.id)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/shop?checkout=cancel&product_id=${encodeURIComponent(product.id)}`;

    const checkout = await createStripePaymentSession({
      itemName: product.name,
      priceCents: product.priceCents,
      currency: product.currency,
      email: session.user.email,
      successUrl,
      cancelUrl,
      metadata: {
        purchase_kind: product.type === "course" ? "course_product" : "digital_file",
        digital_product_id: product.id,
        product_name: product.name || "",
        ...(product.courseUri ? { course_uri: product.courseUri } : {}),
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
