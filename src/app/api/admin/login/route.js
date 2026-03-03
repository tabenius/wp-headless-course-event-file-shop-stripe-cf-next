import { NextResponse } from "next/server";
import {
  createAdminSessionCookie,
  createAdminSessionToken,
  isAdminCredentialsConfigured,
  validateAdminCredentials,
} from "@/auth";

export async function POST(request) {
  try {
    if (!isAdminCredentialsConfigured()) {
      console.error(
        "Admin login unavailable: set ADMIN_EMAILS and ADMIN_PASSWORDS (or legacy ADMIN_USERNAME and ADMIN_PASSWORD).",
      );
      return NextResponse.json(
        { ok: false, error: "Adminområdet är inte klart ännu. Kontakta support." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const emailRaw =
      typeof body?.email === "string"
        ? body.email
        : typeof body?.username === "string"
          ? body.username
          : "";
    const email = emailRaw.trim().toLowerCase();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!validateAdminCredentials(email, password)) {
      return NextResponse.json(
        { ok: false, error: "Inloggningsuppgifterna godkändes inte." },
        { status: 401 },
      );
    }
    const token = createAdminSessionToken();
    const response = NextResponse.json({ ok: true });
    response.headers.append("Set-Cookie", createAdminSessionCookie(token));
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Det gick inte att logga in just nu. Försök igen." },
      { status: 400 },
    );
  }
}
