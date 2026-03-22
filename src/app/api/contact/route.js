import { NextResponse } from "next/server";
import { z } from "zod";
import site from "@/lib/site";
import { t } from "@/lib/i18n";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { tenantConfig } from "@/lib/tenantConfig";

const ContactSchema = z.object({
  name: z.string().trim().min(2, t("authErrors.nameTooShort")),
  email: z.string().trim().email(t("authErrors.invalidEmail")),
  message: z.string().trim().min(10),
});

function getTargetEmail() {
  return (
    site?.contact?.email ||
    process.env.CONTACT_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    tenantConfig.supportEmail ||
    "support@example.com"
  );
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit("contact", ip, 5);
    if (rl.limited) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.rateLimited") },
        { status: 429 },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let rawBody;
    if (contentType.includes("application/json")) {
      rawBody = await request.json();
    } else {
      const form = await request.formData();
      rawBody = Object.fromEntries(form.entries());
    }

    const parsed = ContactSchema.safeParse(rawBody);
    if (!parsed.success) {
      const error =
        parsed.error.errors[0]?.message || t("contactApi.requiredFields");
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }
    const { name, email, message } = parsed.data;

    const to = getTargetEmail();

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const payload = {
        from: process.env.RESEND_FROM_EMAIL,
        to: [to],
        subject: t("contactApi.subject").replace("{name}", name),
        reply_to: email,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("Resend error:", res.status, errText);
        return NextResponse.json(
          { ok: false, error: t("contactApi.emailSendFailed") },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, message: t("contactApi.sent") });
    }

    // Fallback: email not configured
    return NextResponse.json(
      { ok: false, error: t("contactApi.notConfigured") },
      { status: 500 },
    );
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { ok: false, error: t("contactApi.sendError") },
      { status: 500 },
    );
  }
}
