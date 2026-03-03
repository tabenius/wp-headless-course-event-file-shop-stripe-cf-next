"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2) {
      setError("Namn måste vara minst 2 tecken.");
      return;
    }
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

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName, email: normalizedEmail, password }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        setError(json?.error || "Registreringen misslyckades.");
        setLoading(false);
        return;
      }

      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const loginJson = await loginResponse.json();
      if (!loginResponse.ok || !loginJson?.ok) {
        setError("Kontot skapades men inloggningen misslyckades. Logga in manuellt.");
        setLoading(false);
        return;
      }

      router.push("/");
    } catch {
      setError("Registreringen misslyckades på grund av ett nätverks- eller serverfel.");
      setLoading(false);
    }
  }

  return (
    <section className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Skapa konto</h1>
      <p className="text-gray-600 mb-8">Registrera dig med e-post och lösenord.</p>

      <form className="space-y-4" onSubmit={onSubmit}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Fullständigt namn"
          className="w-full border rounded px-3 py-2"
          minLength={2}
          autoComplete="name"
          required
        />
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
          onChange={(event) => {
            setGenerated(false);
            setPassword(event.target.value);
          }}
          placeholder="Lösenord (minst 8 tecken)"
          className="w-full border rounded px-3 py-2"
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          required
        />
        <button
          type="button"
          onClick={() => {
            setPassword(generateMemorablePassword());
            setGenerated(true);
            setError("");
          }}
          className="w-full border border-teal-700 text-teal-800 rounded px-4 py-2 hover:bg-teal-50"
        >
          Generera minnesvänligt lösenord
        </button>
        {generated ? <p className="text-sm text-teal-800">Nytt lösenord genererat.</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-800 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Skapar konto..." : "Registrera"}
        </button>
      </form>

      {error ? <p className="mt-4 text-red-600">{error}</p> : null}

      <p className="mt-8 text-sm text-gray-600">
        Har du redan ett konto?{" "}
        <Link href="/auth/signin" className="text-orange-700 hover:underline">
          Logga in
        </Link>
      </p>
    </section>
  );
}
