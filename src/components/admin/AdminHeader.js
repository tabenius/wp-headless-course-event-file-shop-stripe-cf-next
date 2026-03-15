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

          {/* GitHub project */}
          <a
            href="https://github.com/tabenius/wp-headless-course-event-file-shop-stripe-cf-next"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            title="GitHub project"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>

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
