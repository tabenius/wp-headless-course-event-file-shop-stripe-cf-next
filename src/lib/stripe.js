import { readStripeKeyOverrides } from "./adminSettingsStore.js";

const STRIPE_OVERRIDE_CACHE_MS =
  Number.parseInt(process.env.STRIPE_OVERRIDE_CACHE_MS || "20000", 10) || 20000;

let stripeKeyCache = {
  expiresAt: 0,
  value: null,
};

function kvOverridesEnabled() {
  const mode = String(process.env.STRIPE_KV_OVERRIDE_MODE || "enabled")
    .trim()
    .toLowerCase();
  return mode !== "off" && mode !== "disabled" && mode !== "false";
}

function hasKvConfig() {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CF_API_TOKEN &&
      process.env.CF_KV_NAMESPACE_ID,
  );
}

function hasStripeConfig() {
  if (process.env.STRIPE_SECRET_KEY) return true;
  return kvOverridesEnabled() && hasKvConfig();
}

async function resolveStripeSecretKey() {
  const envSecret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!kvOverridesEnabled()) return envSecret;

  const now = Date.now();
  if (stripeKeyCache.expiresAt > now) {
    return stripeKeyCache.value || envSecret;
  }

  let resolved = envSecret;
  try {
    const overrides = await readStripeKeyOverrides();
    if (overrides?.enabled && overrides?.secretKey) {
      resolved = String(overrides.secretKey).trim() || resolved;
    }
  } catch (error) {
    console.error("Failed to load Stripe key overrides:", error);
  }

  stripeKeyCache = {
    value: resolved || null,
    expiresAt: now + STRIPE_OVERRIDE_CACHE_MS,
  };
  return resolved;
}

export async function getStripeSecretKey() {
  return resolveStripeSecretKey();
}

function stripeHeaders(secretKey) {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

export function isStripeEnabled() {
  return hasStripeConfig();
}

function labelForKind(kind) {
  if (kind === "event") return "Event";
  if (kind === "product") return "Product";
  return "Course";
}

export async function createStripePaymentSession({
  itemName,
  priceCents,
  currency,
  email,
  successUrl,
  cancelUrl,
  description,
  metadata = {},
}) {
  if (!hasStripeConfig()) {
    throw new Error("Stripe is not configured");
  }
  const secretKey = await resolveStripeSecretKey();
  if (!secretKey) throw new Error("Stripe is not configured");

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
    itemName || "Digital item",
  );
  const paymentDescription = String(description || itemName || "Digital item")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  payload.set("payment_intent_data[description]", paymentDescription);
  payload.set(
    "line_items[0][price_data][product_data][description]",
    paymentDescription,
  );
  payload.set("metadata[user_email]", email.toLowerCase());
  payload.set("payment_intent_data[metadata][user_email]", email.toLowerCase());
  for (const [key, value] of Object.entries(metadata)) {
    payload.set(`metadata[${key}]`, String(value));
    payload.set(`payment_intent_data[metadata][${key}]`, String(value));
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: stripeHeaders(secretKey),
    body: payload,
  });
  const json = await response.json();
  if (!response.ok || !json?.url) {
    throw new Error("Failed to create Stripe checkout session");
  }
  return json;
}

export async function createStripeCheckoutSession({
  courseUri,
  courseTitle,
  priceCents,
  currency,
  email,
  successUrl,
  cancelUrl,
  contentKind = "course",
  vatPercent,
}) {
  const kindLabel = labelForKind(contentKind);
  const fallbackName = `${kindLabel} access: ${courseUri}`;
  const safeVatPercent =
    typeof vatPercent === "number" && Number.isFinite(vatPercent)
      ? Math.round(Math.max(0, Math.min(100, vatPercent)) * 100) / 100
      : null;
  return createStripePaymentSession({
    itemName: courseTitle || fallbackName,
    description: courseTitle || fallbackName,
    priceCents,
    currency,
    email,
    successUrl,
    cancelUrl,
    metadata: {
      purchase_kind: contentKind,
      course_uri: courseUri,
      course_title: courseTitle || "",
      product_name: courseTitle || "",
      ...(safeVatPercent !== null
        ? { vat_percent: String(safeVatPercent) }
        : {}),
    },
  });
}

export async function fetchStripeCheckoutSession(sessionId) {
  if (!hasStripeConfig()) {
    throw new Error("Stripe is not configured");
  }
  const secretKey = await resolveStripeSecretKey();
  if (!secretKey) throw new Error("Stripe is not configured");
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${secretKey}` },
    },
  );
  const json = await response.json();
  if (!response.ok) {
    throw new Error("Failed to verify Stripe checkout session");
  }
  return json;
}
