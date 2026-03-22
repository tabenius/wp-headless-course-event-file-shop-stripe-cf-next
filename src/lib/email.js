/**
 * Send an email via the Resend API.
 * Optionally BCC tenant-defined notification inboxes.
 */
import { tenantConfig } from "@/lib/tenantConfig";

export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Email service is not configured");
  }

  const bcc = Array.from(
    new Set(
      [
        ...tenantConfig.notificationBcc,
        ...String(process.env.NOTIFICATION_BCC || "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ].filter(Boolean)
    )
  );

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    ...(bcc.length ? { bcc } : {}),
    subject,
    html,
  };

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
  return body;
}
