import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import {
  listDigitalProducts,
  saveDigitalProducts,
} from "@/lib/digitalProducts";
import { t } from "@/lib/i18n";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const products = await listDigitalProducts({ includeInactive: true });
  return NextResponse.json({ ok: true, products });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const slug = (searchParams.get("slug") || "").trim();
    if (!slug) {
      return NextResponse.json(
        { ok: false, error: "Missing product slug." },
        { status: 400 },
      );
    }

    const products = await listDigitalProducts({ includeInactive: true });
    const target = products.find((p) => p?.slug === slug);
    if (!target) {
      return NextResponse.json(
        { ok: false, error: `Product "${slug}" not found.` },
        { status: 404 },
      );
    }

    const mode = target.productMode || "";
    if (mode === "manual_uri") {
      return NextResponse.json(
        { ok: false, error: "Course products cannot be deleted from here. Remove the course assignment instead." },
        { status: 400 },
      );
    }

    const remaining = products.filter((p) => p?.slug !== slug);
    const saved = await saveDigitalProducts(remaining);
    return NextResponse.json({ ok: true, deleted: slug, products: saved });
  } catch (error) {
    console.error("Admin product delete failed:", error);
    return NextResponse.json(
      { ok: false, error: `Could not delete product: ${error?.message || "unknown error"}.` },
      { status: 500 },
    );
  }
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
