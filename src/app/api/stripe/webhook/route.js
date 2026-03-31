import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { grantContentAccess } from "@/lib/contentAccess";
import { grantDigitalAccess } from "@/lib/digitalAccessStore";
import { sendEmail } from "@/lib/email";
import { tenantConfig } from "@/lib/tenantConfig";
import {
  readWcProxySettings,
  readWcRestApiSettings,
} from "@/lib/adminSettingsStore";
import { createWcOrder } from "@/lib/wooCommerceApi";

export const runtime = "nodejs";

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

async function maybeForwardToWcProxy(rawBody, eventType) {
  try {
    const proxy = await readWcProxySettings();
    if (!proxy?.enabled || !proxy?.url) return;
    const response = await fetch(proxy.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RAGBAZ-Relay": "stripe-webhook",
        "X-RAGBAZ-Stripe-Event": String(eventType || ""),
      },
      body: rawBody,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        "WC proxy forward failed:",
        response.status,
        text.slice(0, 240),
      );
    }
  } catch (error) {
    console.warn("WC proxy forwarding failed:", error);
  }
}

async function maybeSyncWcOrder(session, email) {
  try {
    const config = await readWcRestApiSettings();
    if (
      !config?.sendOrders ||
      !config?.wcUrl ||
      !config?.consumerKey ||
      !config?.consumerSecret
    ) {
      return;
    }
    const productName =
      session?.metadata?.product_name ||
      session?.metadata?.course_title ||
      session?.metadata?.course_uri ||
      "RAGBAZ purchase";
    await createWcOrder(
      {
        email,
        productName,
        amountTotal: session?.amount_total,
        currency: session?.currency,
        sessionId: session?.id,
        metadata: session?.metadata || {},
      },
      config,
    );
  } catch (error) {
    console.error("WC order sync failed:", error);
  }
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
    await maybeForwardToWcProxy(rawBody, event?.type);
    if (event?.type === "checkout.session.completed") {
      const session = event?.data?.object || {};
      const paymentStatus = session?.payment_status;
      const purchaseKind = session?.metadata?.purchase_kind || "course";
      const courseUri = session?.metadata?.course_uri || "";
      const digitalProductId = session?.metadata?.digital_product_id || "";
      const assetId = session?.metadata?.asset_id || "";
      const email = (
        session?.customer_details?.email ||
        session?.metadata?.user_email ||
        ""
      ).toLowerCase();

      if (paymentStatus === "paid" && email) {
        await maybeSyncWcOrder(session, email);
        if (
          (purchaseKind === "digital_file" ||
            purchaseKind === "course_product" ||
            purchaseKind === "asset_product") &&
          digitalProductId
        ) {
          await grantDigitalAccess(digitalProductId, email);
          if (purchaseKind === "course_product" && courseUri) {
            await grantContentAccess(courseUri, email);
          }
        } else if (courseUri) {
          await grantContentAccess(courseUri, email);
        }

        // Send purchase confirmation email
        try {
          const origin =
            process.env.NEXT_PUBLIC_SITE_URL ||
            process.env.NEXT_PUBLIC_WORDPRESS_URL ||
            tenantConfig.siteUrl ||
            "https://www.example.com";
          const productName =
            session?.metadata?.product_name ||
            session?.metadata?.course_title ||
            session?.metadata?.course_uri ||
            "din produkt";
          const amountTotal = session?.amount_total;
          const currency = (session?.currency || "sek").toUpperCase();
          const formattedAmount =
            typeof amountTotal === "number"
              ? `${(amountTotal / 100).toFixed(2)} ${currency}`
              : "";

          let productUrl = origin;
          if (courseUri) {
            productUrl = `${origin}${courseUri}`;
          } else if (digitalProductId) {
            const slug = session?.metadata?.product_slug || digitalProductId;
            productUrl = `${origin}/digital/${encodeURIComponent(slug)}`;
          }

          await sendEmail({
            to: email,
            subject: `Orderbekräftelse – ${productName}`,
            html: [
              `<h2>Tack för ditt köp!</h2>`,
              `<p>Hej,</p>`,
              `<p>Vi har tagit emot din betalning${formattedAmount ? ` på <strong>${formattedAmount}</strong>` : ""}.</p>`,
              `<p><strong>Produkt:</strong> ${productName}</p>`,
              `<p><a href="${productUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;">Öppna ${courseUri ? "kursen" : "produkten"}</a></p>`,
              `<p style="color:#888;font-size:13px;">Logga in med ${email} för att komma åt ditt innehåll.</p>`,
              `<br><p style="color:#888;font-size:13px;">– ${tenantConfig.brandSignature || "Support Team"}</p>`,
            ].join(""),
          });
        } catch (emailErr) {
          console.error("Purchase confirmation email failed:", emailErr);
        }
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
