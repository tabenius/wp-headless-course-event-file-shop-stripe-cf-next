import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookieHeader,
  isAdminCredentialsConfigured,
} from "@/auth";
import { appendServerLog } from "@/lib/serverLog";
import { getEnabledProviders } from "@/lib/oauthProviders";
import { getWordPressGraphqlAuth } from "@/lib/wordpressGraphqlAuth";
import { isStripeEnabled } from "@/lib/stripe";
import {
  isCloudflareKvConfigured,
  readCloudflareKvJson,
} from "@/lib/cloudflareKv";
import { t } from "@/lib/i18n";
import { buildRagbazDownloadUrl } from "./helpers";

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
  if (!url || !auth.authorization)
    return { ok: false, message: t("health.wpSchemaUnknown") };
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
    if (!response.ok || !json?.data)
      return { ok: false, message: t("health.wpSchemaFailed") };
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

async function checkRagbazPlugin() {
  const url = process.env.NEXT_PUBLIC_WORDPRESS_URL;
  const auth = getWordPressGraphqlAuth();
  if (!url || !auth.authorization)
    return { ok: false, message: t("health.ragbazUnknown") };
  const endpoint = `${url.replace(/\/$/, "")}/graphql`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: auth.authorization,
  };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `
          query RagbazCheck {
            ragbazInfo { version hasLearnPress hasEventsPlugin }
            courseAccessRules { courseUri }
          }
        `,
      }),
      cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.data)
      return { ok: false, message: t("health.ragbazMissing") };
    const info = json.data.ragbazInfo;
    if (!info) return { ok: false, message: t("health.ragbazMissing") };

    const details = {
      version: info.version || "unknown",
      hasLearnPress: Boolean(info.hasLearnPress),
      hasEventsPlugin: Boolean(info.hasEventsPlugin),
      pluginVersion: info.version || "unknown",
      pluginSemver: null,
      capabilities: null,
      runtime: null,
      availability: {
        ragbazInfo: true,
        ragbazPluginVersion: false,
        ragbazWpRuntime: false,
        ragbazInfoWpRuntime: false,
        ragbazCapabilities: false,
      },
    };

    try {
      const runtimeResponse = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: `
            query RagbazRuntimeProbe {
              ragbazPluginVersion
              ragbazWpRuntime {
                pluginVersion
                checkedAt
                okForProduction
                cacheReadinessOk
                wpDebug
                wpDebugLog
                scriptDebug
                saveQueries
                graphqlDebug
                queryMonitorActive
                xdebugActive
                objectCacheDropInPresent
                redisPluginActive
                memcachedPluginActive
                objectCacheEnabled
                opcacheEnabled
              }
              ragbazInfo {
                wpRuntime {
                  pluginVersion
                  checkedAt
                  okForProduction
                  cacheReadinessOk
                  wpDebug
                  wpDebugLog
                  scriptDebug
                  saveQueries
                  graphqlDebug
                  queryMonitorActive
                  xdebugActive
                  objectCacheDropInPresent
                  redisPluginActive
                  memcachedPluginActive
                  objectCacheEnabled
                  opcacheEnabled
                }
              }
              ragbazCapabilities {
                pluginPresent
                pluginVersion
                pluginSemver
                assetMetaSchemaVersion
                assetMetaRestField
                assetMetaGraphqlField
              }
            }
          `,
        }),
        cache: "no-store",
      });

      const runtimeJson = await runtimeResponse.json().catch(() => null);
      if (runtimeResponse.ok && runtimeJson?.data) {
        const explicitVersion = runtimeJson.data.ragbazPluginVersion || null;
        const directRuntime = runtimeJson.data.ragbazWpRuntime || null;
        const nestedRuntime = runtimeJson.data.ragbazInfo?.wpRuntime || null;
        const capabilities = runtimeJson.data.ragbazCapabilities || null;

        if (explicitVersion) {
          details.pluginVersion = explicitVersion;
          details.availability.ragbazPluginVersion = true;
        }
        if (directRuntime) {
          details.runtime = directRuntime;
          details.availability.ragbazWpRuntime = true;
        } else if (nestedRuntime) {
          details.runtime = nestedRuntime;
          details.availability.ragbazInfoWpRuntime = true;
        }
        if (capabilities && typeof capabilities === "object") {
          details.capabilities = capabilities;
          details.pluginSemver =
            typeof capabilities.pluginSemver === "string" &&
            capabilities.pluginSemver.trim()
              ? capabilities.pluginSemver.trim()
              : null;
          if (
            typeof capabilities.pluginVersion === "string" &&
            capabilities.pluginVersion.trim()
          ) {
            details.pluginVersion = capabilities.pluginVersion.trim();
          }
          details.availability.ragbazCapabilities = true;
        }
      }
    } catch (runtimeError) {
      console.info(
        "[health] ragbaz runtime probe unavailable:",
        runtimeError?.message || runtimeError,
      );
    }

    const msg = t("health.ragbazOk", {
      version: info.version || "unknown",
      learnpress: info.hasLearnPress ? "yes" : "no",
      events: info.hasEventsPlugin ? "yes" : "no",
    });
    return { ok: true, message: msg, details };
  } catch (error) {
    console.error("RAGBAZ health check failed:", error);
    return { ok: false, message: t("health.ragbazMissing") };
  }
}

