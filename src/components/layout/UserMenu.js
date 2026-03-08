"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export default function UserMenu({ isLoggedIn, signOutButton }) {
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
    "block px-4 py-2 text-[13px] font-[family-name:var(--font-montserrat)] text-[#1a1a1a] hover:bg-[#f0d0d0] whitespace-nowrap";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#f0d0d0] transition-colors"
        aria-label="Användarmeny"
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
          className="w-5 h-5"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[#fff1f1] border border-[#f0d0d0] rounded shadow-lg py-1 min-w-[140px] z-50">
          <Link href="/admin" className={itemClass} onClick={() => setOpen(false)}>
            Admin
          </Link>
          {isLoggedIn ? (
            <div onClick={() => setOpen(false)}>{signOutButton}</div>
          ) : (
            <>
              <Link href="/auth/signin" className={itemClass} onClick={() => setOpen(false)}>
                Logga in
              </Link>
              <Link href="/auth/register" className={itemClass} onClick={() => setOpen(false)}>
                Registrera
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
