import { notFound } from "next/navigation";
import ShopProductDetail from "@/components/shop/ShopProductDetail";
import { getDigitalProductBySlug } from "@/lib/digitalProducts";
import { isStripeEnabled } from "@/lib/stripe";
import { StorefrontDetailSkeleton } from "@/components/common/StorefrontSkeletons";
import { Suspense } from "react";
import site from "@/lib/site";

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
    <ShopProductDetail product={product} stripeEnabled={isStripeEnabled()} />
  );
}

export default function ShopProductPage(props) {
  return (
    <Suspense fallback={<StorefrontDetailSkeleton />}>
      <ShopProductPageContent {...props} />
    </Suspense>
  );
}

function inferOgDescription(product) {
  const explicit = String(product?.description || "").trim();
  if (explicit) return explicit;
  const isFree =
    product?.free === true || Number(product?.priceCents || 0) <= 0;
  const kind = product?.type === "course" ? "course" : "digital file";
  if (isFree) return `${product?.name || "Product"} is a free ${kind}.`;
  const amount = Number.isFinite(Number(product?.priceCents))
    ? Math.max(0, Math.round(Number(product.priceCents) / 100))
    : 0;
  const currency = String(product?.currency || "SEK").toUpperCase();
  return `${product?.name || "Product"} is available as a ${kind} for ${amount} ${currency}.`;
}

function inferOgImages(product) {
  const imageUrl = String(product?.imageUrl || "").trim();
  if (imageUrl) {
    return [{ url: imageUrl, alt: product?.name || "Product image" }];
  }
  const fileUrl = String(product?.fileUrl || "").trim();
  if (
    fileUrl &&
    String(product?.mimeType || "")
      .toLowerCase()
      .startsWith("image/")
  ) {
    return [{ url: fileUrl, alt: product?.name || "Product image" }];
  }
  return [
    {
      url: site.logoUrl,
      alt: site.logo?.alt || site.name || "Storefront logo",
    },
  ];
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
  const baseUrl = String(site.url || "https://example.com").replace(/\/+$/, "");
  const canonical = `${baseUrl}/shop/${encodeURIComponent(product.slug)}`;
  const description = inferOgDescription(product);
  const images = inferOgImages(product);

  return {
    title: `${product.name} | Shop`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${product.name} | Shop`,
      description,
      url: canonical,
      type: "article",
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
