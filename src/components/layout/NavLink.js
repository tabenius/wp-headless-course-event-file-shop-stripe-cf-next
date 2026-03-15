"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, className, activeClassName, children, ...rest }) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    pathname === href.replace(/\/$/, "") ||
    (href !== "/" && pathname.startsWith(href.replace(/\/$/, "")));

  return (
    <Link
      href={href}
      className={`${className}${isActive ? ` ${activeClassName}` : ""}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
