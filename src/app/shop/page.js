import { auth } from "@/auth";
import ShopIndex from "@/components/shop/ShopIndex";
import {
  listAccessibleDigitalProductIds,
  grantDigitalAccess,
} from "@/lib/digitalAccessStore";
import { grantCourseAccess, hasCourseAccess } from "@/lib/courseAccess";
import { listAllShopItems } from "@/lib/shopProducts";
import { fetchStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";
import { appendServerLog } from "@/lib/serverLog";
import site from "@/lib/site";

export const metadata = {
  title: site.pages.shop.title,
  description: site.pages.shop.description,
  alternates: { canonical: "/shop" },
};

export default async function ShopPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const session = await auth();
  const userEmail = session?.user?.email || "";

  const checkoutStatus =
    typeof searchParams?.checkout === "string" ? searchParams.checkout : "";
  const checkoutSessionId =
    typeof searchParams?.session_id === "string" ? searchParams.session_id : "";
  const checkoutProductId =
    typeof searchParams?.product_id === "string" ? searchParams.product_id : "";

  let checkoutError = false;
  if (
    userEmail &&
    checkoutStatus === "success" &&
    checkoutSessionId &&
    checkoutProductId
  ) {
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
        paidProductId === checkoutProductId
      ) {
        if (
          purchaseKind === "digital_file" ||
          purchaseKind === "course_product"
        ) {
          await grantDigitalAccess(paidProductId, userEmail);
        }
        if (purchaseKind === "course_product" && paidCourseUri) {
          await grantCourseAccess(paidCourseUri, userEmail);
        }
      }
    } catch (error) {
      console.error("Failed to confirm shop purchase:", error);
      checkoutError = true;
    }
  }

  const [items, ownedProductIds] = await Promise.all([
    listAllShopItems(),
    userEmail
      ? listAccessibleDigitalProductIds(userEmail).catch((err) => {
          appendServerLog({
            level: "error",
            msg: `listAccessibleDigitalProductIds failed for ${userEmail}: ${err?.message || err}`,
          }).catch(() => {});
          return [];
        })
      : Promise.resolve([]),
  ]);

  // Check course/event/product access for WP items the user might own
  let ownedUris = [];
  let accessBatchFailed = false;
  if (userEmail) {
    const wpItems = items.filter((i) => i.source !== "digital");
    const accessChecks = await Promise.all(
      wpItems.map((item) =>
        hasCourseAccess(item.uri, userEmail)
          .then((has) => (has ? item.uri : null))
          .catch((err) => {
            accessBatchFailed = true;
            appendServerLog({
              level: "error",
              msg: `hasCourseAccess failed for ${item.uri} (user: ${userEmail}): ${err?.message || err}`,
            }).catch(() => {});
            return null;
          }),
      ),
    );
    ownedUris = accessChecks.filter(Boolean);
  }

  return (
    <ShopIndex
      user={session?.user || null}
      items={items}
      ownedProductIds={ownedProductIds}
      ownedUris={ownedUris}
      accessBatchFailed={accessBatchFailed}
      stripeEnabled={isStripeEnabled()}
      checkoutStatus={checkoutStatus}
      checkoutError={checkoutError}
    />
  );
}
