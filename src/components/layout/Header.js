import Link from "next/link";
import { fetchGraphQL } from "@/lib/client";
import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";
import MobileNav from "./MobileNav";
import UserMenu from "./UserMenu";
import DarkModeToggle from "./DarkModeToggle";
import site from "@/lib/site";

async function fetchSiteTitle() {
  const data = await fetchGraphQL(
    `{ allSettings { generalSettingsTitle } }`,
    {},
    86400,
  );
  return data?.allSettings?.generalSettingsTitle || site.shortName;
}

export default async function Header() {
  const [session, title] = await Promise.all([auth(), fetchSiteTitle()]);
  const menuItemClass =
    "font-[family-name:var(--font-montserrat)] text-[13px] font-normal hover:underline focus:underline whitespace-nowrap";
  const mobileAuthClass =
    "block font-[family-name:var(--font-montserrat)] text-[13px] font-normal py-[6px] border-b border-[#f0d0d0] hover:text-[#6d003e] leading-tight";

  const mobileAuthLinks = session?.user ? (
    <SignOutButton className={mobileAuthClass} />
  ) : (
    <>
      <Link href="/auth/signin" className={mobileAuthClass}>
        Logga in
      </Link>
      <Link href="/auth/register" className={mobileAuthClass}>
        Registrera
      </Link>
    </>
  );

  const userMenuSignOut = (
    <SignOutButton className="block px-4 py-2 text-[13px] font-[family-name:var(--font-montserrat)] text-[#1a1a1a] hover:bg-[#f0d0d0] whitespace-nowrap w-full text-left" />
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-[#fff1f1]/90 backdrop-blur-sm h-16 lg:h-[68px]">
      <div className="flex items-center justify-between h-full max-w-6xl mx-auto px-4 lg:px-6">
        {/* Logo - top left */}
        <Link href="/" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={site.logoUrl}
            alt={title}
            className="h-10 lg:h-11 w-auto"
            fetchPriority="high"
          />
        </Link>

        {/* Desktop navigation + user icon */}
        <div className="hidden lg:flex items-center gap-x-4">
          <nav className="flex items-center gap-x-4">
            {site.navigation.map((item) => (
              <Link key={item.href} href={item.href} className={menuItemClass}>
                {item.label}
              </Link>
            ))}
          </nav>
          <DarkModeToggle />
          <UserMenu
            isLoggedIn={!!session?.user}
            signOutButton={userMenuSignOut}
          />
        </div>

        {/* Mobile hamburger + slide-out menu */}
        <MobileNav
          items={[...site.navigation, { href: "/admin", label: "Admin" }]}
          authLinks={mobileAuthLinks}
        />
      </div>
    </header>
  );
}
