import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { t } from "@/lib/i18n";
import { getStripe, compilePayments } from "@/lib/stripePayments";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || undefined;
    const limitRaw = Number(searchParams.get("limit"));
    const limit = Math.min(limitRaw > 0 ? limitRaw : 20, 100);
    const fromTs = searchParams.get("from")
      ? Number(searchParams.get("from"))
      : undefined;
    const payments = await compilePayments(email, limit, fromTs);
    return NextResponse.json({ ok: true, payments: payments.slice(0, limit) });
  } catch (error) {
    console.error("admin payments error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Payment lookup failed" },
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
