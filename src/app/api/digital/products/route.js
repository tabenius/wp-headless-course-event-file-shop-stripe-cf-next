import { NextResponse } from "next/server";
import { listDigitalProducts } from "@/lib/digitalProducts";

export async function GET() {
  try {
    const products = await listDigitalProducts();
    return NextResponse.json({
      ok: true,
      products: products.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        title: product.title,
        description: product.description,
        imageUrl: product.imageUrl,
        type: product.type,
        priceCents: product.priceCents,
        currency: product.currency,
        fileUrl: product.fileUrl,
        courseUri: product.courseUri,
        active: product.active,
      })),
    });
  } catch (error) {
    console.error("Failed to list digital products:", error);
    return NextResponse.json({ ok: false, error: "Failed to load products" }, { status: 500 });
  }
}
