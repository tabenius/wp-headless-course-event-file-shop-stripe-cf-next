import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAvatarForProfileHandle } from "@/lib/avatarStore";
import AvatarProfileOverview from "@/components/profile/AvatarProfileOverview";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Avatar Profile",
};

export default async function AvatarProfilePage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const rawHandle = typeof params?.username === "string" ? params.username : "";
  const requestedHandle = (() => {
    try {
      return decodeURIComponent(rawHandle).trim();
    } catch {
      return String(rawHandle || "").trim();
    }
  })();
  if (!requestedHandle) notFound();

  const session = await auth();
  const viewerUserId = session?.user?.id || "";
  const avatar = await getAvatarForProfileHandle(requestedHandle, {
    viewerUserId,
  });
  if (!avatar) notFound();

  if (requestedHandle !== avatar.uriId) {
    redirect(avatar.canonicalProfilePath || `/profile/${avatar.uriId}`);
  }

  const relationshipsOut = Array.isArray(avatar.relationshipsOut)
    ? avatar.relationshipsOut
    : [];

  return (
    <section className="max-w-3xl mx-auto px-6 py-16 space-y-6">
      <AvatarProfileOverview
        avatar={avatar}
        relationshipsOut={relationshipsOut}
        subtitle={avatar.isOwner ? "" : "Public avatar profile."}
        footerActions={
          <>
            {avatar.isOwner ? (
              <Link
                href="/me"
                aria-label="Manage avatar"
                title="Manage avatar"
                className="inline-flex h-8 w-8 items-center justify-center text-slate-700 transition-colors hover:text-slate-950"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </Link>
            ) : null}
          </>
        }
      />
    </section>
  );
}
