import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCourseAccessConfig } from "@/lib/courseAccess";
import { createStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: "Du behöver vara inloggad för att betala." },
      { status: 401 },
    );
  }
  if (!isStripeEnabled()) {
    console.error("Stripe checkout unavailable: STRIPE_SECRET_KEY is not configured");
    return NextResponse.json(
      { ok: false, error: "Onlinebetalning är tillfälligt otillgänglig." },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const courseUri =
      typeof body?.contentUri === "string"
        ? body.contentUri
        : typeof body?.courseUri === "string"
          ? body.courseUri
          : "";
    const courseTitle =
      typeof body?.contentTitle === "string"
        ? body.contentTitle
        : typeof body?.courseTitle === "string"
          ? body.courseTitle
          : "";
    const contentKind = body?.contentKind === "event" ? "event" : "course";
    if (!courseUri) {
      console.error("Stripe checkout request rejected: missing content URI");
      return NextResponse.json(
        { ok: false, error: "Innehållet kunde inte förberedas för betalning." },
        { status: 400 },
      );
    }
    const config = await getCourseAccessConfig(courseUri);
    const priceCents = config?.priceCents ?? 0;
    const currency = (config?.currency || "SEK").toUpperCase();
    if (priceCents <= 0) {
      console.error(
        `Stripe checkout unavailable for ${courseUri}: missing or invalid course price`,
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            contentKind === "event"
              ? "Händelsen är inte tillgänglig för betalning just nu."
              : "Kursen är inte tillgänglig för betalning just nu.",
        },
        { status: 400 },
      );
    }

    const baseUrl = new URL(request.url).origin;
    const successUrl = `${baseUrl}${courseUri}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}${courseUri}?checkout=cancel`;
    const checkout = await createStripeCheckoutSession({
      courseUri,
      courseTitle,
      priceCents,
      currency,
      email: session.user.email,
      successUrl,
      cancelUrl,
    });
    return NextResponse.json({ ok: true, url: checkout.url, id: checkout.id });
  } catch (error) {
    console.error("Stripe checkout failed:", error);
    return NextResponse.json(
      { ok: false, error: "Det gick inte att starta betalningen just nu. Försök igen snart." },
      { status: 400 },
    );
  }
}
