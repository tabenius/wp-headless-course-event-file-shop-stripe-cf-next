"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import NavLink from "./NavLink";
import Link from "next/link";

export default function NavDropdown({ item, className, activeClassName, dropdownClassName }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);
  const pathname = usePathname();

  const parentHref = item.href && item.href !== "#" ? item.href : null;

  // Highlight if parent or any child matches the current path
  const isParentActive = parentHref && (
    pathname === parentHref ||
    pathname === parentHref.replace(/\/$/, "")
  );
  const isChildActive = (item.children || []).some((child) => {
    const href = child.href;
    return (
      pathname === href ||
      pathname === href.replace(/\/$/, "") ||
      (href !== "/" && pathname.startsWith(href.replace(/\/$/, "")))
    );
  });
  const isActive = isParentActive || isChildActive;

  function enter() {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function leave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // Parent label: clickable link if it has an href, otherwise a toggle button.
  // Hover always opens the dropdown; click navigates (link) or toggles (button).
  const labelContent = (
    <>
      {item.label}
      <svg
        className="inline-block w-3 h-3 ml-0.5 -mt-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    </>
  );

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {parentHref ? (
        <Link
          href={parentHref}
          className={`${className}${isActive ? ` ${activeClassName}` : ""}`}
        >
          {labelContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`${className}${isActive ? ` ${activeClassName}` : ""}`}
        >
          {labelContent}
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 pt-1 z-50">
          <div className={dropdownClassName}>
            {/* Include parent page in dropdown for touch devices */}
            {parentHref && (
              <NavLink
                href={parentHref}
                className="block px-4 py-2 text-[13px] font-[family-name:var(--font-montserrat)] font-semibold hover:bg-[#f0d0d0] whitespace-nowrap border-b border-[#f0d0d0]"
                activeClassName="text-[#6d003e]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            )}
            {item.children.map((child) => (
              <NavLink
                key={child.href}
                href={child.href}
                className="block px-4 py-2 text-[13px] font-[family-name:var(--font-montserrat)] hover:bg-[#f0d0d0] whitespace-nowrap"
                activeClassName="text-[#6d003e] font-semibold"
                onClick={() => setOpen(false)}
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
