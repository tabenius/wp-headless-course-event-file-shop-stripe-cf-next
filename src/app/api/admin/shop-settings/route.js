import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getShopSettings, saveShopSettings, ALL_TYPES } from "@/lib/shopSettings";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const settings = await getShopSettings();
  return NextResponse.json({ ok: true, settings, allTypes: ALL_TYPES });
}

export async function PUT(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

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
