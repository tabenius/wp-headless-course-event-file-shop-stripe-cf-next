"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/admin", label: "Products", tab: "products" },
  { href: "/admin", label: "Advanced", tab: "advanced" },
  { href: "/admin/docs", label: "Documentation" },
];

export default function AdminHeader({ logoUrl }) {
  const router = useRouter();
  const pathname = usePathname();

  // Don't show admin header on login page
  if (pathname === "/admin/login") return null;

  async function logoutAdmin() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="bg-white border-b sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
        {/* Left: Logo + brand */}
        <div className="flex items-center gap-4">
          {logoUrl && (
            <Link href="/admin">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="h-8 w-auto" />
            </Link>
          )}
          <Link
            href="/admin"
            className="font-serif text-lg font-bold tracking-tight text-gray-900"
            style={{ fontFamily: "var(--font-merriweather), serif" }}
          >
            RAGBAZ Articulate StoreFront
          </Link>
        </div>

        {/* Right: Nav + actions */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              !item.tab && item.href === "/admin"
                ? pathname === "/admin"
                : !item.tab
                  ? pathname.startsWith(item.href)
                  : false;

            if (item.tab) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (pathname !== "/admin") {
                      router.push("/admin");
                    }
                    window.dispatchEvent(
                      new CustomEvent("admin:switchTab", { detail: item.tab }),
                    );
                  }}
                  className="px-3 py-1.5 rounded text-sm transition-colors text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                >
                  {item.label}
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  active
                    ? "bg-gray-100 text-gray-900 font-medium"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Health check icon */}
          <button
            type="button"
            onClick={() => {
              // Scroll to health section or switch tab
              const event = new CustomEvent("admin:showHealth");
              window.dispatchEvent(event);
            }}
            className="p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            title="Integration check"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* Stripe Dashboard */}
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded text-gray-500 hover:text-purple-700 hover:bg-gray-50"
            title="Stripe Dashboard"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M1 4.25a3.733 3.733 0 012.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0016.75 2H3.25A2.25 2.25 0 001 4.25zM1 7.25a3.733 3.733 0 012.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0016.75 5H3.25A2.25 2.25 0 001 7.25zM7 8a1 1 0 000 2h.01a1 1 0 000-2H7zm-2 3.75A2.25 2.25 0 017.25 9.5h5.5a2.25 2.25 0 012.25 2.25v4.5A2.25 2.25 0 0112.75 18.5h-5.5A2.25 2.25 0 015 16.25v-4.5z" />
            </svg>
          </a>

          {/* Sign out */}
          <button
            type="button"
            onClick={logoutAdmin}
            className="ml-2 px-3 py-1.5 rounded border text-sm text-gray-600 hover:bg-gray-50"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
