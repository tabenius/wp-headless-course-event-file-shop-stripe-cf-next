import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { t } from "@/lib/i18n";
import { compilePayments, fetchStripeCharge } from "@/lib/stripePayments";
import { listAllShopItems } from "@/lib/shopProducts";
import { getShopSettings } from "@/lib/shopSettings";
import { getStripeSecretKey, isStripeEnabled } from "@/lib/stripe";

export const runtime = "nodejs";

const STRIPE_RECEIPT_HOST_SUFFIX = ".stripe.com";

function looksLikePdf(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer, 0, 4);
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
}

function extractPdfUrlFromReceiptHtml(html) {
  if (!html || typeof html !== "string") return null;

  const unescaped = html
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&");

  const patterns = [
    /https:\/\/[^"'\\\s]+\.pdf(?:\?[^"'\\\s<]*)?/i,
    /https:\/\/[^"'\\\s]+\/receipts\/[^"'\\\s<]*pdf[^"'\\\s<]*/i,
    /"receipt_pdf"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = unescaped.match(pattern);
    if (!match) continue;
    const candidate = match[1] || match[0];
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:") return parsed.toString();
    } catch {
      // Ignore malformed candidates.
    }
  }

  return null;
}

function looksLikeStripeReceiptHost(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return (
    normalized === "stripe.com" ||
    normalized.endsWith(STRIPE_RECEIPT_HOST_SUFFIX)
  );
}

function sanitizeStripeReceiptUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || "").trim());
    if (parsed.protocol !== "https:") return null;
    if (!looksLikeStripeReceiptHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function textSnippet(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function normalizeUri(uri) {
  const value = String(uri || "").trim();
  if (!value) return "";
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.replace(/\/+$/, "") || "/";
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parseVatPercent(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }
  const numeric =
    typeof rawValue === "number"
      ? rawValue
      : Number.parseFloat(String(rawValue).replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return Math.round(numeric * 100) / 100;
}

function buildItemLookups(shopItems) {
  const byDigitalId = new Map();
  const byUri = new Map();
  const byName = new Map();

  for (const item of Array.isArray(shopItems) ? shopItems : []) {
    const digitalId =
      item?.source === "digital" && typeof item?.id === "string"
        ? item.id
        : null;
    if (digitalId) byDigitalId.set(digitalId, item);

    const uri = normalizeUri(item?.uri);
    if (uri) byUri.set(uri, item);

    const name = normalizeName(item?.name);
    if (name && !byName.has(name)) byName.set(name, item);
  }

  return { byDigitalId, byUri, byName };
}

function resolveVatFromCategory(item, vatByCategory) {
  const slugs = Array.isArray(item?.categorySlugs) ? item.categorySlugs : [];
  for (const slug of slugs) {
    const mapped = parseVatPercent(vatByCategory?.[slug]);
    if (mapped !== null) {
      return { percent: mapped, categorySlug: slug };
    }
  }
  return { percent: null, categorySlug: null };
}

function findShopItemForPayment(payment, lookups) {
  const metadata =
    payment && typeof payment.metadata === "object" ? payment.metadata : {};
  const digitalId = String(metadata.digital_product_id || "").trim();
  if (digitalId && lookups.byDigitalId.has(digitalId)) {
    return lookups.byDigitalId.get(digitalId);
  }

  const uri = normalizeUri(metadata.course_uri || "");
  if (uri && lookups.byUri.has(uri)) {
    return lookups.byUri.get(uri);
  }

  const productName = normalizeName(metadata.product_name || "");
  if (productName && lookups.byName.has(productName)) {
    return lookups.byName.get(productName);
  }

  const descriptionName = normalizeName(payment?.description || "");
  if (descriptionName && lookups.byName.has(descriptionName)) {
    return lookups.byName.get(descriptionName);
  }

  return null;
}

function enrichPaymentWithVat(payment, lookups, vatByCategory) {
  const metadata =
    payment && typeof payment.metadata === "object" ? payment.metadata : {};
  const directVatPercent = parseVatPercent(metadata.vat_percent);
  const shopItem = findShopItemForPayment(payment, lookups);
  const itemVatPercent = parseVatPercent(shopItem?.vatPercent);
  const categoryVat = resolveVatFromCategory(shopItem, vatByCategory);

  let vatPercent = null;
  let vatSource = null;
  let vatCategory = null;

  if (directVatPercent !== null) {
    vatPercent = directVatPercent;
    vatSource = "metadata";
  } else if (itemVatPercent !== null) {
    vatPercent = itemVatPercent;
    vatSource = "product";
  } else if (categoryVat.percent !== null) {
    vatPercent = categoryVat.percent;
    vatSource = "category";
    vatCategory = categoryVat.categorySlug;
  }

  if (vatPercent === null || !Number.isFinite(payment?.amount)) {
    return {
      ...payment,
      vatPercent: null,
      vatAmount: null,
      netAmount: null,
      vatSource: null,
      vatCategory: null,
    };
  }

  // Amounts from Stripe charges are treated as gross (tax-inclusive).
  const vatAmount = Math.round((payment.amount * vatPercent) / (100 + vatPercent));
  const netAmount = payment.amount - vatAmount;
  return {
    ...payment,
    vatPercent,
    vatAmount,
    netAmount,
    vatSource,
    vatCategory,
  };
}

async function fetchReceiptCandidate(url, stripeKey, trace, source) {
  const startTime = Date.now();
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
  } catch (error) {
    trace.push({
      source,
      url,
      status: 0,
      contentType: "",
      ok: false,
      elapsedMs: Date.now() - startTime,
      error: String(error?.message || "network_error"),
    });
    return {
      ok: false,
      status: 502,
      error: "Network error while fetching Stripe receipt.",
    };
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const finalUrl = response.url || url;
  trace.push({
    source,
    url,
    finalUrl,
    status: response.status,
    contentType,
    ok: response.ok,
    elapsedMs: Date.now() - startTime,
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: `Unable to fetch receipt (${response.status}).`,
    };
  }

  const payload = await response.arrayBuffer();
  if (looksLikePdf(payload)) {
    return {
      ok: true,
      pdf: payload,
      contentType: contentType || "application/pdf",
      finalUrl,
    };
  }

  const text = textSnippet(new TextDecoder().decode(payload));
  const extractedPdfUrl = sanitizeStripeReceiptUrl(
    extractPdfUrlFromReceiptHtml(text),
  );
  return {
    ok: false,
    status: 502,
    contentType,
    error:
      contentType.includes("text/html") || text.includes("html")
        ? "Receipt endpoint returned HTML instead of PDF."
        : "Receipt payload is not a valid PDF.",
    extractedPdfUrl,
    debugSnippet: text,
  };
}

async function fetchStripeInvoicePdfUrl(invoiceId, stripeKey) {
  const safeInvoiceId = String(invoiceId || "").trim();
  if (!safeInvoiceId) return null;
  const invoiceUrl = `https://api.stripe.com/v1/invoices/${encodeURIComponent(safeInvoiceId)}`;
  const response = await fetch(invoiceUrl, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  return sanitizeStripeReceiptUrl(json?.invoice_pdf);
}

async function fetchStripeReceiptPdf(url, stripeKey, invoiceId) {
  const trace = [];
  const initialUrl = sanitizeStripeReceiptUrl(url);
  if (!initialUrl) {
    return {
      ok: false,
      status: 400,
      error: "Receipt URL is missing or not a Stripe HTTPS URL.",
      trace,
    };
  }

  const first = await fetchReceiptCandidate(
    initialUrl,
    stripeKey,
    trace,
    "charge_receipt_url",
  );
  if (first.ok) return { ...first, trace };

  if (first.extractedPdfUrl) {
    const embedded = await fetchReceiptCandidate(
      first.extractedPdfUrl,
      stripeKey,
      trace,
      "html_embedded_pdf_url",
    );
    if (embedded.ok) return { ...embedded, trace };
  }

  const invoicePdfUrl = await fetchStripeInvoicePdfUrl(invoiceId, stripeKey);
  if (invoicePdfUrl) {
    const invoiceFallback = await fetchReceiptCandidate(
      invoicePdfUrl,
      stripeKey,
      trace,
      "invoice_pdf_url",
    );
    if (invoiceFallback.ok) return { ...invoiceFallback, trace };
  }

  return {
    ok: false,
    status: first.status || 502,
    contentType: first.contentType || "",
    error:
      first.error ||
      "Unable to resolve a valid PDF receipt from Stripe endpoints.",
    debugSnippet: first.debugSnippet || "",
    trace,
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const stripeConfigured = isStripeEnabled();
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
    const [shopSettings, shopItems] = await Promise.all([
      getShopSettings().catch(() => ({ vatByCategory: {} })),
      listAllShopItems().catch(() => []),
    ]);
    const lookups = buildItemLookups(shopItems);
    const vatByCategory =
      shopSettings && typeof shopSettings.vatByCategory === "object"
        ? shopSettings.vatByCategory
        : {};
    const enrichedRows = rows.map((row) =>
      enrichPaymentWithVat(row, lookups, vatByCategory),
    );
    return NextResponse.json({
      ok: true,
      payments: enrichedRows,
      stripeConfigured: true,
      emptyReason: enrichedRows.length === 0 ? "no_sales_data" : null,
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
  const requestId = crypto.randomUUID();
  try {
    const body = await request.json();
    const chargeId = String(body?.chargeId || body?.id || "").trim();
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

    const stripeSecretKey = await getStripeSecretKey();
    if (!stripeSecretKey) {
      return NextResponse.json(
        { ok: false, error: "Stripe is not configured" },
        { status: 503 },
      );
    }
    const result = await fetchStripeReceiptPdf(
      receiptUrl,
      stripeSecretKey,
      charge?.invoice,
    );
    if (!result.ok) {
      console.warn("receipt proxy non-pdf or invalid receipt", {
        requestId,
        chargeId,
        receiptUrl,
        error: result.error,
        status: result.status,
        contentType: result.contentType,
        snippet: result.debugSnippet || "",
        trace: result.trace || [],
      });
      return NextResponse.json(
        {
          ok: false,
          requestId,
          error: result.error || "Receipt download failed",
          code: "receipt_pdf_unavailable",
        },
        { status: result.status || 502 },
      );
    }

    return new Response(result.pdf, {
      status: 200,
      headers: {
        "Content-Type": result.contentType || "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${chargeId}.pdf"`,
        "Cache-Control": "no-store",
        "X-RAGBAZ-Request-Id": requestId,
      },
    });
  } catch (error) {
    console.error("receipt proxy error", {
      requestId,
      error: String(error?.message || error),
    });
    return NextResponse.json(
      {
        ok: false,
        requestId,
        code: "receipt_proxy_error",
        error: t("apiErrors.generic", "Receipt download failed"),
      },
      { status: 500 },
    );
  }
}
