import { NextResponse } from "next/server";
import {
  readPasswordResetToken,
  deletePasswordResetToken,
  maybeCleanupExpiredTokens,
} from "@/lib/passwordResetStore";
import { updateUserPassword } from "@/lib/userStore";
import { t } from "@/lib/i18n";

export async function POST(request) {
  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { ok: false, error: t("resetPassword.invalidToken") },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { ok: false, error: t("authErrors.passwordTooShort", { min: 8 }) },
        { status: 400 },
      );
    }

    const data = await readPasswordResetToken(token);

    if (!data?.email) {
      return NextResponse.json(
        { ok: false, error: t("resetPassword.tokenExpired") },
        { status: 400 },
      );
    }

    await updateUserPassword(data.email, password);

    // Delete token so it can't be reused
    await deletePasswordResetToken(token).catch(() => {});
    maybeCleanupExpiredTokens();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json(
      { ok: false, error: t("resetPassword.resetFailed") },
      { status: 500 },
    );
  }
}
