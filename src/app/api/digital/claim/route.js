import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { grantDigitalAccess, hasDigitalAccess } from "@/lib/digitalAccessStore";
import { getDigitalProductBySlug } from "@/lib/digitalProducts";

export const runtime = "edge";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { ok: false, error: "Login required." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const productSlug = String(body?.productSlug || "").trim();
    if (!productSlug) {
      return NextResponse.json(
        { ok: false, error: "Missing product slug." },
        { status: 400 },
      );
    }

    const product = await getDigitalProductBySlug(productSlug);
    if (!product || !product.active) {
      return NextResponse.json(
        { ok: false, error: "Product not found." },
        { status: 404 },
      );
    }

    if (product.free !== true) {
      return NextResponse.json(
        { ok: false, error: "This product is not free." },
        { status: 400 },
      );
    }

    const email = session.user.email.toLowerCase();
    const alreadyOwned = await hasDigitalAccess(product.id, email);
    if (alreadyOwned) {
      return NextResponse.json({
        ok: true,
        alreadyOwned: true,
        redirectUrl: `/digital/${encodeURIComponent(product.slug)}`,
      });
    }

    await grantDigitalAccess(product.id, email);

    return NextResponse.json({
      ok: true,
      alreadyOwned: false,
      redirectUrl: `/digital/${encodeURIComponent(product.slug)}`,
    });
  } catch (error) {
    console.error("Digital free-claim failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not claim free access.",
      },
      { status: 500 },
    );
  }
}
