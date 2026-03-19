import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser } from "@/lib/userStore";
import { createSessionCookie, createSessionToken } from "@/auth";
import { t } from "@/lib/i18n";

const RegisterSchema = z.object({
  name: z.string().trim().min(2, t("apiErrors.nameTooShort")),
  email: z.string().trim().email(t("apiErrors.invalidEmail")),
  password: z.string().min(8, t("apiErrors.passwordTooShort")),
});

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      const error =
        parsed.error.errors[0]?.message || t("authErrors.registerFailed");
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }
    const { name, email, password } = parsed.data;

    const user = await createUser({ name, email, password });

    // Set session cookie directly — avoids a second KV read that may fail
    // due to eventual consistency on Cloudflare Workers.
    const token = await createSessionToken(user);
    const response = NextResponse.json({ ok: true, user }, { status: 201 });
    response.headers.append("Set-Cookie", createSessionCookie(token));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Email already exists" ? 409 : 400;
    const localizedMessage =
      message === "Email already exists"
        ? t("authErrors.emailExists")
        : t("authErrors.registerError");
    return NextResponse.json(
      { ok: false, error: localizedMessage },
      { status },
    );
  }
}
