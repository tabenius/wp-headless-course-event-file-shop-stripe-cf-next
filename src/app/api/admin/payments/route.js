import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/adminRoute";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";

const stripeVersion = "2024-12-18";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return new Stripe(key, { apiVersion: stripeVersion });
}

async function compilePayments(email, limit) {
  const stripe = getStripe();
  const intents = await stripe.paymentIntents.list({
    limit,
    expand: ["data.charges"],
  });
  const normalized = intents.data.map((pi) => {
    const charge = pi.charges?.data?.[0];
    return {
      id: pi.id,
      amount: pi.amount_received || pi.amount,
      currency: pi.currency,
      status: pi.status,
      created: pi.created * 1000,
      email: charge?.receipt_email || null,
      receiptUrl: charge?.receipt_url || null,
      receiptId: charge?.id,
      description: charge?.description || pi.description || "",
    };
  });
  if (!email) return normalized;
  const lower = email.toLowerCase();
  return normalized.filter((r) => (r.email || "").toLowerCase() === lower);
}

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || 20), 100);
    const payments = await compilePayments(email, limit);
    return NextResponse.json({ ok: true, payments: payments.slice(0, limit) });
  } catch (error) {
    console.error("admin payments error", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.generic", "Payment lookup failed") },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const chargeId = body?.chargeId || body?.id;
    if (!chargeId) {
      return NextResponse.json({ ok: false, error: "Charge ID required" }, { status: 400 });
    }
    const stripe = getStripe();
    const charge = await stripe.charges.retrieve(chargeId);
    const receiptUrl = charge?.receipt_url;
    if (!receiptUrl) {
      return NextResponse.json({ ok: false, error: "Receipt URL missing" }, { status: 404 });
    }
    const res = await fetch(receiptUrl, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Unable to fetch receipt (${res.status})` },
        { status: 502 },
      );
    }
    const pdf = await res.arrayBuffer();
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${chargeId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("receipt proxy error", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.generic", "Receipt download failed") },
      { status: 500 },
    );
  }
}
