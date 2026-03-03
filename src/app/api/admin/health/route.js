import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";
import { getEnabledProviders } from "@/lib/oauthProviders";
import { isStripeEnabled } from "@/lib/stripe";

async function checkWordPressGraphQL() {
  const url = process.env.NEXT_PUBLIC_WORDPRESS_URL;
  const token = process.env.WORDPRESS_GRAPHQL_AUTH_TOKEN;
  if (!url) {
    return { ok: false, message: "WordPress-anslutningen är inte inställd ännu." };
  }
  if (!token) {
    return { ok: false, message: "WordPress-behörighet saknas." };
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query:
          "query HealthCheck { courseAccessRules { courseUri } __typename }",
      }),
      cache: "no-store",
    });
    const json = await response.json();
    if (!response.ok) {
      return { ok: false, message: "WordPress svarar inte korrekt just nu." };
    }
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      return {
        ok: false,
        message: "WordPress svarade med ett fel.",
      };
    }
    return { ok: true, message: "WordPress-anslutningen fungerar." };
  } catch (error) {
    console.error("WordPress health check failed:", error);
    return {
      ok: false,
      message: "Kunde inte ansluta till WordPress just nu.",
    };
  }
}

async function checkStripe() {
  if (!isStripeEnabled()) {
    return { ok: false, message: "Stripe är inte inställt ännu." };
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, message: "Stripe svarar inte korrekt just nu." };
    }
    return { ok: true, message: "Stripe-anslutningen fungerar." };
  } catch (error) {
    console.error("Stripe health check failed:", error);
    return {
      ok: false,
      message: "Kunde inte ansluta till Stripe just nu.",
    };
  }
}

export async function GET(request) {
  const adminSession = getAdminSessionFromCookieHeader(
    request.headers.get("cookie") || "",
  );
  if (!adminSession) {
    return NextResponse.json({ ok: false, error: "Du behöver logga in som administratör." }, { status: 401 });
  }

  const backend = process.env.COURSE_ACCESS_BACKEND || "local";
  const providers = getEnabledProviders();
  const adminConfigured = Boolean(
    process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD,
  );
  const authSecretConfigured = Boolean(process.env.AUTH_SECRET);
  const stripeWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

  const wordpressCheck =
    backend === "wordpress"
      ? await checkWordPressGraphQL()
      : { ok: true, message: "WordPress-läge är inte aktiverat." };
  const stripeCheck = await checkStripe();

  return NextResponse.json({
    ok: true,
    checks: {
      backend: { ok: true, message: `Backend: ${backend}` },
      adminCredentials: {
        ok: adminConfigured,
        message: adminConfigured
          ? "Admininloggning är konfigurerad."
          : "Admininloggning saknar uppgifter.",
      },
      authSecret: {
        ok: authSecretConfigured,
        message: authSecretConfigured
          ? "Säkerhetsnyckeln är konfigurerad."
          : "Säkerhetsnyckel saknas.",
      },
      wordpressGraphQL: wordpressCheck,
      stripe: stripeCheck,
      stripeWebhook: {
        ok: stripeWebhookConfigured,
        message: stripeWebhookConfigured
          ? "Stripe-webhook är konfigurerad."
          : "Stripe-webhook saknas.",
      },
      oauthProviders: {
        ok: providers.length > 0,
        message:
          providers.length > 0
            ? `Aktiva inloggningstjänster: ${providers.join(", ")}`
            : "Inga externa inloggningstjänster är konfigurerade.",
      },
    },
  });
}
