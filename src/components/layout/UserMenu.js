"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";

export default function UserMenu({ isLoggedIn, userName, signOutButton }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const itemClass =
    "block whitespace-nowrap px-4 py-2 font-submenu-13 text-[var(--color-foreground)] hover:bg-[var(--color-muted)]";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="storefront-icon-button flex items-center justify-center w-8 h-8 rounded-full transition-colors"
        aria-label={t("nav.userMenu")}
        aria-expanded={open}
      >
        {/* Head/person SVG icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-[18px] h-[18px]"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded border border-[var(--color-muted)] bg-[var(--color-background)] py-1 shadow-lg">
          {isLoggedIn && userName && (
            <span className="block border-b border-[var(--color-muted)] px-4 py-2 font-submenu-13 text-[var(--color-foreground)]">
              {userName}
            </span>
          )}
          {isLoggedIn && (
            <Link
              href="/me"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {t("common.profile", "Profile")}
            </Link>
          )}
          {isLoggedIn && (
            <Link
              href="/admin"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {t("common.admin")}
            </Link>
          )}
          {isLoggedIn ? (
            <div onClick={() => setOpen(false)}>{signOutButton}</div>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                {t("common.signIn")}
              </Link>
              <Link
                href="/auth/register"
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                {t("common.register")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
