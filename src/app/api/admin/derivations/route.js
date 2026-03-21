import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { listDerivations, saveDerivation } from "@/lib/derivationsStore";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  const derivations = await listDerivations();
  return NextResponse.json({ ok: true, derivations });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth?.error) return auth.error;
  const payload = await request.json().catch(() => ({}));
  try {
    const saved = await saveDerivation(payload);
    return NextResponse.json({ ok: true, derivation: saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Could not save derivation." },
      { status: 400 },
    );
  }
}
