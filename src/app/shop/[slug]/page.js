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
