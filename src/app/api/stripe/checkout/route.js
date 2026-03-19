import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { auth, createSessionToken, createSessionCookie } from "@/auth";
import { getCourseAccessConfig } from "@/lib/courseAccess";
import { createStripeCheckoutSession, isStripeEnabled } from "@/lib/stripe";
import { findUserByEmail, createUser } from "@/lib/userStore";
import { writeCloudflareKvJson } from "@/lib/cloudflareKv";
import { fetchGraphQL } from "@/lib/client";
import { parsePriceCents } from "@/lib/parsePrice";
import { sendEmail } from "@/lib/email";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { createTicket } from "@/lib/supportTickets";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const CheckoutSchema = z
  .object({
    contentUri: z.string().trim().min(1).optional(),
    courseUri: z.string().trim().min(1).optional(),
    contentTitle: z.string().trim().optional(),
    courseTitle: z.string().trim().optional(),
    contentKind: z.enum(["course", "event", "product"]).optional(),
    guestEmail: z
      .string()
      .trim()
      .email(t("authErrors.invalidEmail"))
      .optional()
      .or(z.literal("")),
  })
  .refine((d) => d.contentUri || d.courseUri, {
    message: t("apiErrors.contentNotReady"),
  });

const SETUP_TTL = 86400; // 24 hours

function normalizeUri(uri) {
  const value = String(uri || "").trim();
  if (!value) return "";
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.replace(/\/+$/, "") || "/";
}

function uriMatches(a, b) {
  return normalizeUri(a) === normalizeUri(b);
}

async function resolveWooPriceCentsByUri(courseUri) {
  try {
    const data = await fetchGraphQL(
      `{
        products(first: 100, where: { status: "publish" }) {
          edges {
            node {
              ... on SimpleProduct { uri price regularPrice }
              ... on VariableProduct { uri price regularPrice }
              ... on ExternalProduct { uri price regularPrice }
            }
          }
        }
      }`,
      {},
      300,
    );
    const rows = (data?.products?.edges || []).map((edge) => edge.node);
    const match = rows.find((product) => uriMatches(product?.uri, courseUri));
    if (!match) return 0;
    return parsePriceCents(match.price || match.regularPrice || "");
  } catch {
    return 0;
  }
}

async function resolveLpPriceCentsByUri(courseUri) {
  try {
    const data = await fetchGraphQL(
      `{
        lpCourses(first: 100) {
          edges {
            node {
              uri
              price
              priceRendered
            }
          }
        }
      }`,
      {},
      300,
    );
    const rows = (data?.lpCourses?.edges || []).map((edge) => edge.node);
    const match = rows.find((course) => uriMatches(course?.uri, courseUri));
    if (!match) return 0;
    return parsePriceCents(match.priceRendered || match.price || "");
  } catch {
    return 0;
  }
}

async function resolveWordPressPriceCents(courseUri) {
  const normalized = normalizeUri(courseUri);
  if (!normalized) return 0;
  const wooPrice = await resolveWooPriceCentsByUri(normalized);
  if (wooPrice > 0) return wooPrice;
  const lpPrice = await resolveLpPriceCentsByUri(normalized);
  if (lpPrice > 0) return lpPrice;
  return 0;
}

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
  const ip = getClientIp(request);
  const rl = await checkRateLimit("checkout", ip, 10);
  if (rl.limited) {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.rateLimited") },
      { status: 429 },
    );
  }

  const session = await auth();
  let userEmail = session?.user?.email || "";

  // Parse and validate request body
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: t("apiErrors.contentNotReady") },
      { status: 400 },
    );
  }
  const parsed = CheckoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    const error =
      parsed.error.errors[0]?.message || t("apiErrors.contentNotReady");
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }
  const body = parsed.data;

  const guestEmail = (body.guestEmail || "").toLowerCase();

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
    const courseUri = body.contentUri || body.courseUri || "";
    const courseTitle = body.contentTitle || body.courseTitle || "";
    const contentKind = body.contentKind ?? "course";

    if (!courseUri) {
      console.error("Stripe checkout request rejected: missing content URI");
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
    if (config?.active === false) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.contentNotReady") },
        { status: 400 },
      );
    }
    const configuredPriceCents = config?.priceCents ?? 0;
    const fallbackWordPressPriceCents =
      configuredPriceCents > 0
        ? 0
        : await resolveWordPressPriceCents(courseUri);
    const priceCents = Math.max(configuredPriceCents, fallbackWordPressPriceCents);
    const currency = (config?.currency || "SEK").toUpperCase();

    if (priceCents <= 0) {
      console.error(
        `Stripe checkout unavailable for ${courseUri}: missing or invalid course price`,
      );
      logCheckoutIssue(
        "Checkout blocked: no price configured",
        `The item ${courseUri} (${contentKind}) has no usable price in course-access KV or WordPress source data.`,
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
