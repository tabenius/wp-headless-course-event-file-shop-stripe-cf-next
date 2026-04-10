"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import NavLink from "./NavLink";
import Link from "next/link";

export default function NavDropdown({
  item,
  className,
  activeClassName,
  dropdownClassName,
}) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);
  const pathname = usePathname();

  const parentHref = item.href && item.href !== "#" ? item.href : null;

  const isParentActive =
    parentHref &&
    (pathname === parentHref || pathname === parentHref.replace(/\/$/, ""));
  const isChildActive = (item.children || []).some((child) => {
    const href = child.href;
    return (
      pathname === href ||
      pathname === href.replace(/\/$/, "") ||
      (href !== "/" && pathname.startsWith(href.replace(/\/$/, "")))
    );
  });
  const isActive = isParentActive || isChildActive;

  function clearCloseTimer() {
    clearTimeout(timeoutRef.current);
  }

  function openMenu() {
    clearCloseTimer();
    setOpen(true);
  }

  function closeMenu() {
    clearCloseTimer();
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }

  function closeMenuNow() {
    clearCloseTimer();
    setOpen(false);
  }

  useEffect(() => () => clearCloseTimer(), []);

  const labelContent = (
    <>
      {item.label}
      <svg
        className="inline-block w-3 h-3 ml-0.5 -mt-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </>
  );

  const buttonBaseClass = String(className || "")
    .replace(/\bfont-(?:menu|menu-nested|submenu|submenu-nested)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const buttonClassName = `${buttonBaseClass} font-button text-[13px]`.trim();

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
      onFocusCapture={openMenu}
      onBlurCapture={(event) => {
        if (containerRef.current?.contains(event.relatedTarget)) return;
        closeMenuNow();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          closeMenuNow();
        }
      }}
    >
      {parentHref ? (
        <Link
          href={parentHref}
          className={`${className}${isActive ? ` ${activeClassName}` : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(event) => {
            if (!open) {
              event.preventDefault();
              openMenu();
              return;
            }
            closeMenuNow();
          }}
        >
          {labelContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`${buttonClassName} focus-ring-brand${isActive ? ` ${activeClassName}` : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {labelContent}
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 pt-1 z-50">
          <div className={dropdownClassName} role="menu">
            {parentHref && (
              <NavLink
                href={parentHref}
                className="storefront-nav-dropdown-link storefront-nav-dropdown-link-border block whitespace-nowrap border-b border-[var(--color-muted)] px-4 py-2 font-submenu font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/25"
                activeClassName="text-[var(--color-primary)]"
                onClick={closeMenuNow}
                role="menuitem"
              >
                {item.label}
              </NavLink>
            )}
            {item.children.map((child) => (
              <NavLink
                key={child.href}
                href={child.href}
                className="storefront-nav-dropdown-link block whitespace-nowrap px-4 py-2 font-submenu text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/25"
                activeClassName="text-[var(--color-primary)] font-semibold"
                onClick={closeMenuNow}
                role="menuitem"
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
