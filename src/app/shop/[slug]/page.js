import { notFound } from "next/navigation";
import { auth } from "@/auth";
import ShopProductDetail from "@/components/shop/ShopProductDetail";
import { grantDigitalAccess, hasDigitalAccess } from "@/lib/digitalAccessStore";
import { grantCourseAccess } from "@/lib/courseAccess";
import { getDigitalProductBySlug } from "@/lib/digitalProducts";
import { fetchStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";
import { appendServerLog } from "@/lib/serverLog";
import { StorefrontDetailSkeleton } from "@/components/common/StorefrontSkeletons";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

async function ShopProductPageContent({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const slug = typeof params?.slug === "string" ? params.slug : "";
  let product;
  try {
    product = await getDigitalProductBySlug(slug);
  } catch {
    notFound();
  }
  if (!product || !product.active) notFound();

  const session = await auth();
  const userEmail = session?.user?.email || "";

  const checkoutStatus =
    typeof searchParams?.checkout === "string" ? searchParams.checkout : "";
  const checkoutSessionId =
    typeof searchParams?.session_id === "string" ? searchParams.session_id : "";

  if (userEmail && checkoutStatus === "success" && checkoutSessionId) {
    try {
      const stripeSession = await fetchStripeCheckoutSession(checkoutSessionId);
      const paymentStatus = stripeSession?.payment_status;
      const paidEmail = (
        stripeSession?.customer_details?.email ||
        stripeSession?.metadata?.user_email ||
        ""
      ).toLowerCase();
      const purchaseKind = stripeSession?.metadata?.purchase_kind || "";
      const paidProductId = stripeSession?.metadata?.digital_product_id || "";
      const paidCourseUri = stripeSession?.metadata?.course_uri || "";

      if (
        paymentStatus === "paid" &&
        paidEmail === userEmail.toLowerCase() &&
        paidProductId === product.id
      ) {
        if (
          purchaseKind === "digital_file" ||
          purchaseKind === "course_product" ||
          purchaseKind === "asset_product"
        ) {
          await grantDigitalAccess(product.id, userEmail);
        }
        if (purchaseKind === "course_product" && paidCourseUri) {
          await grantCourseAccess(paidCourseUri, userEmail);
        }
      }
    } catch (error) {
      console.error("Failed to confirm product purchase:", error);
    }
  }

  let owned = false;
  let accessCheckFailed = false;
  if (userEmail) {
    try {
      owned = await hasDigitalAccess(product.id, userEmail);
    } catch (err) {
      accessCheckFailed = true;
      appendServerLog({
        level: "error",
        msg: `hasDigitalAccess failed for product ${product.id} (user: ${userEmail}): ${err?.message || err}`,
      }).catch(() => {});
    }
  }

  return (
    <ShopProductDetail
      user={session?.user || null}
      product={product}
      owned={owned}
      accessCheckFailed={accessCheckFailed}
      stripeEnabled={isStripeEnabled()}
      checkoutStatus={checkoutStatus}
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
