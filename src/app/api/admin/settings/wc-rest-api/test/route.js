import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { readWcRestApiSettings } from "@/lib/adminSettingsStore";
import { testWcConnection } from "@/lib/wooCommerceApi";

export const runtime = "edge";

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;

  try {
    let payload = {};
    try {
      payload = (await request.json()) || {};
    } catch {
      payload = {};
    }
    const current = await readWcRestApiSettings();
    const settings = {
      ...current,
      wcUrl: String(payload?.wcUrl || current.wcUrl || "").trim(),
      consumerKey: String(
        payload?.consumerKey || current.consumerKey || "",
      ).trim(),
      consumerSecret: String(
        payload?.consumerSecret || current.consumerSecret || "",
      ).trim(),
      sendOrders:
        payload?.sendOrders === undefined
          ? current.sendOrders
          : Boolean(payload.sendOrders),
      readTax:
        payload?.readTax === undefined
          ? current.readTax
          : Boolean(payload.readTax),
    };
    await testWcConnection(settings);
    return NextResponse.json({
      ok: true,
      message: "WooCommerce REST API connection succeeded.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Could not connect to WooCommerce REST API with current settings.",
      },
      { status: 400 },
    );
  }
}
