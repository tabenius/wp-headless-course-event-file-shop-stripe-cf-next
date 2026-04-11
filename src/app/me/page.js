import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOwnAvatar, listOwnAvatarRelationships } from "@/lib/avatarStore";
import AvatarMePanel from "@/components/profile/AvatarMePanel";
import AvatarProfileOverview from "@/components/profile/AvatarProfileOverview";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Avatar",
  alternates: { canonical: "/me" },
};

export default async function MePage() {
  const session = await auth();
  const user = session?.user || null;
  if (!user?.email) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/me")}`);
  }

  const [avatar, relationshipsOut] = await Promise.all([
    getOwnAvatar(user),
    listOwnAvatarRelationships(user),
  ]);

  return (
    <section className="max-w-4xl mx-auto px-6 py-16 space-y-8">
      <AvatarProfileOverview
        avatar={avatar || { uriId: "", canonicalName: "", isOwner: true }}
        relationshipsOut={relationshipsOut}
        subtitle=""
        footerActions={
          <>
            <Link
              href="/inventory"
              className="inline-flex items-center rounded-xl border border-slate-700 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Inventory
            </Link>
            {avatar?.uriId && avatar?.isPublic ? (
              <Link
                href={`/profile/${encodeURIComponent(avatar.uriId)}`}
                className="inline-flex items-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-600"
              >
                View public profile
              </Link>
            ) : null}
          </>
        }
        actionSectionTitle="Current outgoing relationships"
      />

      <AvatarMePanel
        initialAvatar={avatar}
        initialRelationships={relationshipsOut}
        title="Manage avatar"
        description="Configure your avatar profile, canonical name, visibility, and relationships."
      />
    </section>
  );
}
