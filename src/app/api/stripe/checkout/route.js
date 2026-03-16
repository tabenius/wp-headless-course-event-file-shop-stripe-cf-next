import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { auth, createSessionToken, createSessionCookie } from "@/auth";
import { getCourseAccessConfig } from "@/lib/courseAccess";
import { createStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";
import { findUserByEmail, createUser } from "@/lib/userStore";
import { writeCloudflareKvJson } from "@/lib/cloudflareKv";
import { sendEmail } from "@/lib/email";
import { t } from "@/lib/i18n";
import { createTicket } from "@/lib/supportTickets";

const SETUP_TTL = 86400; // 24 hours

async function logCheckoutIssue(title, description, priority = "moderate") {
  try {
    await createTicket({ title, description, priority, author: "system" });
  } catch (err) {
    console.error("Failed to log checkout issue:", err);
  }
}

/** Generate a 20-character random password. */
function randomPassword() {
  return crypto.randomBytes(15).toString("base64url");
}

/** Send a "set your password" email for newly created guest accounts. */
async function sendSetPasswordEmail(email, origin) {
  const token = crypto.randomUUID();
  await writeCloudflareKvJson(
    `password-reset:${token}`,
    { email, createdAt: new Date().toISOString() },
    { expirationTtl: SETUP_TTL },
  );
  const resetUrl = `${origin}/auth/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: t("paywall.setPasswordSubject"),
    html: [
      `<p>${t("paywall.setPasswordBody")}</p>`,
      `<p><a href="${resetUrl}">${t("paywall.setPasswordLinkText")}</a></p>`,
      `<p style="color:#888;font-size:13px">${t("paywall.setPasswordExpiry")}</p>`,
    ].join(""),
  });
}

export async function POST(request) {
  const session = await auth();
  let userEmail = session?.user?.email || "";

  // Support guest checkout: accept guestEmail when not logged in
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.contentNotReady") },
      { status: 400 },
    );
  }

  const guestEmail =
    typeof body?.guestEmail === "string"
      ? body.guestEmail.trim().toLowerCase()
      : "";

  if (!userEmail && guestEmail && guestEmail.includes("@")) {
    // Guest checkout: find or create account
    const existing = await findUserByEmail(guestEmail);
    if (existing) {
      // Account exists — use it, but don't log them in (they haven't proved ownership)
      userEmail = existing.email;
    } else {
      // Create new account with random password
      try {
        const user = await createUser({
          name: guestEmail.split("@")[0],
          email: guestEmail,
          password: randomPassword(),
        });
        userEmail = user.email;

        // Send "set your password" email (fire and forget)
        const origin =
          process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
        sendSetPasswordEmail(userEmail, origin).catch((err) =>
          console.error("Failed to send set-password email:", err),
        );
      } catch (createError) {
        // If "Email already exists" race condition, try finding again
        const raceUser = await findUserByEmail(guestEmail);
        if (raceUser) {
          userEmail = raceUser.email;
        } else {
          console.error("Guest account creation failed:", createError);
          return NextResponse.json(
            { ok: false, error: t("apiErrors.checkoutFailed") },
            { status: 400 },
          );
        }
      }
    }
  }

  if (!userEmail) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.loginRequired") },
      { status: 401 },
    );
  }

  if (!isStripeEnabled()) {
    console.error(
      "Stripe checkout unavailable: STRIPE_SECRET_KEY is not configured",
    );
    return NextResponse.json(
      { ok: false, error: t("apiErrors.stripeUnavailable") },
      { status: 400 },
    );
  }

  try {
    const courseUri =
      typeof body?.contentUri === "string"
        ? body.contentUri
        : typeof body?.courseUri === "string"
          ? body.courseUri
          : "";
    const courseTitle =
      typeof body?.contentTitle === "string"
        ? body.contentTitle
        : typeof body?.courseTitle === "string"
          ? body.courseTitle
          : "";
    const rawKind = body?.contentKind;
    const contentKind =
      rawKind === "event"
        ? "event"
        : rawKind === "product"
          ? "product"
          : "course";

    if (!courseUri) {
      console.error(
        "Stripe checkout request rejected: missing content URI",
      );
      logCheckoutIssue(
        "Checkout failed: missing content URI",
        `Stripe checkout was requested but no content URI was resolved. Incoming body: ${JSON.stringify(body).slice(0, 500)}.`,
        "moderate",
      );
      return NextResponse.json(
        { ok: false, error: t("apiErrors.contentNotReady") },
        { status: 400 },
      );
    }

    const config = await getCourseAccessConfig(courseUri);
    const priceCents = config?.priceCents ?? 0;
    const currency = (config?.currency || "SEK").toUpperCase();

    if (priceCents <= 0) {
      console.error(
        `Stripe checkout unavailable for ${courseUri}: missing or invalid course price`,
      );
      logCheckoutIssue(
        "Checkout blocked: no price configured",
        `The item ${courseUri} (${contentKind}) has priceCents=${priceCents}. Set a price in the admin dashboard to enable payments.`,
        "moderate",
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            contentKind === "event"
              ? t("apiErrors.eventNotAvailable")
              : contentKind === "product"
                ? t("apiErrors.productNotAvailable")
                : t("apiErrors.courseNotAvailable"),
        },
        { status: 400 },
      );
    }

    const baseUrl = new URL(request.url).origin;
    const successUrl = `${baseUrl}${courseUri}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}${courseUri}?checkout=cancel`;

    const checkout = await createStripeCheckoutSession({
      courseUri,
      courseTitle,
      priceCents,
      currency,
      email: userEmail,
      successUrl,
      cancelUrl,
      contentKind,
    });

    // If this was a guest checkout, log them in via session cookie
    const headers = {};
    if (guestEmail && !session?.user?.email) {
      const user = await findUserByEmail(userEmail);
      if (user) {
        const token = createSessionToken(user);
        headers["Set-Cookie"] = createSessionCookie(token);
      }
    }

    return NextResponse.json(
      { ok: true, url: checkout.url, id: checkout.id },
      { headers },
    );
  } catch (error) {
    console.error("Stripe checkout failed:", error);
    return NextResponse.json(
      { ok: false, error: t("apiErrors.checkoutFailed") },
      { status: 400 },
    );
  }
}
