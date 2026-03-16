import { NextResponse } from "next/server";
import site from "@/lib/site";

function getTargetEmail() {
  return (
    site?.contact?.email ||
    process.env.CONTACT_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    "info@xtas.nu"
  );
}

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body;
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
    const name = (body?.name || "").trim();
    const email = (body?.email || "").trim();
    const message = (body?.message || "").trim();
    if (!name || !email || !message) {
      return NextResponse.json({ ok: false, error: "Alla fält krävs." }, { status: 400 });
    }

    const to = getTargetEmail();

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const payload = {
        from: process.env.RESEND_FROM_EMAIL,
        to: [to],
        subject: `Kontaktformulär: ${name}`,
        reply_to: email,
        text: `Namn: ${name}\nE-post: ${email}\n\n${message}`,
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
        return NextResponse.json({ ok: false, error: "Kunde inte skicka e-post just nu." }, { status: 502 });
      }
      return NextResponse.json({ ok: true, message: "Tack! Vi återkommer snarast." });
    }

    // Fallback: mailto link guidance
    return NextResponse.json(
      {
        ok: false,
        error: "E-postleverans är inte konfigurerad. Ange RESEND_API_KEY och RESEND_FROM_EMAIL.",
      },
      { status: 500 },
    );
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { ok: false, error: "Kunde inte skicka meddelandet just nu." },
      { status: 500 },
    );
  }
}
