import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/adminRoute";
import { getStripeSecretKey } from "@/lib/stripe";

export const runtime = "nodejs";

async function getStripe() {
  const key = await getStripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return new Stripe(key, { apiVersion: "2024-12-18" });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const paymentIntentId = (body?.paymentIntentId || "").trim();
    const chargeId = (body?.chargeId || "").trim();
    const id = paymentIntentId || chargeId;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "paymentIntentId (pi_…) or chargeId (ch_…) required",
        },
        { status: 400 },
      );
    }

    const stripe = await getStripe();
    const params = paymentIntentId
      ? { payment_intent: paymentIntentId }
      : { charge: chargeId };
    const refund = await stripe.refunds.create(params);

    return NextResponse.json({
      ok: true,
      refund: {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
      },
    });
  } catch (error) {
    console.error("Refund error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Refund failed" },
      { status: 500 },
    );
  }
}
