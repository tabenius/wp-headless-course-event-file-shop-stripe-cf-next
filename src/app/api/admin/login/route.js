import { NextResponse } from "next/server";
import {
  createAdminSessionCookie,
  createAdminSessionToken,
  validateAdminCredentials,
} from "@/auth";

export async function POST(request) {
  try {
    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
      console.error(
        "Admin login unavailable: ADMIN_USERNAME and/or ADMIN_PASSWORD are not configured.",
      );
      return NextResponse.json(
        { ok: false, error: "Adminområdet är inte klart ännu. Kontakta support." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const username = typeof body?.username === "string" ? body.username : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!validateAdminCredentials(username, password)) {
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
