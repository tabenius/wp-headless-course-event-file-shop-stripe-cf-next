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

  const menuItemBaseClass =
    "storefront-mobile-nav-link block font-normal py-[6px] border-b border-[var(--color-muted)] text-[var(--color-foreground)] hover:text-[var(--color-primary)] leading-tight";
  const activeMobileClass = "text-[var(--color-primary)] font-semibold";

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
        className={`storefront-mobile-nav-panel fixed top-0 right-0 z-[9999] h-full w-[min(72vw,288px)] overflow-y-auto bg-[var(--color-background)] text-[var(--color-foreground)] transform transition-transform duration-300 ease-in-out lg:hidden ${
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
                    className={`${menuItemBaseClass} font-menu font-semibold`}
                    activeClassName={activeMobileClass}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ) : (
                  <span
                    className={`${menuItemBaseClass} font-menu font-semibold text-[var(--color-foreground)]`}
                  >
                    {item.label}
                  </span>
                )
              ) : (
                <NavLink
                  href={item.href}
                  className={`${menuItemBaseClass} font-menu`}
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
                  className={`${menuItemBaseClass} pl-4 font-submenu-nested`}
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
            <span className="font-menu">
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
          className={`storefront-mobile-nav-burger-line block h-[2px] w-6 bg-current text-[var(--color-foreground)] transition-transform duration-300 ${
            open ? "translate-y-[7px] rotate-45" : ""
          }`}
        />
        <span
          className={`storefront-mobile-nav-burger-line block h-[2px] w-6 bg-current text-[var(--color-foreground)] transition-opacity duration-300 ${
            open ? "opacity-0" : ""
          }`}
        />
        <span
          className={`storefront-mobile-nav-burger-line block h-[2px] w-6 bg-current text-[var(--color-foreground)] transition-transform duration-300 ${
            open ? "-translate-y-[7px] -rotate-45" : ""
          }`}
        />
      </button>

      {/* Portal overlay + panel to document.body so it escapes header stacking context */}
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
