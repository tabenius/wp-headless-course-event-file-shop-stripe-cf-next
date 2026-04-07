import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  readStripeKeyOverrides,
  saveStripeKeyOverrides,
  clearStripeKeyOverrides,
} from "@/lib/adminSettingsStore";

function maskSecret(secretKey) {
  const raw = String(secretKey || "").trim();
  if (!raw) return "";
  if (raw.length <= 12) return "************";
  return `${raw.slice(0, 8)}…${raw.slice(-4)}`;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  const settings = await readStripeKeyOverrides();
  return NextResponse.json({
    ok: true,
    settings: {
      enabled: Boolean(settings.enabled),
      hasSecretKey: Boolean(settings.secretKey),
      secretKeyMasked: maskSecret(settings.secretKey),
      publishableKey: settings.publishableKey || "",
      updatedAt: settings.updatedAt || null,
    },
  });
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
  const secretKey = String(payload?.secretKey || "").trim();
  const publishableKey = String(payload?.publishableKey || "").trim();
  if (enabled && !secretKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Secret key is required when overrides are enabled.",
      },
      { status: 400 },
    );
  }

  const saved = await saveStripeKeyOverrides({
    enabled,
    secretKey,
    publishableKey,
  });

  return NextResponse.json({
    ok: true,
    settings: {
      enabled: Boolean(saved.enabled),
      hasSecretKey: Boolean(saved.secretKey),
      secretKeyMasked: maskSecret(saved.secretKey),
      publishableKey: saved.publishableKey || "",
      updatedAt: saved.updatedAt || null,
    },
  });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  await clearStripeKeyOverrides();
  return NextResponse.json({ ok: true });
}
