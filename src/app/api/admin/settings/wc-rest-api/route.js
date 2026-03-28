import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  readWcRestApiSettings,
  saveWcRestApiSettings,
} from "@/lib/adminSettingsStore";

function toClientSettings(settings) {
  return {
    wcUrl: settings?.wcUrl || "",
    consumerKey: settings?.consumerKey || "",
    hasConsumerSecret: Boolean(settings?.consumerSecret),
    sendOrders: Boolean(settings?.sendOrders),
    readTax: Boolean(settings?.readTax),
    updatedAt: settings?.updatedAt || null,
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  const settings = await readWcRestApiSettings();
  return NextResponse.json({ ok: true, settings: toClientSettings(settings) });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  let payload = {};
  try {
    payload = (await request.json()) || {};
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const current = await readWcRestApiSettings();
  const wcUrl = String(payload?.wcUrl || "").trim();
  const consumerKey = String(payload?.consumerKey || "").trim();
  const consumerSecretRaw = String(payload?.consumerSecret || "").trim();
  const consumerSecret = consumerSecretRaw || current.consumerSecret || "";
  if (!wcUrl) {
    return NextResponse.json(
      { ok: false, error: "WooCommerce URL is required." },
      { status: 400 },
    );
  }
  if (!consumerKey) {
    return NextResponse.json(
      { ok: false, error: "WooCommerce consumer key is required." },
      { status: 400 },
    );
  }
  if (!consumerSecret) {
    return NextResponse.json(
      { ok: false, error: "WooCommerce consumer secret is required." },
      { status: 400 },
    );
  }

  const saved = await saveWcRestApiSettings({
    wcUrl,
    consumerKey,
    consumerSecret,
    sendOrders: Boolean(payload?.sendOrders),
    readTax: Boolean(payload?.readTax),
  });
  return NextResponse.json({ ok: true, settings: toClientSettings(saved) });
}
