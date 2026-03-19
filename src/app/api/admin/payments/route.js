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

async function compilePayments(email, limit, fromTs) {
  const stripe = getStripe();
  const listParams = { limit };
  if (fromTs) listParams.created = { gte: fromTs };

  let charges;
  if (email) {
    // Look up by customer email for reliable matching
    const customers = await stripe.customers.list({
      email: email.toLowerCase(),
      limit: 5,
    });
    if (customers.data.length === 0) return [];
    const all = await Promise.all(
      customers.data.map((c) =>
        stripe.charges.list({ customer: c.id, ...listParams }),
      ),
    );
    charges = all.flatMap((r) => r.data);
    charges.sort((a, b) => b.created - a.created);
    charges = charges.slice(0, limit);
  } else {
    const result = await stripe.charges.list(listParams);
    charges = result.data;
  }

  return charges.map((charge) => ({
    id: charge.payment_intent || charge.id,
    amount: charge.amount,
    currency: charge.currency,
    status: charge.status,
    created: charge.created * 1000,
    email:
      charge.receipt_email || charge.billing_details?.email || email || null,
    receiptUrl: charge.receipt_url || null,
    receiptId: charge.id,
    description: charge.description || "",
  }));
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || 20), 100);
    const fromTs = searchParams.get("from")
      ? Number(searchParams.get("from"))
      : undefined;
    const payments = await compilePayments(email, limit, fromTs);
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
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const chargeId = body?.chargeId || body?.id;
    if (!chargeId) {
      return NextResponse.json(
        { ok: false, error: "Charge ID required" },
        { status: 400 },
      );
    }
    const stripe = getStripe();
    const charge = await stripe.charges.retrieve(chargeId);
    const receiptUrl = charge?.receipt_url;
    if (!receiptUrl) {
      return NextResponse.json(
        { ok: false, error: "Receipt URL missing" },
        { status: 404 },
      );
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
