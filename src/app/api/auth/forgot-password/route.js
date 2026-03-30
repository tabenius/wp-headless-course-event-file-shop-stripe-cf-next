import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/userStore";
import { writeCloudflareKvJson } from "@/lib/cloudflareKv";
import { sendEmail } from "@/lib/email";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";

const RESET_TTL = 86400; // 24 hours

async function sendResetEmail(to, resetUrl) {
  await sendEmail({
    to,
    subject: t("resetPassword.emailSubject"),
    html: [
      `<p>${t("resetPassword.emailBody")}</p>`,
      `<p><a href="${resetUrl}">${t("resetPassword.emailLinkText")}</a></p>`,
      `<p style="color:#888;font-size:13px">${t("resetPassword.emailExpiry")}</p>`,
    ].join(""),
  });
}

export async function POST(request) {
  try {
    const { email } = await request.json();
    const normalized =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalized || !normalized.includes("@")) {
      return NextResponse.json(
        { ok: false, error: t("authErrors.invalidEmail") },
        { status: 400 },
      );
    }

    // Look up user — but always return same response to prevent enumeration
    const user = await findUserByEmail(normalized);

    if (user) {
      const token = crypto.randomUUID();
      const kvKey = `password-reset:${token}`;

      await writeCloudflareKvJson(
        kvKey,
        {
          email: normalized,
          createdAt: new Date().toISOString(),
        },
        { expirationTtl: RESET_TTL },
      );

      const origin =
        process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const resetUrl = `${origin}/auth/reset-password?token=${token}`;

      try {
        await sendResetEmail(normalized, resetUrl);
      } catch (emailError) {
        console.error("Password reset email failed:", emailError);
      }
    } else {
      console.log("Forgot password: no user found for", normalized);
    }

    // Always return success
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json(
      { ok: false, error: t("resetPassword.requestFailed") },
      { status: 500 },
    );
  }
}
