import Link from "next/link";
import site from "@/lib/site";
import { getNavigation } from "@/lib/menu";
import HeaderNavClient from "./HeaderNavClient";

export default async function Header() {
  const navigation = await getNavigation();

  return (
    <header className="fixed left-0 right-0 top-0 z-30 min-h-16 border-b border-[var(--color-muted)] bg-[var(--color-background)] backdrop-blur-sm lg:min-h-[68px]">
      <div className="flex items-center justify-between w-full px-4 lg:px-6 py-2">
        {/* Logo - far left with minimal space */}
        <Link href="/" className="shrink-0 mr-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={site.logoUrl}
            alt={site.shortName}
            className="h-10 lg:h-11 w-auto"
            fetchPriority="high"
          />
        </Link>
        <HeaderNavClient navigation={navigation} />
      </div>
    </header>
  );
}
