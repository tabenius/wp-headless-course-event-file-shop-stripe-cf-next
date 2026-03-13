import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/userStore";
import { writeCloudflareKvJson } from "@/lib/cloudflareKv";
import { t } from "@/lib/i18n";

const RESET_TTL = 86400; // 24 hours

async function sendResetEmail(to, resetUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("Resend not configured: RESEND_API_KEY=%s RESEND_FROM_EMAIL=%s", !!apiKey, !!from);
    throw new Error("Email service is not configured");
  }

  const payload = {
    from,
    to: [to],
    subject: t("resetPassword.emailSubject"),
    html: [
      `<p>${t("resetPassword.emailBody")}</p>`,
      `<p><a href="${resetUrl}">${t("resetPassword.emailLinkText")}</a></p>`,
      `<p style="color:#888;font-size:13px">${t("resetPassword.emailExpiry")}</p>`,
    ].join(""),
  };

  console.log("Sending reset email to:", to, "from:", from);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    console.error("Resend API error:", response.status, body);
    throw new Error("Failed to send email");
  }
  console.log("Reset email sent:", body);
}

export async function POST(request) {
  try {
    const { email } = await request.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";

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

      await writeCloudflareKvJson(kvKey, {
        email: normalized,
        createdAt: new Date().toISOString(),
      }, { expirationTtl: RESET_TTL });

      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
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
