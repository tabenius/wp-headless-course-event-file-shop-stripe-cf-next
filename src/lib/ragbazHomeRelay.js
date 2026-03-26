import { fetchGraphQL } from "@/lib/client";

const CONNECTION_QUERY = `
  query RagbazHomeConnectionForRelay {
    ragbazHomeConnection {
      baseUrl
      accountId
      passkey
      giftKey
      canPhoneHome
    }
  }
`;

let cachedConnection = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

function trimText(value) {
  return String(value || "").trim();
}

function normalizeConnection(raw) {
  if (!raw || typeof raw !== "object") return null;
  const baseUrl = trimText(raw.baseUrl || "https://ragbaz.xyz").replace(/\/+$/, "");
  const accountId = trimText(raw.accountId || "").toLowerCase();
  const passkey = trimText(raw.passkey || "").toLowerCase();
  const giftKey = trimText(raw.giftKey || "").toLowerCase();
  const canPhoneHome = Boolean(raw.canPhoneHome) && accountId !== "" && passkey !== "";
  if (!canPhoneHome) return null;
  return { baseUrl, accountId, passkey, giftKey, canPhoneHome };
}

function classifySeverity(metrics) {
  if (!metrics || typeof metrics !== "object") return "good";
  const lcp = Number(metrics.lcpMs ?? metrics.lcp);
  const inp = Number(metrics.inpMs ?? metrics.inp);
  const cls = Number(metrics.cls);
  if ((Number.isFinite(lcp) && lcp > 4000) || (Number.isFinite(inp) && inp > 500) || (Number.isFinite(cls) && cls > 0.25)) {
    return "bad";
  }
  if ((Number.isFinite(lcp) && lcp > 2500) || (Number.isFinite(inp) && inp > 200) || (Number.isFinite(cls) && cls > 0.1)) {
    return "warn";
  }
  return "good";
}

async function getConnection() {
  const now = Date.now();
  if (cachedConnection && now - cachedAt < CACHE_TTL_MS) return cachedConnection;
  const data = await fetchGraphQL(CONNECTION_QUERY, {}, 0);
  const normalized = normalizeConnection(data?.ragbazHomeConnection || null);
  cachedConnection = normalized;
  cachedAt = now;
  return normalized;
}

function asNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildDetails({ sample, host, ua }) {
  const ttfbMs = asNumberOrNull(sample.ttfb);
  const lcpMs = asNumberOrNull(sample.lcp);
  const inpMs = asNumberOrNull(sample.inp);
  const cls = asNumberOrNull(sample.cls);
  const fcpMs = asNumberOrNull(sample.fcp);
  const domCompleteMs = asNumberOrNull(sample.domComplete);
  return {
    url: trimText(sample.url || "/").slice(0, 500),
    host: trimText(host || ""),
    ttfbMs,
    lcpMs,
    inpMs,
    cls,
    fcpMs,
    domCompleteMs,
    userAgent: trimText(ua || "").slice(0, 400),
    capturedAt: new Date().toISOString(),
  };
}

export async function relayStorefrontVitalsToRagbazHome(sample, request) {
  try {
    const connection = await getConnection();
    if (!connection) {
      return { ok: false, skipped: true, reason: "home_connection_missing" };
    }
    const details = buildDetails({
      sample,
      host: request?.headers?.get("host") || "",
      ua: request?.headers?.get("user-agent") || "",
    });
    const severity = classifySeverity(details);
    const message = `Storefront vitals snapshot ${details.url || "/"}`;
    const body = {
      accountId: connection.accountId,
      passkey: connection.passkey,
      event: {
        type: "storefront_web_vitals",
        severity,
        message,
        source: "ragbaz-storefront",
        details,
      },
    };
    const endpoint = `${connection.baseUrl}/api/v1/home/events`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        status: response.status,
        reason: "home_events_failed",
      };
    }
    return { ok: true, status: response.status, endpoint, giftKey: connection.giftKey || "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, skipped: false, reason: "relay_exception", message };
  }
}