async function checkKvStorage() {
  if (!isCloudflareKvConfigured()) {
    return { ok: false, message: t("health.kvNotConfigured") };
  }
  try {
    await readCloudflareKvJson("support-tickets");
    return { ok: true, message: t("health.kvOk") };
  } catch (error) {
    console.error("KV health check failed:", error);
    return { ok: false, message: t("health.kvFailed") };
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
    console.warn("[health] admin session missing");
    return NextResponse.json(
      { ok: false, error: t("apiErrors.adminLoginRequired") },
      { status: 401 },
    );
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
  const ragbazCheck =
    backend === "wordpress"
      ? await checkRagbazPlugin()
      : { ok: true, message: t("health.wpModeNotEnabled") };
  const ragbazRuntimeCheck =
    backend === "wordpress"
      ? {
          ok: Boolean(ragbazCheck?.ok),
          message: ragbazCheck?.ok
            ? ragbazCheck?.details?.runtime
              ? "Runtime probe available."
              : "Runtime probe not exposed by installed plugin version."
            : t("health.ragbazMissing"),
          details: {
            pluginVersion:
              ragbazCheck?.details?.pluginVersion ||
              ragbazCheck?.details?.version ||
              null,
            runtime: ragbazCheck?.details?.runtime || null,
            availability: ragbazCheck?.details?.availability || null,
          },
        }
      : { ok: true, message: t("health.wpModeNotEnabled") };
  const stripeCheck = await checkStripe();
  const kvCheck = await checkKvStorage();

  // Build the webhook URL from the request
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const webhookUrl = `${origin}/api/stripe/webhook`;
  const ragbazDownloadUrl = buildRagbazDownloadUrl(origin);

  const reqId = request.headers.get("x-request-id") || null;
  const summary = {
    backend,
    wordpress: wordpressCheck?.ok,
    schema: wpSchemaCheck?.ok,
    ragbaz: ragbazCheck?.ok,
    stripe: stripeCheck?.ok,
    kv: kvCheck?.ok,
    reqId,
  };
  console.info("[health] result", summary);
  await appendServerLog({
    level: "info",
    msg: `[health] ${JSON.stringify(summary)}`,
    reqId,
  });

  return NextResponse.json({
    ok: true,
    webhookUrl,
    ragbazDownloadUrl,
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
      ragbaz: ragbazCheck,
      ragbazWpRuntime: ragbazRuntimeCheck,
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
      kvStorage: kvCheck,
    },
  });
}
