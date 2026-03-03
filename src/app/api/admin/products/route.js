import { NextResponse } from "next/server";
import { getAdminSessionFromCookieHeader } from "@/auth";
import { listDigitalProducts, saveDigitalProducts } from "@/lib/digitalProducts";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Du behöver logga in som administratör." },
    { status: 401 },
  );
}

export async function GET(request) {
  const session = getAdminSessionFromCookieHeader(request.headers.get("cookie") || "");
  if (!session) return unauthorized();

  const products = await listDigitalProducts({ includeInactive: true });
  return NextResponse.json({ ok: true, products });
}

export async function PUT(request) {
  const session = getAdminSessionFromCookieHeader(request.headers.get("cookie") || "");
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const products = Array.isArray(body?.products) ? body.products : [];
    const saved = await saveDigitalProducts(products);
    return NextResponse.json({ ok: true, products: saved });
  } catch (error) {
    console.error("Admin product save failed:", error);
    return NextResponse.json(
      { ok: false, error: "Det gick inte att spara produktlistan." },
      { status: 400 },
    );
  }
}
