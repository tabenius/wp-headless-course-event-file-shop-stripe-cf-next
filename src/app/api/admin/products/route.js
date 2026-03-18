import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { listDigitalProducts, saveDigitalProducts } from "@/lib/digitalProducts";
import { t } from "@/lib/i18n";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const products = await listDigitalProducts({ includeInactive: true });
  return NextResponse.json({ ok: true, products });
}

export async function PUT(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const products = Array.isArray(body?.products) ? body.products : [];
    const saved = await saveDigitalProducts(products);
    return NextResponse.json({ ok: true, products: saved });
  } catch (error) {
    console.error("Admin product save failed:", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.saveProductsFailed") },
      { status: 400 },
    );
  }
}
