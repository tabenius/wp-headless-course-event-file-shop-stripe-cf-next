import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { grantCourseAccess } from "@/lib/courseAccess";
import { fetchStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: "Du behöver vara inloggad för att verifiera betalning." },
      { status: 401 },
    );
  }
  if (!isStripeEnabled()) {
    console.error("Stripe confirmation unavailable: STRIPE_SECRET_KEY is not configured");
    return NextResponse.json(
      { ok: false, error: "Betalningsverifiering är tillfälligt otillgänglig." },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    const courseUri =
      typeof body?.contentUri === "string"
        ? body.contentUri
        : typeof body?.courseUri === "string"
          ? body.courseUri
          : "";
    if (!sessionId || !courseUri) {
      console.error("Stripe confirmation rejected: missing session ID or course URI");
      return NextResponse.json(
        { ok: false, error: "Vi kunde inte verifiera dina betalningsuppgifter." },
        { status: 400 },
      );
    }

    const stripeSession = await fetchStripeCheckoutSession(sessionId);
    const paymentStatus = stripeSession?.payment_status;
    const paidEmail = (
      stripeSession?.customer_details?.email ||
      stripeSession?.metadata?.user_email ||
      ""
    ).toLowerCase();
    const paidCourse = stripeSession?.metadata?.course_uri || "";

    if (paymentStatus !== "paid") {
      return NextResponse.json(
        { ok: false, error: "Din betalning är inte slutförd ännu." },
        { status: 400 },
      );
    }
    if (paidEmail !== session.user.email.toLowerCase()) {
      console.error(
        `Stripe confirmation email mismatch: paid=${paidEmail}, session=${session.user.email}`,
      );
      return NextResponse.json(
        { ok: false, error: "Betalningen matchar inte ditt inloggade konto." },
        { status: 400 },
      );
    }
    if (paidCourse !== courseUri) {
      console.error(
        `Stripe confirmation course mismatch: paid=${paidCourse}, requested=${courseUri}`,
      );
      return NextResponse.json(
        { ok: false, error: "Betalningen gäller en annan kurs." },
        { status: 400 },
      );
    }

    await grantCourseAccess(courseUri, session.user.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Stripe confirmation failed:", error);
    return NextResponse.json(
      { ok: false, error: "Vi kunde inte bekräfta betalningen just nu. Försök igen." },
      { status: 400 },
    );
  }
}
