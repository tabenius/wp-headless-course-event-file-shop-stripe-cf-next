import { NextResponse } from "next/server";
import { createUser } from "@/lib/userStore";
import { createSessionCookie, createSessionToken } from "@/auth";
import { t } from "@/lib/i18n";

function badRequest(message) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password =
      typeof body?.password === "string" ? body.password : "";

    if (name.length < 2) {
      return badRequest(t("apiErrors.nameTooShort"));
    }
    if (!email.includes("@")) {
      return badRequest(t("apiErrors.invalidEmail"));
    }
    if (password.length < 8) {
      return badRequest(t("apiErrors.passwordTooShort"));
    }

    const user = await createUser({ name, email, password });

    // Set session cookie directly — avoids a second KV read that may fail
    // due to eventual consistency on Cloudflare Workers.
    const token = await createSessionToken(user);
    const response = NextResponse.json({ ok: true, user }, { status: 201 });
    response.headers.append("Set-Cookie", createSessionCookie(token));
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";
    const status = message === "Email already exists" ? 409 : 400;
    const localizedMessage =
      message === "Email already exists"
        ? t("authErrors.emailExists")
        : t("authErrors.registerError");
    return NextResponse.json({ ok: false, error: localizedMessage }, { status });
  }
}
