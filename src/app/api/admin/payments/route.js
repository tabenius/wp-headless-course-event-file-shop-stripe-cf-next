import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { t } from "@/lib/i18n";
import { compilePayments, fetchStripeCharge } from "@/lib/stripePayments";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  if (!stripeConfigured) {
    return NextResponse.json({
      ok: true,
      payments: [],
      stripeConfigured: false,
      emptyReason: "stripe_not_configured",
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const emailParam = searchParams.get("email");
    const email = emailParam ? emailParam.trim().toLowerCase() : undefined;
    const limitParam = searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : Number.NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 20;
    const fromParam = searchParams.get("from");
    const parsedFrom = fromParam ? Number.parseInt(fromParam, 10) : Number.NaN;
    const fromTs =
      Number.isFinite(parsedFrom) && parsedFrom > 0 ? parsedFrom : undefined;
    const payments = await compilePayments(email, limit, fromTs);
    const rows = payments.slice(0, limit);
    return NextResponse.json({
      ok: true,
      payments: rows,
      stripeConfigured: true,
      emptyReason: rows.length === 0 ? "no_sales_data" : null,
    });
  } catch (error) {
    console.error("admin payments error", error);
    const stripeType = String(error?.type || "");
    let code = "stripe_lookup_failed";
    let errorMessage = error?.message || "Payment lookup failed";

    if (stripeType === "StripeAuthenticationError") {
      code = "stripe_auth_failed";
      errorMessage = t(
        "apiErrors.stripeAuthFailed",
        "Stripe authentication failed. Check STRIPE_SECRET_KEY.",
      );
    } else if (stripeType === "StripePermissionError") {
      code = "stripe_permission_failed";
      errorMessage = t(
        "apiErrors.stripePermissionFailed",
        "Stripe key lacks permission to list charges.",
      );
    } else if (stripeType === "StripeConnectionError") {
      code = "stripe_connection_failed";
      errorMessage = t(
        "apiErrors.stripeConnectionFailed",
        "Could not reach Stripe API. Check network connectivity and retry.",
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
        stripeConfigured,
        code,
      },
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
    const charge = await fetchStripeCharge(chargeId);
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
