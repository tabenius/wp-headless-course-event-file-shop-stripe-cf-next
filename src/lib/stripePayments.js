import { getStripeSecretKey } from "@/lib/stripe";

async function stripeSecretKey() {
  const key = await getStripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return key;
}

export function getStripe() {
  // Kept for compatibility with older imports/tests.
  return {
    configured: true,
    getApiField(field) {
      if (field === "version") return "2026-02-25.clover";
      return undefined;
    },
    _api: { version: "2026-02-25.clover" },
  };
}

function stripeError(type, message, status) {
  const err = new Error(message);
  err.type = type;
  if (status) err.status = status;
  return err;
}

async function stripeRequest(path, params = {}) {
  const key = await stripeSecretKey();
  const url = new URL(`https://api.stripe.com${path}`);

  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch (error) {
    throw stripeError(
      "StripeConnectionError",
      error?.message || "Could not reach Stripe API",
    );
  }

  const json = await response.json().catch(() => null);
  if (response.ok) return json;

  const message =
    json?.error?.message ||
    `Stripe API request failed (${response.status})`;
  if (response.status === 401) {
    throw stripeError("StripeAuthenticationError", message, response.status);
  }
  if (response.status === 403) {
    throw stripeError("StripePermissionError", message, response.status);
  }
  if (response.status >= 500) {
    throw stripeError("StripeConnectionError", message, response.status);
  }
  throw stripeError("StripeInvalidRequestError", message, response.status);
}

function normaliseCharge(charge, fallbackEmail) {
  const configuredCurrency = String(
    process.env.DEFAULT_COURSE_FEE_CURRENCY || "SEK",
  ).toLowerCase();
  const rawMetadata =
    charge && typeof charge.metadata === "object" && charge.metadata
      ? charge.metadata
      : {};
  const metadata = Object.fromEntries(
    Object.entries(rawMetadata).filter(
      ([key, value]) =>
        typeof key === "string" &&
        key.trim() &&
        typeof value === "string" &&
        value.trim(),
    ),
  );
  const description =
    charge.description ||
    metadata.product_name ||
    metadata.course_title ||
    metadata.course_uri ||
    "";
  return {
    id: charge.id,
    amount: charge.amount,
    currency: configuredCurrency,
    status: charge.status,
    created: charge.created * 1000, // ms
    email:
      charge.receipt_email ||
      charge.billing_details?.email ||
      fallbackEmail ||
      null,
    receiptUrl: charge.receipt_url || null,
    receiptId: charge.id, // always the charge ID, needed for receipt download
    paymentIntentId:
      typeof charge.payment_intent === "string" ? charge.payment_intent : null,
    description,
    metadata,
  };
}

/**
 * Fetch and normalise Stripe charges.
 * @param {string|undefined} email  Filter by customer email (optional)
 * @param {number} limit            Max charges to return (≤100)
 * @param {number|undefined} fromTs Unix timestamp seconds (inclusive lower bound)
 */
export async function compilePayments(email, limit, fromTs) {
  const normalizedEmail =
    typeof email === "string" && email.trim()
      ? email.trim().toLowerCase()
      : undefined;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  const pageSize = normalizedEmail ? 100 : safeLimit;

  const charges = [];
  let startingAfter;
  for (let page = 0; page < 20; page += 1) {
    const payload = await stripeRequest("/v1/charges", {
      limit: pageSize,
      "created[gte]": fromTs,
      starting_after: startingAfter,
    });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const filtered = normalizedEmail
      ? rows.filter((charge) => {
          const receiptEmail = String(charge?.receipt_email || "").toLowerCase();
          const billingEmail = String(charge?.billing_details?.email || "").toLowerCase();
          return (
            receiptEmail === normalizedEmail || billingEmail === normalizedEmail
          );
        })
      : rows;
    charges.push(...filtered);
    if (charges.length >= safeLimit) break;
    if (!payload?.has_more || rows.length === 0) break;
    startingAfter = rows[rows.length - 1]?.id;
    if (!startingAfter) break;
  }

  charges.sort((a, b) => b.created - a.created);
  return charges.slice(0, safeLimit).map((charge) =>
    normaliseCharge(charge, normalizedEmail),
  );
}

export async function fetchStripeCharge(chargeId) {
  if (!chargeId) {
    throw stripeError("StripeInvalidRequestError", "Charge ID required", 400);
  }
  return stripeRequest(`/v1/charges/${encodeURIComponent(chargeId)}`);
}
