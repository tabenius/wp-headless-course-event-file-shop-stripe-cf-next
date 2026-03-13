import Link from "next/link";
import { fetchGraphQL } from "@/lib/client";
import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";
import MobileNav from "./MobileNav";
import UserMenu from "./UserMenu";
import DarkModeToggle from "./DarkModeToggle";
import site from "@/lib/site";
import { t } from "@/lib/i18n";
import { getNavigation } from "@/lib/menu";

async function fetchSiteTitle() {
  const data = await fetchGraphQL(
    `{ allSettings { generalSettingsTitle } }`,
    {},
    1800,
  );
  return data?.allSettings?.generalSettingsTitle || site.shortName;
}

export default async function Header() {
  const [session, title, navigation] = await Promise.all([auth(), fetchSiteTitle(), getNavigation()]);
  const menuItemClass =
    "font-[family-name:var(--font-montserrat)] text-[13px] font-normal hover:underline focus:underline whitespace-nowrap";
  const mobileAuthClass =
    "block font-[family-name:var(--font-montserrat)] text-[13px] font-normal py-[6px] border-b border-[#f0d0d0] hover:text-[#6d003e] leading-tight";

  const mobileAuthLinks = session?.user ? (
    <>
      <span className="block text-[13px] font-[family-name:var(--font-montserrat)] text-gray-500 py-[6px]">
        {session.user.name || session.user.email}
      </span>
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
    <SignOutButton className="block px-4 py-2 text-[13px] font-[family-name:var(--font-montserrat)] text-[#1a1a1a] hover:bg-[#f0d0d0] whitespace-nowrap w-full text-left" />
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-[#fff1f1]/90 backdrop-blur-sm min-h-16 lg:min-h-[68px] border-b border-[#333333]">
      <div className="flex items-center justify-between w-full px-4 lg:px-6 py-2">
        {/* Logo - far left with minimal space */}
        <Link href="/" className="shrink-0 mr-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={site.logoUrl}
            alt={title}
            className="h-10 lg:h-11 w-auto"
            fetchPriority="high"
          />
        </Link>

        {/* Desktop navigation + user icon */}
        <div className="hidden lg:flex items-center gap-x-3">
          <nav className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className={menuItemClass}>
                {item.label}
              </Link>
            ))}
          </nav>
          <DarkModeToggle />
          <UserMenu
            isLoggedIn={!!session?.user}
            userName={session?.user?.name || session?.user?.email || ""}
            signOutButton={userMenuSignOut}
          />
        </div>

        {/* Mobile hamburger + slide-out menu */}
        <MobileNav
          items={[...navigation, { href: "/admin", label: t("common.admin") }]}
          authLinks={mobileAuthLinks}
        />
      </div>
    </header>
  );
}
