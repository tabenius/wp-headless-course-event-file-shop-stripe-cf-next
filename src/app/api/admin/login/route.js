import { NextResponse } from "next/server";
import { t } from "@/lib/i18n";
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
        { ok: false, error: t("apiErrors.adminNotConfigured") },
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
    if (!(await validateAdminCredentials(email, password))) {
      return NextResponse.json(
        { ok: false, error: t("apiErrors.adminCredentialsRejected") },
        { status: 401 },
      );
    }
    const token = await createAdminSessionToken(email);
    const response = NextResponse.json({ ok: true });
    response.headers.append("Set-Cookie", createAdminSessionCookie(token));
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: t("authErrors.loginError") },
      { status: 400 },
    );
  }
}
