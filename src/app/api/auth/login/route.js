import { NextResponse } from "next/server";
import { createSessionCookie, createSessionToken } from "@/auth";
import { validateUserPassword } from "@/lib/userStore";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const user = await validateUserPassword(email, password);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Fel e-postadress eller lösenord." },
        { status: 401 },
      );
    }

    const token = createSessionToken(user);
    const response = NextResponse.json({ ok: true, user });
    response.headers.append("Set-Cookie", createSessionCookie(token));
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Det gick inte att logga in just nu. Försök igen." },
      { status: 400 },
    );
  }
}
