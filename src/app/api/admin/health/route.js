import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader, isAdminCredentialsConfigured } from "@/auth";
import { getEnabledProviders } from "@/lib/oauthProviders";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";
import { isStripeEnabled } from "@/lib/stripe";
import { t } from "@/lib/i18n";

async function checkWordPressGraphQL() {
  const url = process.env.NEXT_PUBLIC_WORDPRESS_URL;
  const auth = getWordPressGraphqlAuth();
  if (!url) {
    return { ok: false, message: t("health.wpNotConfigured") };
  }
  if (!auth.authorization) {
    return {
      ok: false,
      message: t("health.wpAuthMissing"),
    };
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/graphql`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: auth.authorization,
      },
      body: JSON.stringify({
        query:
          "query HealthCheck { courseAccessRules { courseUri } __typename }",
      }),
      cache: "no-store",
    });
    const json = await response.json();
    if (!response.ok) {
      return { ok: false, message: t("health.wpNotResponding") };
    }
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      return { ok: false, message: t("health.wpError") };
    }
    return { ok: true, message: t("health.wpOk") };
  } catch (error) {
    console.error("WordPress health check failed:", error);
    return { ok: false, message: t("health.wpConnectFailed") };
  }
}

async function checkWpSchema() {
  const url = process.env.NEXT_PUBLIC_WORDPRESS_URL;
  const auth = getWordPressGraphqlAuth();
  if (!url || !auth.authorization) return { ok: false, message: t("health.wpSchemaUnknown") };
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/graphql`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: auth.authorization,
      },
      body: JSON.stringify({
        query: `
          query SchemaCheck {
            __schema { types { name } }
            events: events(first: 1) { edges { node { uri } } }
            lpCourses(first: 1) { edges { node { uri } } }
          }
        `,
      }),
      cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.data) return { ok: false, message: t("health.wpSchemaFailed") };
    const types = (json.data.__schema?.types || []).map((t) => t?.name);
    const hasEvent = types.includes("Event");
    const hasLpCourse = types.includes("LpCourse");
    const sampleEvent = json.data.events?.edges?.[0]?.node?.uri || null;
    const sampleCourse = json.data.lpCourses?.edges?.[0]?.node?.uri || null;
    return {
      ok: hasEvent || hasLpCourse,
      message: t("health.wpSchemaOk", {
        event: hasEvent ? "yes" : "no",
        course: hasLpCourse ? "yes" : "no",
        sampleEvent: sampleEvent || "none",
        sampleCourse: sampleCourse || "none",
      }),
      details: { hasEvent, hasLpCourse, sampleEvent, sampleCourse },
    };
  } catch (error) {
    console.error("WP schema check failed:", error);
    return { ok: false, message: t("health.wpSchemaFailed") };
  }
}

async function checkStripe() {
  if (!isStripeEnabled()) {
    return { ok: false, message: t("health.stripeNotConfigured") };
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, message: t("health.stripeNotResponding") };
    }
    return { ok: true, message: t("health.stripeOk") };
  } catch (error) {
    console.error("Stripe health check failed:", error);
    return { ok: false, message: t("health.stripeConnectFailed") };
  }
}

export async function GET(request) {
  const adminSession = getAdminSessionFromCookieHeader(
    request.headers.get("cookie") || "",
  );
  if (!adminSession) {
    return NextResponse.json({ ok: false, error: t("apiErrors.adminLoginRequired") }, { status: 401 });
  }

  const backend = process.env.COURSE_ACCESS_BACKEND || "local";
  const providers = getEnabledProviders();
  const adminConfigured = isAdminCredentialsConfigured();
  const authSecretConfigured = Boolean(process.env.AUTH_SECRET);
  const stripeWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

  const wordpressCheck =
    backend === "wordpress"
      ? await checkWordPressGraphQL()
      : { ok: true, message: t("health.wpModeNotEnabled") };
  const wpSchemaCheck =
    backend === "wordpress"
      ? await checkWpSchema()
      : { ok: true, message: t("health.wpModeNotEnabled") };
  const stripeCheck = await checkStripe();

  // Build the webhook URL from the request
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const webhookUrl = `${origin}/api/stripe/webhook`;

  return NextResponse.json({
    ok: true,
    webhookUrl,
    checks: {
      backend: { ok: true, message: t("health.backendLabel", { backend }) },
      adminCredentials: {
        ok: adminConfigured,
        message: adminConfigured
          ? t("health.adminConfigured")
          : t("health.adminNotConfigured"),
      },
      authSecret: {
        ok: authSecretConfigured,
        message: authSecretConfigured
          ? t("health.authSecretConfigured")
          : t("health.authSecretMissing"),
      },
      wordpressGraphQL: wordpressCheck,
      wordpressSchema: wpSchemaCheck,
      stripe: stripeCheck,
      stripeWebhook: {
        ok: stripeWebhookConfigured,
        message: stripeWebhookConfigured
          ? t("health.webhookConfigured")
          : t("health.webhookMissing"),
      },
      oauthProviders: {
        ok: providers.length > 0,
        message:
          providers.length > 0
            ? t("health.oauthActive", { providers: providers.join(", ") })
            : t("health.oauthNone"),
      },
    },
  });
}
