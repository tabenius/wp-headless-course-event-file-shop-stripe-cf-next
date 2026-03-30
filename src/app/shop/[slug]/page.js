import { notFound } from "next/navigation";
import ShopProductDetail from "@/components/shop/ShopProductDetail";
import { getDigitalProductBySlug } from "@/lib/digitalProducts";
import { isStripeEnabled } from "@/lib/stripe";
import { StorefrontDetailSkeleton } from "@/components/common/StorefrontSkeletons";
import { Suspense } from "react";

export const revalidate = 300;

async function ShopProductPageContent({ params: paramsPromise }) {
  const params = await paramsPromise;
  const slug = typeof params?.slug === "string" ? params.slug : "";
  let product;
  try {
    product = await getDigitalProductBySlug(slug);
  } catch {
    notFound();
  }
  if (!product || !product.active) notFound();

  return (
    <ShopProductDetail
      product={product}
      stripeEnabled={isStripeEnabled()}
    />
  );
}

export default function ShopProductPage(props) {
  return (
    <Suspense fallback={<StorefrontDetailSkeleton />}>
      <ShopProductPageContent {...props} />
    </Suspense>
  );
}

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const slug = typeof params?.slug === "string" ? params.slug : "";
  let product;
  try {
    product = await getDigitalProductBySlug(slug);
  } catch {
    return { title: "Shop" };
  }
  if (!product) return { title: "Shop" };
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_WORDPRESS_URL ||
    "https://example.com";
  const canonical = `${baseUrl.replace(/\/+$/, "")}/shop/${encodeURIComponent(product.slug)}`;
  const description = product.description || "";
  const images = product.imageUrl
    ? [
        {
          url: product.imageUrl,
          alt: product.name,
        },
      ]
    : [];

  return {
    title: `${product.name} | Shop`,
    description,
    openGraph: {
      title: `${product.name} | Shop`,
      description,
      url: canonical,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} | Shop`,
      description,
      images: images.map((image) => image.url),
    },
  };
}
