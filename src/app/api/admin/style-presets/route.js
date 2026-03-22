import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  getStylePresets,
  addStylePreset,
  removeStylePreset,
} from "@/lib/stylePresetsStore";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const presets = await getStylePresets();
    return NextResponse.json({ ok: true, cta: presets.cta, typography: presets.typography });
  } catch (error) {
    console.error("style-presets GET failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load presets" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, name, style } = body || {};
  const result = await addStylePreset(type, name, style);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, preset: result.preset });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const rawId = String(body?.id || "").trim();
  const type = body?.type;

  if (!rawId || rawId.length > 64) {
    return NextResponse.json(
      { ok: false, error: "id must be a non-empty string, max 64 chars" },
      { status: 400 },
    );
  }

  const result = await removeStylePreset(type, rawId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
