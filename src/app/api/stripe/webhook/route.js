import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { grantCourseAccess } from "@/lib/courseAccess";

function parseSignature(headerValue) {
  if (typeof headerValue !== "string") return {};
  const entries = headerValue.split(",").map((part) => part.trim());
  const parsed = {};
  for (const entry of entries) {
    const [key, value] = entry.split("=");
    if (key && value) parsed[key] = value;
  }
  return parsed;
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parsed = parseSignature(signatureHeader);
  const timestamp = parsed.t;
  const signature = parsed.v1;
  if (!timestamp || !signature || !secret) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

export async function POST(request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature") || "";
  const rawBody = await request.text();

  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    console.error(
      "Stripe webhook signature verification failed. Check STRIPE_WEBHOOK_SECRET and webhook signing secret.",
    );
    return NextResponse.json(
      { ok: false, error: "Ogiltig signatur." },
      { status: 400 },
    );
  }

  try {
    const event = JSON.parse(rawBody);
    if (event?.type === "checkout.session.completed") {
      const session = event?.data?.object || {};
      const paymentStatus = session?.payment_status;
      const courseUri = session?.metadata?.course_uri || "";
      const email = (
        session?.customer_details?.email ||
        session?.metadata?.user_email ||
        ""
      ).toLowerCase();

      if (paymentStatus === "paid" && courseUri && email) {
        await grantCourseAccess(courseUri, email);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return NextResponse.json(
      { ok: false, error: "Webhooken kunde inte behandlas." },
      { status: 400 },
    );
  }
}
