import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listAccessibleDigitalProductIds,
  grantDigitalAccess,
} from "@/lib/digitalAccessStore";
import { grantContentAccess, listAccessibleContentUris } from "@/lib/contentAccess";
import { fetchStripeCheckoutSession } from "@/lib/stripe";
import { appendServerLog } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function normalizeUriList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter((entry) => entry.startsWith("/"))
    .slice(0, 600);
}

export async function POST(request) {
  const startedAt = Date.now();
  const session = await auth();
  const userEmail = String(session?.user?.email || "").trim().toLowerCase();

  let payload = {};
  try {
    payload = (await request.json()) || {};
  } catch {
    payload = {};
  }

  const checkoutStatus =
    typeof payload?.checkoutStatus === "string" ? payload.checkoutStatus : "";
  const checkoutSessionId =
    typeof payload?.checkoutSessionId === "string" ? payload.checkoutSessionId : "";
  const checkoutProductId =
    typeof payload?.checkoutProductId === "string" ? payload.checkoutProductId : "";
  const wpUris = normalizeUriList(payload?.uris);

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
      const paidEmail = String(
        stripeSession?.customer_details?.email ||
          stripeSession?.metadata?.user_email ||
          "",
      )
        .trim()
        .toLowerCase();
      const purchaseKind = stripeSession?.metadata?.purchase_kind || "";
      const paidProductId = stripeSession?.metadata?.digital_product_id || "";
      const paidCourseUri = stripeSession?.metadata?.course_uri || "";

      if (
        paymentStatus === "paid" &&
        paidEmail === userEmail &&
        paidProductId === checkoutProductId
      ) {
        if (
          purchaseKind === "digital_file" ||
          purchaseKind === "course_product" ||
          purchaseKind === "asset_product"
        ) {
          await grantDigitalAccess(paidProductId, userEmail);
        }
        if (purchaseKind === "course_product" && paidCourseUri) {
          await grantContentAccess(paidCourseUri, userEmail);
        }
      }
    } catch (error) {
      checkoutError = true;
      console.error("Failed to confirm shop purchase:", error);
      appendServerLog({
        level: "warn",
        msg: `shop ownership checkout confirm failed for ${userEmail || "anonymous"}: ${error?.message || error}`,
      }).catch(() => {});
    }
  }

  if (!userEmail) {
    return NextResponse.json({
      ok: true,
      user: null,
      ownedProductIds: [],
      ownedUris: [],
      accessBatchFailed: false,
      checkoutError,
    });
  }

  const ownedProductIds = await listAccessibleDigitalProductIds(userEmail).catch(
    (err) => {
      appendServerLog({
        level: "error",
        msg: `listAccessibleDigitalProductIds failed for ${userEmail}: ${err?.message || err}`,
      }).catch(() => {});
      return [];
    },
  );

  let ownedUris = [];
  let accessBatchFailed = false;
  if (wpUris.length > 0) {
    ownedUris = await listAccessibleContentUris(wpUris, userEmail).catch((err) => {
      accessBatchFailed = true;
      appendServerLog({
        level: "error",
        msg: `listAccessibleContentUris failed for ${userEmail}: ${err?.message || err}`,
      }).catch(() => {});
      return [];
    });
  }

  return NextResponse.json({
    ok: true,
    user: session?.user || null,
    ownedProductIds,
    ownedUris,
    accessBatchFailed,
    checkoutError,
    durationMs: Math.max(0, Date.now() - startedAt),
  });
}
