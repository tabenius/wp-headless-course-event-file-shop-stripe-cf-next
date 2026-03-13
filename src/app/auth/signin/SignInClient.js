"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n";

const OAUTH_ORDER = ["google", "apple", "microsoft-entra-id", "facebook"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function providerLabel(providerId) {
  switch (providerId) {
    case "google":
      return t("auth.continueWithGoogle");
    case "apple":
      return t("auth.continueWithApple");
    case "microsoft-entra-id":
      return t("auth.continueWithMicrosoft");
    case "facebook":
      return t("auth.continueWithFacebook");
    default:
      return t("auth.continueWith", { provider: providerId });
  }
}

export default function SignInClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState([]);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  useEffect(() => {
    let isMounted = true;
    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (isMounted && Array.isArray(json?.oauth)) {
          setProviders(json.oauth);
        }
      })
      .catch(() => {
        if (isMounted) setProviders([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const callbackUrl = searchParams?.get("callbackUrl") || "/";
  const authError = searchParams?.get("error") || "";
  const oauthProviders = OAUTH_ORDER.filter((id) => providers.includes(id));

  async function onCredentialsSignIn(event) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError(t("authErrors.invalidEmail"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("authErrors.passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    setError("");
    setLoading(true);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok || !result?.ok) {
      setError(result?.error || t("authErrors.wrongCredentials"));
      return;
    }
    router.push(callbackUrl);
  }

  async function onSocialSignIn(providerId) {
    window.location.href = `/api/auth/oauth/${providerId}/start?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  function getAuthErrorMessage() {
    if (authError === "provider_unavailable") {
      return t("authErrors.providerUnavailable");
    }
    if (authError === "provider") {
      return t("authErrors.providerUnavailable");
    }
    if (authError === "state") {
      return t("authErrors.authFlowCancelled");
    }
    if (authError === "oauth") {
      return t("authErrors.oauthFailed");
    }
    return "";
  }

  async function onForgotPassword(event) {
    event.preventDefault();
    const normalized = forgotEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      setError(t("authErrors.invalidEmail"));
      return;
    }
    setError("");
    setForgotLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      setForgotMessage(t("resetPassword.emailSent"));
    } catch {
      setForgotMessage(t("resetPassword.emailSent"));
    } finally {
      setForgotLoading(false);
    }
  }

  const combinedError = error || getAuthErrorMessage();

  return (
    <section className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">{t("auth.signInTitle")}</h1>
      <p className="text-gray-600 mb-8">{t("auth.signInSubtitle")}</p>

      {forgotMode ? (
        forgotMessage ? (
          <div className="space-y-4">
            <p className="text-green-700">{forgotMessage}</p>
            <button
              type="button"
              onClick={() => { setForgotMode(false); setForgotMessage(""); }}
              className="text-sm text-gray-600 hover:underline"
            >
              {t("resetPassword.backToSignIn")}
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onForgotPassword}>
            <input
              type="email"
              value={forgotEmail}
              onChange={(event) => setForgotEmail(event.target.value)}
              placeholder={t("common.email")}
              className="w-full border rounded px-3 py-2"
              autoComplete="email"
              required
            />
            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full bg-gray-800 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:opacity-50"
            >
              {forgotLoading ? t("common.loading") : t("resetPassword.sendLink")}
            </button>
            <button
              type="button"
              onClick={() => setForgotMode(false)}
              className="text-sm text-gray-600 hover:underline"
            >
              {t("resetPassword.backToSignIn")}
            </button>
          </form>
        )
      ) : (
        <form className="space-y-4" onSubmit={onCredentialsSignIn}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("common.email")}
            className="w-full border rounded px-3 py-2"
            autoComplete="email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            className="w-full border rounded px-3 py-2"
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="current-password"
            required
          />
          <div className="flex justify-between items-center">
            <button
              type="submit"
              disabled={loading}
              className="bg-gray-800 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? t("auth.signingIn") : t("auth.signInWithEmail")}
            </button>
            <button
              type="button"
              onClick={() => { setForgotMode(true); setForgotEmail(email); setError(""); }}
              className="text-sm text-gray-500 hover:underline"
            >
              {t("resetPassword.forgotPassword")}
            </button>
          </div>
        </form>
      )}

      {oauthProviders.length > 0 ? (
        <div className="mt-8 space-y-3">
          {oauthProviders.map((providerId) => (
            <button
              key={providerId}
              type="button"
              onClick={() => onSocialSignIn(providerId)}
              disabled={loading}
              className="w-full border rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
            >
              {providerLabel(providerId)}
            </button>
          ))}
        </div>
      ) : null}

      {combinedError ? <p className="mt-4 text-red-600">{combinedError}</p> : null}

      <p className="mt-8 text-sm text-gray-600">
        {t("auth.noAccount")}{" "}
        <Link href={`/auth/register${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="text-orange-700 hover:underline">
          {t("auth.createOne")}
        </Link>
      </p>
    </section>
  );
}
