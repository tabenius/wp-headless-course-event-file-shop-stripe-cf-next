"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export default function NavDropdown({ item, className, dropdownClassName }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);

  function enter() {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function leave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={className}
      >
        {item.label}
        <svg
          className="inline-block w-3 h-3 ml-0.5 -mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 pt-1 z-50">
          <div className={dropdownClassName}>
            {item.children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className="block px-4 py-2 text-[13px] font-[family-name:var(--font-montserrat)] hover:bg-[#f0d0d0] whitespace-nowrap"
                onClick={() => setOpen(false)}
              >
                {child.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
