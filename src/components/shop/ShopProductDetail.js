"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

function formatPrice(priceCents, currency) {
  return `${(priceCents / 100).toFixed(2)} ${String(currency || "SEK").toUpperCase()}`;
}

export default function ShopProductDetail({ user, product, owned, stripeEnabled, checkoutStatus }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    if (!user?.email) {
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(`/shop/${product.slug}`)}`;
      return;
    }
    if (!stripeEnabled) {
      setError("Betalning är inte tillgänglig ännu. Kontakta administratören.");
      return;
    }

    setError("");
    setLoading(true);
    const response = await fetch("/api/digital/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productSlug: product.slug }),
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
    <section className="max-w-4xl mx-auto px-6 py-16 space-y-6">
      <p>
        <Link href="/shop" className="text-sm text-teal-800 hover:underline">
          Tillbaka till shop
        </Link>
      </p>

      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.name}
          width={1400}
          height={700}
          unoptimized
          className="w-full max-h-[420px] object-cover rounded-lg"
        />
      ) : null}

      <h1 className="text-3xl font-bold">{product.name}</h1>
      <p className="text-gray-600">{product.description}</p>
      <p className="text-gray-700 font-semibold">Pris: {formatPrice(product.priceCents, product.currency)}</p>

      {checkoutStatus === "success" ? (
        <p className="text-green-700">Betalningen registrerades. Produkten är nu upplåst.</p>
      ) : null}
      {checkoutStatus === "cancel" ? (
        <p className="text-yellow-700">Betalningen avbröts.</p>
      ) : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {owned ? (
        product.type === "digital_file" ? (
          <a
            href={`/api/digital/download?productId=${encodeURIComponent(product.id)}`}
            className="inline-block px-5 py-3 rounded bg-teal-700 text-white hover:bg-teal-600"
          >
            Ladda ner fil
          </a>
        ) : (
          <div className="rounded border border-teal-200 bg-teal-50 p-5 space-y-3">
            <h2 className="text-xl font-semibold text-teal-900">Så får du åtkomst till kursen</h2>
            <p className="text-teal-900">
              Du har köpt kursprodukten. Logga in med samma e-postadress som du använde vid betalning.
            </p>
            <p className="text-teal-900">
              Gå sedan till kursens sida och öppna innehållet. Om åtkomst saknas, vänta någon minut och ladda om sidan.
            </p>
            {product.courseUri ? (
              <p>
                <Link href={product.courseUri} className="text-teal-900 underline font-semibold">
                  Öppna kurs: {product.courseUri}
                </Link>
              </p>
            ) : null}
          </div>
        )
      ) : (
        <button
          type="button"
          onClick={startCheckout}
          disabled={loading}
          className="px-5 py-3 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Skickar till Stripe..." : "Köp produkt"}
        </button>
      )}
    </section>
  );
}
