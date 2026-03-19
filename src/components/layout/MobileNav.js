"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import NavLink from "./NavLink";
import DarkModeToggle from "./DarkModeToggle";
import { t } from "@/lib/i18n";

export default function MobileNav({ items, authLinks }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const menuItemClass =
    "block font-[family-name:var(--font-montserrat)] text-[13px] font-normal py-[6px] border-b border-[#f0d0d0] hover:text-[#6d003e] leading-tight";
  const activeMobileClass = "text-[#6d003e] font-semibold";

  const overlay = (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[9998] lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <nav
        className={`fixed top-0 right-0 h-full w-[min(72vw,288px)] bg-[#fff1f1] z-[9999] transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex justify-end p-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center text-xl"
            aria-label={t("nav.closeMenu")}
          >
            &times;
          </button>
        </div>
        <div className="px-5 pb-4">
          {items.map((item) => (
            <div key={item.href}>
              {item.children?.length > 0 ? (
                item.href && item.href !== "#" ? (
                  <NavLink
                    href={item.href}
                    className={`${menuItemClass} font-semibold`}
                    activeClassName={activeMobileClass}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ) : (
                  <span
                    className={`${menuItemClass} text-gray-700 font-semibold`}
                  >
                    {item.label}
                  </span>
                )
              ) : (
                <NavLink
                  href={item.href}
                  className={menuItemClass}
                  activeClassName={activeMobileClass}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </NavLink>
              )}
              {item.children?.map((child) => (
                <NavLink
                  key={child.href}
                  href={child.href}
                  className={`${menuItemClass} pl-4 text-[12px]`}
                  activeClassName={activeMobileClass}
                  onClick={() => setOpen(false)}
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="flex items-center gap-2 py-2">
            <DarkModeToggle />
            <span className="text-[13px] font-[family-name:var(--font-montserrat)]">
              {t("darkMode.label")}
            </span>
          </div>
          {authLinks}
        </div>
      </nav>
    </>
  );

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="lg:hidden flex flex-col justify-center items-center w-10 h-10 gap-[5px]"
        aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
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

      {/* Portal overlay + panel to document.body so it escapes header stacking context */}
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
