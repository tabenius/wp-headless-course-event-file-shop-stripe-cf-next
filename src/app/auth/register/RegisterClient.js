"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_WORDS = [
  "omsluten",
  "fitta",
  "kuk",
  "kramar",
  "upptåg",
  "ostmacka",
  "kraft",
  "styrka",
  "modig",
  "anknytning",
  "vatten",
  "eld",
  "luft",
  "jord",
  "omtanke",
  "överlämna",
  "örngott",
  "hem",
  "äventyr",
  "fantasi",
  "dröm",
  "verklighet",
  "tillit",
];

function randomInt(max) {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint32Array(1);
    window.crypto.getRandomValues(bytes);
    return bytes[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function generateMemorablePassword() {
  const selected = [];
  while (selected.length < 4) {
    const word = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)];
    if (!selected.includes(word)) selected.push(word);
  }
  const suffix = String(1000 + randomInt(9000));
  return `${selected.join("-")}-${suffix}`;
}

export default function RegisterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2) {
      setError(t("authErrors.nameTooShort"));
      return;
    }
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

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          email: normalizedEmail,
          password,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        setError(json?.error || t("authErrors.registerFailed"));
        setLoading(false);
        return;
      }

      // Registration sets the session cookie directly — no separate login needed.
      router.push(callbackUrl);
    } catch {
      setError(t("authErrors.registerNetworkError"));
      setLoading(false);
    }
  }

  return (
    <section className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">{t("auth.registerTitle")}</h1>
      <p className="text-gray-600 mb-8">{t("auth.registerSubtitle")}</p>

      <form className="space-y-4" onSubmit={onSubmit}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("auth.fullName")}
          className="w-full border rounded px-3 py-2"
          minLength={2}
          autoComplete="name"
          required
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("common.email")}
          className="w-full border rounded px-3 py-2"
          autoComplete="email"
          required
        />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => {
              setGenerated(false);
              setPassword(event.target.value);
            }}
            placeholder={t("auth.passwordMinLength", {
              min: MIN_PASSWORD_LENGTH,
            })}
            className="w-full border rounded px-3 py-2 pr-10"
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            aria-label={
              showPassword ? t("auth.hidePassword") : t("auth.showPassword")
            }
          >
            {showPassword ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setPassword(generateMemorablePassword());
            setGenerated(true);
            setShowPassword(true);
            setError("");
          }}
          className="w-full border border-teal-700 text-teal-800 rounded px-4 py-2 hover:bg-teal-50"
        >
          {t("auth.generatePassword")}
        </button>
        {generated ? (
          <p className="text-sm text-teal-800">{t("auth.passwordGenerated")}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-800 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {loading && (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? t("auth.registering") : t("common.register")}
        </button>
      </form>

      {error ? <p className="mt-4 text-red-600">{error}</p> : null}

      <p className="mt-8 text-sm text-gray-600">
        {t("auth.haveAccount")}{" "}
        <Link
          href={`/auth/signin${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
          className="text-orange-700 hover:underline"
        >
          {t("common.signIn")}
        </Link>
      </p>
    </section>
  );
}
