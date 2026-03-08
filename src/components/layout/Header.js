import Link from "next/link";
import { fetchGraphQL } from "@/lib/client";
import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";

async function fetchBlogTitle() {
  const query = `
        query GetBlogTitle {
            allSettings {
                generalSettingsTitle
            }
        }
    `;
  const data = await fetchGraphQL(query, {}, 86400);
  return data?.allSettings?.generalSettingsTitle || "Blog";
}

export default async function Header() {
  const session = await auth();
  const blogTitle = await fetchBlogTitle();
  const menuItemClass = "text-lg hover:underline focus:underline";

  return (
    <header className="bg-gray-800 text-white py-4 px-8 mb-8">
      <div className="flex flex-col md:flex-row justify-between items-center max-w-4xl mx-auto">
        <h1 className="text-3xl font-semibold w-full md:w-auto mb-4 md:mb-0 text-center md:text-left">
          <Link href="/" className="hover:underline focus:underline">
            {blogTitle}
          </Link>
        </h1>

        <nav className="space-x-6 w-full md:w-auto text-center md:text-left">
          <Link href="/kurser-events" className={menuItemClass}>
            Kurser &amp; Events
          </Link>
          <Link href="/behandlingar" className={menuItemClass}>
            Tantrisk massage
          </Link>
          <Link href="/om-sofia-cerne" className={menuItemClass}>
            Om Sofia
          </Link>
          <Link href="/blog-section" className={menuItemClass}>
            Blog
          </Link>
          <Link href="/relationsterapi-for-par" className={menuItemClass}>
            Utveckling för par
          </Link>
          <Link href="/events/event" className={menuItemClass}>
            Evenemang
          </Link>
          <Link href="/butik" className={menuItemClass}>
            Butik
          </Link>
          <Link href="/courses" className={menuItemClass}>
            Onlinekurser
          </Link>
          <Link href="/admin" className={menuItemClass}>
            Admin
          </Link>
          {session?.user ? (
            <SignOutButton className={menuItemClass} />
          ) : (
            <>
              <Link href="/auth/signin" className={menuItemClass}>
                Logga in
              </Link>
              <Link href="/auth/register" className={menuItemClass}>
                Registrera
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
