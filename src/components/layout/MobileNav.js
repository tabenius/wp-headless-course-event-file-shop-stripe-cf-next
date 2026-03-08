"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function MobileNav({ items, authLinks }) {
  const [open, setOpen] = useState(false);

  // Close menu on route change (link click)
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const menuItemClass =
    "block font-[family-name:var(--font-montserrat)] text-[16px] font-normal py-3 border-b border-[#f0d0d0] hover:text-[#6d003e]";

  return (
    <>
      {/* Hamburger button - visible on mobile/tablet, hidden on desktop */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="lg:hidden relative z-50 flex flex-col justify-center items-center w-10 h-10 gap-[5px]"
        aria-label={open ? "Stäng meny" : "Öppna meny"}
        aria-expanded={open}
      >
        <span
          className={`block w-6 h-[2px] bg-[#1a1a1a] transition-transform duration-300 ${
            open ? "translate-y-[7px] rotate-45" : ""
          }`}
        />
        <span
          className={`block w-6 h-[2px] bg-[#1a1a1a] transition-opacity duration-300 ${
            open ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block w-6 h-[2px] bg-[#1a1a1a] transition-transform duration-300 ${
            open ? "-translate-y-[7px] -rotate-45" : ""
          }`}
        />
      </button>

      {/* Mobile menu overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[998] lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile menu panel */}
      <nav
        className={`fixed top-0 right-0 h-full w-72 bg-[#fff1f1] z-[999] transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex justify-end p-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-10 h-10 flex items-center justify-center text-2xl"
            aria-label="Stäng meny"
          >
            &times;
          </button>
        </div>
        <div className="px-6 pb-8">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={menuItemClass}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {authLinks}
        </div>
      </nav>
    </>
  );
}
