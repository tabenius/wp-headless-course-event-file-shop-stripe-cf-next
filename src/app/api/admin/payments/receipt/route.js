/**
 * GET /api/admin/payments/receipt?chargeId=ch_xxx[&format=html|json]
 *
 * Fetches structured receipt data from Stripe (Charge + optional Customer
 * + optional Invoice) and returns it as either a self-contained HTML page
 * (default) or raw JSON.  Always succeeds for any Stripe charge — no PDF
 * extraction heuristics needed.
 *
 * The HTML format is designed to be printable (File → Print → Save as PDF).
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getStripeSecretKey } from "@/lib/stripe";

export const runtime = "nodejs";

// ─── Stripe fetch helpers ─────────────────────────────────────────────────────

async function stripeKey() {
  const key = await getStripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

async function stripeGet(path) {
  const key = await stripeKey();
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(
      json?.error?.message || `Stripe ${response.status}: ${path}`,
    );
  }
  return response.json();
}

// ─── Receipt data assembly ────────────────────────────────────────────────────

/**
 * Fetch all Stripe data needed to render a receipt.
 * Returns null fields for optional resources (customer, invoice) when absent.
 */
async function fetchReceiptData(chargeId) {
  const charge = await stripeGet(`/v1/charges/${encodeURIComponent(chargeId)}`);

  const [customer, invoice] = await Promise.all([
    typeof charge.customer === "string"
      ? stripeGet(`/v1/customers/${encodeURIComponent(charge.customer)}`).catch(
          () => null,
        )
      : Promise.resolve(null),
    typeof charge.invoice === "string"
      ? stripeGet(`/v1/invoices/${encodeURIComponent(charge.invoice)}`).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);

  // Card / payment method details
  const card = charge.payment_method_details?.card;
  const paymentMethod = card
    ? {
        type: "card",
        brand: card.brand || "",
        last4: card.last4 || "",
        expMonth: card.exp_month || null,
        expYear: card.exp_year || null,
        funding: card.funding || "",
        country: card.country || "",
      }
    : { type: charge.payment_method_details?.type || "other" };

  // Billing info — prefer invoice customer fields, then charge billing_details, then customer
  const billingName =
    invoice?.customer_name ||
    charge.billing_details?.name ||
    customer?.name ||
    "";
  const billingEmail =
    charge.receipt_email ||
    invoice?.customer_email ||
    charge.billing_details?.email ||
    customer?.email ||
    "";
  const billingAddress =
    invoice?.customer_address ||
    charge.billing_details?.address ||
    customer?.address ||
    null;

  // Line items from invoice, or synthesise one from the charge
  let lineItems;
  if (
    invoice &&
    Array.isArray(invoice.lines?.data) &&
    invoice.lines.data.length > 0
  ) {
    lineItems = invoice.lines.data.map((line) => ({
      description: line.description || line.price?.nickname || "",
      quantity: line.quantity || 1,
      amount: line.amount,
      currency: line.currency || charge.currency,
    }));
  } else {
    lineItems = [
      {
        description:
          charge.description ||
          charge.metadata?.product_name ||
          charge.metadata?.course_title ||
          "Payment",
        quantity: 1,
        amount: charge.amount,
        currency: charge.currency,
      },
    ];
  }

  // Tax
  const taxAmounts = Array.isArray(invoice?.total_tax_amounts)
    ? invoice.total_tax_amounts
        .filter((t) => t.amount)
        .map((t) => ({
          amount: t.amount,
          inclusive: t.inclusive,
          displayName: t.tax_rate_details?.display_name || "Tax",
          percentage: t.tax_rate_details?.percentage || null,
        }))
    : [];

  const currency = (charge.currency || "").toUpperCase();
  const total = invoice?.total ?? charge.amount;
  const subtotal = invoice?.subtotal ?? charge.amount;
  const amountRefunded = charge.amount_refunded || 0;
  const refunded = charge.refunded || false;

  return {
    receiptNumber: charge.receipt_number || invoice?.number || null,
    chargeId: charge.id,
    invoiceId: invoice?.id || null,
    invoicePdfUrl: invoice?.invoice_pdf || null,
    created: charge.created * 1000, // ms
    status: charge.status,
    refunded,
    amountRefunded,
    currency,
    total,
    subtotal,
    billingName,
    billingEmail,
    billingAddress,
    paymentMethod,
    lineItems,
    taxAmounts,
    metadata: charge.metadata || {},
    footer: invoice?.footer || null,
  };
}

// ─── HTML receipt renderer ────────────────────────────────────────────────────

function fmtAmount(amount, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(ms) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtAddress(address) {
  if (!address) return "";
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter(Boolean);
  return parts.map(escHtml).join(", ");
}

function fmtPaymentMethod(pm) {
  if (pm.type === "card") {
    const brand = (pm.brand || "card").replace(/^\w/, (c) => c.toUpperCase());
    return `${escHtml(brand)} ···· ${escHtml(pm.last4)}`;
  }
  return escHtml(pm.type || "Payment");
}

function renderHtmlReceipt(data) {
  const {
    receiptNumber,
    chargeId,
    invoicePdfUrl,
    created,
    status,
    refunded,
    amountRefunded,
    currency,
    total,
    subtotal,
    billingName,
    billingEmail,
    billingAddress,
    paymentMethod,
    lineItems,
    taxAmounts,
    footer,
  } = data;

  const title = receiptNumber
    ? `Receipt #${escHtml(receiptNumber)}`
    : `Receipt — ${escHtml(chargeId)}`;
  const statusBadge = refunded
    ? `<span style="color:#b91c1c;font-weight:600">Refunded${amountRefunded < total ? " (partial)" : ""}</span>`
    : `<span style="color:#15803d;font-weight:600">Paid</span>`;

  const lineRows = lineItems
    .map(
      (line) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #e5e7eb">${escHtml(line.description)}</td>
        <td style="padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280">${escHtml(String(line.quantity || 1))}</td>
        <td style="padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:right">${fmtAmount(line.amount, line.currency || currency)}</td>
      </tr>`,
    )
    .join("");

  const taxRows = taxAmounts
    .map(
      (t) => `
      <tr>
        <td colspan="2" style="padding:4px 0;color:#6b7280;font-size:13px">${escHtml(t.displayName)}${t.percentage ? ` (${t.percentage}%)` : ""}${t.inclusive ? " (incl.)" : ""}</td>
        <td style="padding:4px 0;text-align:right;color:#6b7280;font-size:13px">${fmtAmount(t.amount, currency)}</td>
      </tr>`,
    )
    .join("");

  const refundRow = refunded
    ? `<tr>
        <td colspan="2" style="padding:4px 0;color:#b91c1c;font-size:13px">Refunded</td>
        <td style="padding:4px 0;text-align:right;color:#b91c1c;font-size:13px">−${fmtAmount(amountRefunded, currency)}</td>
      </tr>`
    : "";

  const subtotalRow =
    taxAmounts.length > 0
      ? `<tr>
          <td colspan="2" style="padding:4px 0;color:#6b7280;font-size:13px">Subtotal</td>
          <td style="padding:4px 0;text-align:right;color:#6b7280;font-size:13px">${fmtAmount(subtotal, currency)}</td>
        </tr>`
      : "";

  const pdfLink = invoicePdfUrl
    ? `<p style="margin-top:20px;font-size:13px"><a href="${escHtml(invoicePdfUrl)}" target="_blank" rel="noopener" style="color:#7c3aed">Download PDF invoice</a></p>`
    : "";

  const footerText = footer
    ? `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">${escHtml(footer)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    @media print { .no-print { display: none !important; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111827; margin: 0; padding: 0; background: #f3f4f6; }
    .page { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.1); padding: 40px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    .section { margin-bottom: 20px; }
    .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    .total-row td { padding: 10px 0 0; font-weight: 700; font-size: 16px; border-top: 2px solid #111827; }
    .print-btn { display: inline-block; margin-top: 24px; padding: 8px 20px; background: #7c3aed; color: #fff; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
  </style>
</head>
<body>
<div class="page">
  <h1>${title}</h1>
  <div class="meta">${fmtDate(created)} · ${statusBadge} · ${fmtPaymentMethod(paymentMethod)}</div>

  <div class="section">
    <div class="label">Billed to</div>
    <div>${billingName ? escHtml(billingName) : ""}${billingEmail ? `${billingName ? "<br>" : ""}<span style="color:#6b7280">${escHtml(billingEmail)}</span>` : ""}${billingAddress ? `<br><span style="color:#6b7280">${fmtAddress(billingAddress)}</span>` : ""}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;padding-bottom:6px;border-bottom:2px solid #111827">Description</th>
        <th style="text-align:center;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;padding-bottom:6px;border-bottom:2px solid #111827">Qty</th>
        <th style="text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;padding-bottom:6px;border-bottom:2px solid #111827">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
      ${subtotalRow}
      ${taxRows}
      ${refundRow}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2">Total</td>
        <td style="text-align:right">${fmtAmount(total, currency)}</td>
      </tr>
    </tfoot>
  </table>

  ${pdfLink}
  ${footerText}

  <div class="no-print" style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e7eb">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    <p style="margin-top:8px;font-size:12px;color:#9ca3af">Charge ID: ${escHtml(chargeId)}</p>
  </div>
</div>
</body>
</html>`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const chargeId = String(searchParams.get("chargeId") || "").trim();
  if (!chargeId) {
    return NextResponse.json(
      { ok: false, error: "chargeId is required." },
      { status: 400 },
    );
  }

  const format = String(searchParams.get("format") || "html").toLowerCase();

  let data;
  try {
    data = await fetchReceiptData(chargeId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch receipt data.";
    if (format === "json") {
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt error</title></head>` +
        `<body style="font-family:sans-serif;padding:40px;color:#b91c1c"><h2>Could not load receipt</h2><p>${escHtml(message)}</p></body></html>`,
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (format === "json") {
    return NextResponse.json({ ok: true, receipt: data });
  }

  const html = renderHtmlReceipt(data);
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
