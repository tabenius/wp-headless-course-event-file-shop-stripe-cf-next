import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="max-w-2xl mx-auto px-6 py-24 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-gray-500">404</p>
      <h1 className="mt-3 text-4xl font-bold text-gray-900">Sidan hittades inte</h1>
      <p className="mt-4 text-lg text-gray-700">
        Sidan du försökte nå finns inte eller är inte längre tillgänglig.
      </p>
      <Link
        href="/"
        className="inline-block mt-8 px-6 py-3 font-semibold rounded bg-gray-800 hover:bg-gray-700 text-white shop-cta"
      >
        Till startsidan
      </Link>
    </section>
  );
}
