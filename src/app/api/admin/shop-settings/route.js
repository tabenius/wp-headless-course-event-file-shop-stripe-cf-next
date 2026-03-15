import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";
import { getShopSettings, saveShopSettings, ALL_TYPES } from "@/lib/shopSettings";
import { t } from "@/lib/i18n";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: t("apiErrors.adminLoginRequired") },
    { status: 401 },
  );
}

export async function GET(request) {
  const session = getAdminSessionFromCookieHeader(
    request.headers.get("cookie") || "",
  );
  if (!session) return unauthorized();

  const settings = await getShopSettings();
  return NextResponse.json({ ok: true, settings, allTypes: ALL_TYPES });
}

export async function PUT(request) {
  const session = getAdminSessionFromCookieHeader(
    request.headers.get("cookie") || "",
  );
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const saved = await saveShopSettings(body);
    return NextResponse.json({ ok: true, settings: saved });
  } catch (error) {
    console.error("Shop settings save error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to save shop settings." },
      { status: 500 },
    );
  }
}
