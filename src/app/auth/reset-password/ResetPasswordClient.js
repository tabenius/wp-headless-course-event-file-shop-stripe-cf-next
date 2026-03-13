"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { t } from "@/lib/i18n";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("authErrors.passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        setError(result?.error || t("resetPassword.resetFailed"));
        return;
      }

      setSuccess(true);
    } catch {
      setError(t("resetPassword.resetFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <section className="max-w-md mx-auto px-6 py-16">
        <p className="text-red-600">{t("resetPassword.invalidToken")}</p>
        <p className="mt-4 text-sm">
          <Link href="/auth/signin" className="hover:underline">
            {t("common.signIn")}
          </Link>
        </p>
      </section>
    );
  }

  if (success) {
    return (
      <section className="max-w-md mx-auto px-6 py-16 text-center space-y-4">
        <p className="text-green-700 font-semibold">{t("resetPassword.success")}</p>
        <Link
          href="/auth/signin"
          className="inline-block px-6 py-2 rounded bg-gray-800 text-white hover:bg-gray-700"
        >
          {t("common.signIn")}
        </Link>
      </section>
    );
  }

  return (
    <section className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">{t("resetPassword.title")}</h1>
      <p className="text-gray-600 mb-8">{t("resetPassword.subtitle")}</p>

      <form className="space-y-4" onSubmit={onSubmit}>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("auth.passwordMinLength", { min: MIN_PASSWORD_LENGTH })}
          className="w-full border rounded px-3 py-2"
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-800 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? t("common.loading") : t("resetPassword.submit")}
        </button>
      </form>

      {error ? <p className="mt-4 text-red-600">{error}</p> : null}
    </section>
  );
}
