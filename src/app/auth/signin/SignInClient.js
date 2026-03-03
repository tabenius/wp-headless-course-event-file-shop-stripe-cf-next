"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const OAUTH_ORDER = ["google", "apple", "microsoft-entra-id", "facebook"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function providerLabel(providerId) {
  switch (providerId) {
    case "google":
      return "Fortsätt med Google";
    case "apple":
      return "Fortsätt med Apple";
    case "microsoft-entra-id":
      return "Fortsätt med Microsoft";
    case "facebook":
      return "Fortsätt med Facebook";
    default:
      return `Fortsätt med ${providerId}`;
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
      setError("Ange en giltig e-postadress.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Lösenord måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`);
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
      setError(result?.error || "Fel e-postadress eller lösenord.");
      return;
    }
    router.push(callbackUrl);
  }

  async function onSocialSignIn(providerId) {
    window.location.href = `/api/auth/oauth/${providerId}/start?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  function getAuthErrorMessage() {
    if (authError === "provider_unavailable") {
      return "Den valda inloggningstjänsten är inte tillgänglig just nu.";
    }
    if (authError === "provider") {
      return "Den valda inloggningstjänsten är inte tillgänglig just nu.";
    }
    if (authError === "state") {
      return "Inloggningsflödet avbröts. Försök igen.";
    }
    if (authError === "oauth") {
      return "Det gick inte att logga in med extern tjänst just nu.";
    }
    return "";
  }

  const combinedError = error || getAuthErrorMessage();

  return (
    <section className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Logga in</h1>
      <p className="text-gray-600 mb-8">Använd e-post/lösenord eller en inloggningstjänst.</p>

      <form className="space-y-4" onSubmit={onCredentialsSignIn}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-post"
          className="w-full border rounded px-3 py-2"
          autoComplete="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Lösenord"
          className="w-full border rounded px-3 py-2"
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="current-password"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-800 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Loggar in..." : "Logga in med e-post"}
        </button>
      </form>

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
        Har du inget konto än?{" "}
        <Link href="/auth/register" className="text-orange-700 hover:underline">
          Skapa ett
        </Link>
      </p>
    </section>
  );
}
