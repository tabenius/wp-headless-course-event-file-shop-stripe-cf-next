import { notFound } from "next/navigation";
import { auth } from "@/auth";
import ShopProductDetail from "@/components/shop/ShopProductDetail";
import { grantDigitalAccess, hasDigitalAccess } from "@/lib/digitalAccessStore";
import { grantCourseAccess } from "@/lib/courseAccess";
import { getDigitalProductBySlug } from "@/lib/digitalProducts";
import { fetchStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";

export default async function ShopProductPage({ params, searchParams }) {
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const product = await getDigitalProductBySlug(slug);
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
        if (purchaseKind === "digital_file" || purchaseKind === "course_product") {
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

  const owned = userEmail ? await hasDigitalAccess(product.id, userEmail) : false;

  return (
    <ShopProductDetail
      user={session?.user || null}
      product={product}
      owned={owned}
      stripeEnabled={isStripeEnabled()}
      checkoutStatus={checkoutStatus}
    />
  );
}

export async function generateMetadata({ params }) {
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const product = await getDigitalProductBySlug(slug);
  if (!product) {
    return { title: "Shop - RAGBAZ" };
  }
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_WORDPRESS_URL ||
    "https://example.com";
  const canonical = `${baseUrl.replace(/\/+$/, "")}/shop/${encodeURIComponent(product.slug)}`;
  const description =
    product.description || (product.type === "course" ? "Köp kurs och få tillgång direkt." : "Köp digital fil och ladda ner direkt.");
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
      type: "product",
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
