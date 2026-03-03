function hasStripeConfig() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function stripeHeaders() {
  return {
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

export function isStripeEnabled() {
  return hasStripeConfig();
}

export async function createStripeCheckoutSession({
  courseUri,
  courseTitle,
  priceCents,
  currency,
  email,
  successUrl,
  cancelUrl,
}) {
  if (!hasStripeConfig()) {
    throw new Error("Stripe is not configured");
  }

  const payload = new URLSearchParams();
  payload.set("mode", "payment");
  payload.set("success_url", successUrl);
  payload.set("cancel_url", cancelUrl);
  payload.set("customer_email", email);
  payload.set("line_items[0][quantity]", "1");
  payload.set("line_items[0][price_data][currency]", currency.toLowerCase());
  payload.set("line_items[0][price_data][unit_amount]", String(priceCents));
  payload.set(
    "line_items[0][price_data][product_data][name]",
    courseTitle || `Course access: ${courseUri}`,
  );
  payload.set("metadata[course_uri]", courseUri);
  payload.set("metadata[user_email]", email.toLowerCase());

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: stripeHeaders(),
    body: payload,
  });
  const json = await response.json();
  if (!response.ok || !json?.url) {
    throw new Error("Failed to create Stripe checkout session");
  }
  return json;
}

export async function fetchStripeCheckoutSession(sessionId) {
  if (!hasStripeConfig()) {
    throw new Error("Stripe is not configured");
  }
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    },
  );
  const json = await response.json();
  if (!response.ok) {
    throw new Error("Failed to verify Stripe checkout session");
  }
  return json;
}
