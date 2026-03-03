"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
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
        body: JSON.stringify({ email, password }),
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
          required
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-post"
          className="w-full border rounded px-3 py-2"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Lösenord (minst 8 tecken)"
          className="w-full border rounded px-3 py-2"
          minLength={8}
          required
        />

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
