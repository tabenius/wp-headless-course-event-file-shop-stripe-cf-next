"use client";

import { useState } from "react";

export default function CoursePaywall({
  courseUri,
  courseTitle,
  userEmail,
  priceCents,
  currency,
  stripeEnabled,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setError("");
    if (!stripeEnabled) {
      setError("Betalning är inte tillgänglig ännu. Kontakta administratören.");
      return;
    }
    setLoading(true);
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseUri, courseTitle }),
    });
    const json = await response.json();
    setLoading(false);
    if (!response.ok || !json?.ok || !json?.url) {
      setError(json?.error || "Det gick inte att starta betalningen.");
      return;
    }
    window.location.href = json.url;
  }

  return (
    <section className="max-w-2xl mx-auto px-6 py-24 space-y-6 text-center">
      <h1 className="text-4xl font-bold">{courseTitle || "Kurs"}</h1>
      <p className="text-gray-700">
        Du är inloggad som <strong>{userEmail}</strong>, men du har ännu inte
        tillgång till den här kursen.
      </p>
      <p className="text-gray-700">
        Avgift:{" "}
        <strong>
          {(priceCents / 100).toFixed(2)} {currency.toUpperCase()}
        </strong>
      </p>
      <button
        type="button"
        onClick={checkout}
        disabled={loading}
        className="px-8 py-3 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? "Skickar dig till Stripe..." : "Betala och lås upp kursen"}
      </button>
      {error ? <p className="text-red-600">{error}</p> : null}
    </section>
  );
}
