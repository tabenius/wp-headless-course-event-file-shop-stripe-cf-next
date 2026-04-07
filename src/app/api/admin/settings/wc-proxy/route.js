import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  readWcProxySettings,
  saveWcProxySettings,
} from "@/lib/adminSettingsStore";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  const settings = await readWcProxySettings();
  return NextResponse.json({ ok: true, settings });
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

  const enabled = Boolean(payload?.enabled);
  const url = String(payload?.url || "").trim();
  if (enabled && !url) {
    return NextResponse.json(
      {
        ok: false,
        error: "A HTTPS proxy URL is required when proxy is enabled.",
      },
      { status: 400 },
    );
  }
  const settings = await saveWcProxySettings({ enabled, url });
  return NextResponse.json({ ok: true, settings });
}
