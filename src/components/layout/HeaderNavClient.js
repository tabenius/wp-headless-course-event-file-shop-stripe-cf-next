"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MobileNav from "./MobileNav";
import UserMenu from "./UserMenu";
import DarkModeToggle from "./DarkModeToggle";
import SignOutButton from "./SignOutButton";
import NavLink from "./NavLink";
import NavDropdown from "./NavDropdown";
import { t } from "@/lib/i18n";

function normalizeNavigation(input) {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof item.href === "string" &&
      typeof item.label === "string",
  );
}

export default function HeaderNavClient({ navigation = [] }) {
  const [session, setSession] = useState(null);
  const navBase = useMemo(() => normalizeNavigation(navigation), [navigation]);
  const user = session?.user || null;
  const isLoggedIn = Boolean(user?.email);
  const navItems = useMemo(() => {
    if (!isLoggedIn) return navBase;
    return [
      ...navBase,
      {
        href: "/inventory",
        label: t("common.inventory", "Inventory"),
      },
    ];
  }, [isLoggedIn, navBase]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        if (!active) return;
        setSession(json?.session || null);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const menuItemClass =
    "font-submenu text-[13px] font-normal text-[var(--color-foreground)] hover:underline focus:underline whitespace-nowrap";
  const activeMenuClass =
    "text-[var(--color-primary)] underline underline-offset-4 decoration-2 decoration-[var(--color-primary)]";
  const mobileAuthClass =
    "block text-[13px] font-submenu font-normal py-[6px] border-b border-[var(--color-muted)] hover:text-[var(--color-primary)] leading-tight";

  const mobileAuthLinks = isLoggedIn ? (
    <>
      <span className="block text-[13px] font-submenu text-gray-500 py-[6px]">
        {user.name || user.email}
      </span>
      <Link href="/me" className={mobileAuthClass}>
        {t("common.profile", "Profile")}
      </Link>
      <SignOutButton className={mobileAuthClass} />
    </>
  ) : (
    <>
      <Link href="/auth/signin" className={mobileAuthClass}>
        {t("common.signIn")}
      </Link>
      <Link href="/auth/register" className={mobileAuthClass}>
        {t("common.register")}
      </Link>
    </>
  );

  const userMenuSignOut = (
    <SignOutButton className="block w-full whitespace-nowrap px-4 py-2 text-left text-[13px] font-submenu text-[var(--color-foreground)] hover:bg-[var(--color-muted)]" />
  );

  return (
    <>
      <div className="hidden lg:flex items-center gap-x-3">
        <nav className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {navItems.map((item) =>
            item.children?.length > 0 ? (
              <NavDropdown
                key={item.href}
                item={item}
                className={menuItemClass}
                activeClassName={activeMenuClass}
                dropdownClassName="storefront-nav-dropdown min-w-[180px] rounded border border-[var(--color-muted)] bg-[var(--color-background)] py-1 shadow-lg"
              />
            ) : (
              <NavLink
                key={item.href}
                href={item.href}
                className={menuItemClass}
                activeClassName={activeMenuClass}
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <DarkModeToggle />
        <UserMenu
          isLoggedIn={isLoggedIn}
          userName={user?.name || user?.email || ""}
          signOutButton={userMenuSignOut}
        />
      </div>

      <MobileNav
        items={[...navItems, { href: "/admin", label: t("common.admin") }]}
        authLinks={mobileAuthLinks}
      />
    </>
  );
}
