import { NextResponse } from "next/server";
import { listDigitalProducts } from "@/lib/digitalProducts";

export async function GET() {
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
}
