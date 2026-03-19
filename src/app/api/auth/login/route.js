import { NextResponse } from "next/server";
import { createSessionCookie, createSessionToken } from "@/auth";
import { validateUserPassword } from "@/lib/userStore";
import { t } from "@/lib/i18n";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit("login", ip, 10);
    if (rl.limited) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.rateLimited") },
        { status: 429 },
      );
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const user = await validateUserPassword(email, password);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: t("authErrors.wrongCredentials") },
        { status: 401 },
      );
    }

    const token = await createSessionToken(user);
    const response = NextResponse.json({ ok: true, user });
    response.headers.append("Set-Cookie", createSessionCookie(token));
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: t("authErrors.loginError") },
      { status: 400 },
    );
  }
}
