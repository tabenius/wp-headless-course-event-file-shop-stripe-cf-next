/**
 * Send an email via the Resend API.
 * Always BCC info@xtas.nu on all outgoing emails.
 */
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Email service is not configured");
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    bcc: ["info@xtas.nu"],
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
