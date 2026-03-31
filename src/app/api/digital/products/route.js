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
        productMode: product.productMode,
        priceCents: product.priceCents,
        currency: product.currency,
        // fileUrl intentionally omitted — never expose raw storage URLs to clients
        // contentUri only for manual_uri (course/event) products
        ...(product.type === "course" || product.productMode === "manual_uri"
          ? { contentUri: product.contentUri }
          : {}),
        assetId: product.assetId,
        mimeType: product.mimeType,
        vatPercent: product.vatPercent,
        categories: product.categories,
        categorySlugs: product.categorySlugs,
        active: product.active,
      })),
    });
  } catch (error) {
    console.error("Failed to list digital products:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load products" },
      { status: 500 },
    );
  }
}
