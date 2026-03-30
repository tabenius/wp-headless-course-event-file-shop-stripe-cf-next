import { readWcRestApiSettings } from "@/lib/adminSettingsStore";

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function encodeBasicAuth(username, password) {
  const user = String(username || "");
  const pass = String(password || "");
  const raw = `${user}:${pass}`;
  if (typeof Buffer !== "undefined") {
    return `Basic ${Buffer.from(raw).toString("base64")}`;
  }
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(raw);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `Basic ${btoa(binary)}`;
  }
  throw new Error("Basic auth encoding is not available in this runtime.");
}

function normalizeConfig(input) {
  const config = input && typeof input === "object" ? input : {};
  return {
    wcUrl: normalizeBaseUrl(config.wcUrl),
    consumerKey: String(config.consumerKey || "").trim(),
    consumerSecret: String(config.consumerSecret || "").trim(),
    sendOrders: Boolean(config.sendOrders),
    readTax: Boolean(config.readTax),
  };
}

async function resolveConfig(config) {
  if (config && typeof config === "object") {
    const resolved = normalizeConfig(config);
    if (resolved.wcUrl && resolved.consumerKey && resolved.consumerSecret) {
      return resolved;
    }
  }
  return normalizeConfig(await readWcRestApiSettings());
}

async function wcRequest(path, { method = "GET", config, body } = {}) {
  const resolved = await resolveConfig(config);
  if (!resolved.wcUrl || !resolved.consumerKey || !resolved.consumerSecret) {
    throw new Error("WooCommerce REST API settings are incomplete.");
  }
  const endpoint = `${resolved.wcUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Authorization: encodeBasicAuth(
      resolved.consumerKey,
      resolved.consumerSecret,
    ),
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(endpoint, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      json?.message ||
      json?.error ||
      `WooCommerce API request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return json;
}

export async function testWcConnection(config) {
  return wcRequest("/wp-json/wc/v3/system_status", { method: "GET", config });
}

export async function getWcTaxRates(config) {
  return wcRequest("/wp-json/wc/v3/taxes", { method: "GET", config });
}

export async function createWcOrder(sessionData, config) {
  const data = sessionData && typeof sessionData === "object" ? sessionData : {};
  const totalAmount = Number(data.amountTotal || 0);
  const currency = String(data.currency || "sek").toUpperCase();
  const total = Number.isFinite(totalAmount)
    ? (Math.max(0, totalAmount) / 100).toFixed(2)
    : "0.00";
  const productName =
    String(data.productName || "").trim() || "RAGBAZ purchase";
  const payload = {
    status: "processing",
    currency,
    set_paid: true,
    customer_note: `RAGBAZ checkout session ${String(data.sessionId || "").trim()}`,
    billing: {
      email: String(data.email || "").trim().toLowerCase(),
      first_name: "",
      last_name: "",
    },
    line_items: [
      {
        name: productName,
        quantity: 1,
        subtotal: total,
        total,
      },
    ],
    meta_data: Object.entries(data.metadata || {})
      .filter(([key, value]) => String(key).trim() && value !== undefined && value !== null)
      .map(([key, value]) => ({ key: String(key), value: String(value) })),
  };
  return wcRequest("/wp-json/wc/v3/orders", {
    method: "POST",
    config,
    body: payload,
  });
}
