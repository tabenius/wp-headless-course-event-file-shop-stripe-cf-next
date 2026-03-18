import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/adminRoute";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return new Stripe(key, { apiVersion: "2024-12-18" });
}

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || 20), 100);

    // List recent payment intents (succeeds and requires no email filter)
    const intents = await stripe.paymentIntents.list({ limit, expand: ["data.charges"] });

    // Optionally filter by receipt_email
    const filtered = email
      ? intents.data.filter((pi) =>
          pi.charges?.data?.some((c) => (c.receipt_email || "").toLowerCase() === email.toLowerCase()),
        )
      : intents.data;

    const results = filtered.map((pi) => {
      const charge = pi.charges?.data?.[0];
      return {
        id: pi.id,
        amount: pi.amount_received || pi.amount,
        currency: pi.currency,
        status: pi.status,
        created: pi.created * 1000,
        email: charge?.receipt_email || null,
        receiptUrl: charge?.receipt_url || null,
        description: charge?.description || pi.description || "",
      };
    });

    return NextResponse.json({ ok: true, payments: results.slice(0, limit) });
  } catch (error) {
    console.error("admin payments error", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.generic", "Payment lookup failed") },
      { status: 500 },
    );
  }
}
