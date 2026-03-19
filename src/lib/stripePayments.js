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
  const listParams = { limit };
  if (fromTs) listParams.created = { gte: fromTs };

  let charges;
  if (email) {
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
    created: charge.created * 1000, // ms
    email:
      charge.receipt_email || charge.billing_details?.email || email || null,
    receiptUrl: charge.receipt_url || null,
    receiptId: charge.id, // always the charge ID, needed for receipt download
    description: charge.description || "",
  }));
}
