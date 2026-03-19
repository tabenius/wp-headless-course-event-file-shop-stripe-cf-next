import Stripe from "stripe";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  // No apiVersion specified — uses the SDK's built-in default (currently 2026-02-25.clover)
  return new Stripe(key);
}

/**
 * Fetch and normalise Stripe charges.
 * @param {string|undefined} email  Filter by customer email (optional)
 * @param {number} limit            Max charges to return (≤100)
 * @param {number|undefined} fromTs Unix timestamp seconds (inclusive lower bound)
 */
export async function compilePayments(email, limit, fromTs) {
  const stripe = getStripe();
  const normalizedEmail =
    typeof email === "string" && email.trim()
      ? email.trim().toLowerCase()
      : undefined;
  const pageSize = normalizedEmail ? 100 : Math.min(Math.max(limit || 20, 1), 100);
  const listParams = { limit: pageSize };
  if (fromTs) listParams.created = { gte: fromTs };

  const charges = [];
  let startingAfter;
  for (let page = 0; page < 20; page += 1) {
    const result = await stripe.charges.list({
      ...listParams,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const rows = Array.isArray(result?.data) ? result.data : [];
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
    if (charges.length >= limit) break;
    if (!result?.has_more || rows.length === 0) break;
    startingAfter = rows[rows.length - 1]?.id;
    if (!startingAfter) break;
  }
  charges.sort((a, b) => b.created - a.created);
  const limited = charges.slice(0, limit);

  return limited.map((charge) => ({
    id: charge.id,
    amount: charge.amount,
    currency: charge.currency,
    status: charge.status,
    created: charge.created * 1000, // ms
    email:
      charge.receipt_email ||
      charge.billing_details?.email ||
      normalizedEmail ||
      null,
    receiptUrl: charge.receipt_url || null,
    receiptId: charge.id, // always the charge ID, needed for receipt download
    paymentIntentId:
      typeof charge.payment_intent === "string" ? charge.payment_intent : null,
    description: charge.description || "",
  }));
}
